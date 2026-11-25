import {
  downloadMediaMessage,
  MEDIA_PATH_MAP,
  prepareWAMessageMedia,
  proto,
  WAMessage,
  WASocket
} from '@whiskeysockets/baileys'
import { execFile } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { bot } from '../config'
import { getLogger } from './logger'
import { buildStickerMessage, MAX_ANIMATED_BYTES, StickerMeta } from './stickerEncoder'

const logger = getLogger()

type Uploader = (filePath: string, options: Record<string, unknown>) => Promise<unknown>

interface StickerMessageWithAudio {
  isAnimated?: boolean | null
  audioMessage?: unknown
}

interface PreparedStickerMessage {
  stickerMessage?: StickerMessageWithAudio
}

// waUploadToServer não aparece nos tipos públicos do socket, mas existe em runtime
const getUploader = (client: WASocket): Uploader =>
  (client as unknown as { waUploadToServer: Uploader }).waUploadToServer


export const AUDIO_STICKER_MAX_SECONDS = 10

export class VideoHasNoAudioError extends Error {
  constructor() {
    super('O vídeo não tem áudio.')
    this.name = 'VideoHasNoAudioError'
  }
}

export class AudioStickerTooLargeError extends Error {
  constructor() {
    super('A figurinha ficou maior que o limite do WhatsApp.')
    this.name = 'AudioStickerTooLargeError'
  }
}

// Executa o ffmpeg e devolve o stderr em caso de falha
const runFfmpeg = (args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024
    }, (error, _stdout, stderr) => {
      if (error) {
        const details = String(stderr || '').split('\n').slice(-4).join(' ').trim()
        reject(new Error(details || error.message))
        return
      }
      resolve()
    })
  })
}

// Executa o ffmpeg e devolve o stdout como Buffer (usado para extrair o PCM do waveform)
const runFfmpegBuffer = (args: string[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, {
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      // o Node aceita 'buffer', mas os tipos não expõem
      encoding: 'buffer' as unknown as BufferEncoding
    }, (error, stdout, stderr) => {
      if (error) {
        const details = String(stderr || '').split('\n').slice(-4).join(' ').trim()
        reject(new Error(details || error.message))
        return
      }
      resolve(stdout as unknown as Buffer)
    })
  })
}

// O WhatsApp só reproduz o áudio do sticker se ele for enviado pela rota de voice note (/mms/ptt)
let mediaPathPatched = false
const patchMediaPath = () => {
  if (mediaPathPatched) return
  const paths = MEDIA_PATH_MAP as Record<string, string>
  if (!paths.ptt) paths.ptt = '/mms/ptt'
  mediaPathPatched = true
}

// Os campos de sound sticker não existem no proto gerado do Baileys: ensinamos o encoder a gravá-los.
// O patch é global e só pode rodar uma vez, senão o campo é codificado várias vezes e o payload quebra.
let protoPatched = false
export const patchAudioStickerProto = (): boolean => {
  if (protoPatched) return true

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = proto.Message as any
  if (!message.StickerMessage || !message.AudioMessage || !message.FutureProofMessage) {
    logger.warn('[AUDIO-STICKER] Proto do Baileys sem StickerMessage/AudioMessage/FutureProofMessage; usando fallback')
    return false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addField = (type: any, field: string, tag: number, schema: any) => {
    const original = type.encode
    type.encode = function (value: typeof type, writer: unknown) {
      if (!value || !value[field]) return original.call(type, value, writer)
      const nested = original.call(type, value, writer).uint32(tag).fork()
      return schema.encode(value[field], nested).ldelim()
    }
  }

  // Message.audioStickerMessage (campo 134) e StickerMessage.audioMessage (campo 26)
  addField(message, 'audioStickerMessage', 1074, message.FutureProofMessage)
  addField(message.StickerMessage, 'audioMessage', 210, message.AudioMessage)

  protoPatched = true
  return true
}

// Vídeo -> OGG Opus no formato de voice note + waveform de 64 barras
export const extractAudio = async (
  video: Buffer,
  seconds: number
): Promise<{ ogg: Buffer; waveform: Uint8Array }> => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sb-audio-sticker-'))
  try {
    const input = path.join(dir, 'input.mp4')
    const output = path.join(dir, 'output.ogg')
    await fs.promises.writeFile(input, video)

    try {
      await runFfmpeg([
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', input,
        '-t', String(seconds),
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-c:a', 'libopus',
        '-b:a', '16k',
        '-application', 'voip',
        output
      ])
    } catch (error) {
      logger.warn(`[AUDIO-STICKER] Falha ao extrair áudio: ${error}`)
      throw new VideoHasNoAudioError()
    }

    const ogg = await fs.promises.readFile(output)
    if (!ogg.length) throw new VideoHasNoAudioError()

    return { ogg,
      waveform: await buildWaveform(output) }
  } finally {
    await fs.promises.rm(dir, { recursive: true,
      force: true }).catch(() => undefined)
  }
}

// 64 barras (0-100), como o WhatsApp desenha nas notas de voz
export const buildWaveform = async (oggPath: string): Promise<Uint8Array> => {
  const stdout = await runFfmpegBuffer([
    '-hide_banner', '-loglevel', 'error',
    '-i', oggPath,
    '-ac', '1',
    '-ar', '8000',
    '-f', 's16le',
    '-'
  ])

  const total = stdout.length >> 1
  if (!total) return Uint8Array.from({ length: 64 }, () => 0)

  const samples = new Int16Array(total)
  for (let i = 0; i < total; i++) samples[i] = stdout.readInt16LE(i * 2)

  const block = Math.max(1, Math.floor(total / 64))
  const bars = Array.from({ length: 64 }, (_, index) => {
    let sum = 0
    for (let i = index * block; i < (index + 1) * block && i < total; i++) sum += Math.abs(samples[i])
    return sum / block
  })
  const peak = Math.max(...bars) || 1

  return Uint8Array.from(bars, (bar) => Math.round((bar / peak) * 100))
}

const prepareAudioMessage = async (
  client: WASocket,
  ogg: Buffer,
  waveform: Uint8Array,
  seconds: number
): Promise<proto.Message.IAudioMessage | null | undefined> => {
  patchMediaPath()

  const prepared = await prepareWAMessageMedia({
    audio: ogg,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true,
    seconds,
    waveform
  } as never, {
    // Força o upload pela rota de PTT; sem isso o sticker chega sem som
    upload: (file: string, options: Record<string, unknown>) =>
      getUploader(client)(file, {
        ...options,
        mediaType: 'ptt'
      })
  } as never)

  return prepared.audioMessage
}

const sendAudioStickerMessage = async (
  client: WASocket,
  jid: string,
  sticker: Buffer,
  audioMessage: proto.Message.IAudioMessage | null | undefined,
  animated: boolean
) => {
  const prepared = await prepareWAMessageMedia({ sticker } as never, {
    upload: getUploader(client)
  } as never) as unknown as PreparedStickerMessage

  if (!prepared?.stickerMessage) throw new Error('Falha ao preparar a figurinha')

  if (animated) prepared.stickerMessage.isAnimated = true
  prepared.stickerMessage.audioMessage = audioMessage

  // O wrapper mantém a mensagem preparada como protótipo (mesmo formato que o WhatsApp aceita)
  const payload = Object.assign(Object.create(prepared), {
    audioStickerMessage: { message: prepared },
    messageContextInfo: { messageSecret: crypto.randomBytes(32) }
  })

  await client.relayMessage(jid, payload as unknown as proto.IMessage, {})
}

const sendFallback = async (
  client: WASocket,
  jid: string,
  sticker: Buffer,
  ogg: Buffer,
  quoted: WAMessage
) => {
  await client.sendMessage(jid, { sticker }, { quoted })
  await client.sendMessage(
    jid,
    {
      audio: ogg,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    },
    { quoted }
  )
  await client.sendMessage(
    jid,
    {
      text: '⚠ Seu aparelho (ou o de quem recebe) pode não suportar figurinha com som, ' +
        'então enviei a figurinha e o áudio separados.'
    },
    { quoted }
  )
}

export interface MakeAudioStickerOptions {
  client: WASocket
  jid: string
  mediaMessage: WAMessage
  video: proto.Message.IVideoMessage
  meta: StickerMeta
}

/**
 * Cria e envia uma figurinha animada com o áudio do vídeo.
 * @returns true se o sound sticker foi enviado; false se caiu no fallback.
 */
export const makeAudioSticker = async ({
  client,
  jid,
  mediaMessage,
  video,
  meta
}: MakeAudioStickerOptions): Promise<boolean> => {
  const started = Date.now()

  const videoBuffer = <Buffer>await downloadMediaMessage(mediaMessage, 'buffer', {})
  if (!videoBuffer?.length) throw new Error('Não foi possível baixar o vídeo')

  const seconds = Math.min(
    Math.max(Number(video.seconds) || AUDIO_STICKER_MAX_SECONDS, 1),
    AUDIO_STICKER_MAX_SECONDS
  )

  const { sticker } = await buildStickerMessage(videoBuffer, meta)
  if (sticker.length > MAX_ANIMATED_BYTES) throw new AudioStickerTooLargeError()

  const { ogg, waveform } = await extractAudio(videoBuffer, seconds)

  if (bot.audioStickerForceFallback) {
    logger.info('[AUDIO-STICKER] Fallback forçado por configuração')
    await sendFallback(client, jid, sticker, ogg, mediaMessage)
    return false
  }

  if (!patchAudioStickerProto()) {
    await sendFallback(client, jid, sticker, ogg, mediaMessage)
    return false
  }

  try {
    const audioMessage = await prepareAudioMessage(client, ogg, waveform, seconds)
    await sendAudioStickerMessage(client, jid, sticker, audioMessage, true)

    logger.info(
      `[AUDIO-STICKER] vídeo ${Math.round(videoBuffer.length / 1024)} KB -> ` +
      `sticker ${Math.round(sticker.length / 1024)} KB + áudio ${Math.round(ogg.length / 1024)} KB ` +
      `em ${Date.now() - started} ms`
    )
    return true
  } catch (error) {
    logger.warn(`[AUDIO-STICKER] Falha ao enviar sound sticker, usando fallback: ${error}`)
    await sendFallback(client, jid, sticker, ogg, mediaMessage)
    return false
  }
}
