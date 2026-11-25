/**
 * Testa o pipeline de figurinha com áudio sem conectar no WhatsApp.
 *
 * Uso: npm run test:audio-sticker
 *
 * Requisitos: ffmpeg no PATH (com libwebp e libopus).
 */
import { proto } from '@whiskeysockets/baileys'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

import {
  AUDIO_STICKER_MAX_SECONDS,
  extractAudio,
  patchAudioStickerProto
} from '../src/handlers/audioSticker'
import { buildStickerMessage, MAX_ANIMATED_BYTES } from '../src/handlers/stickerEncoder'

const run = promisify(execFile)

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
  console.log(`  ok - ${message}`)
}

const makeTestVideo = async (dir: string): Promise<string> => {
  const output = path.join(dir, 'test.mp4')
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x320:rate=15:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    output
  ])
  return output
}

const main = async () => {
  const tmpRoot = path.join(os.tmpdir(), 'sb-audio-sticker-selftest')
  await fs.promises.rm(tmpRoot, { recursive: true, force: true })
  await fs.promises.mkdir(tmpRoot, { recursive: true })

  // Diretórios temporários criados pelo handler durante o teste
  const listHandlerTempDirs = () =>
    fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('sb-audio-sticker-'))

  try {
    console.log('1. Gerando vídeo sintético (3s, com áudio)...')
    const videoPath = await makeTestVideo(tmpRoot)
    const video = await fs.promises.readFile(videoPath)
    assert(video.length > 0, 'vídeo de teste gerado')

    console.log('2. Gerando figurinha animada (WebP 512x512)...')
    const { sticker } = await buildStickerMessage(video, { author: 'teste', pack: 'teste' })
    assert(sticker.subarray(0, 4).toString('ascii') === 'RIFF', 'sticker começa com RIFF')
    assert(sticker.subarray(8, 12).toString('ascii') === 'WEBP', 'sticker é WebP')
    assert(sticker.length <= MAX_ANIMATED_BYTES, `sticker tem ${Math.round(sticker.length / 1024)} KB (<= limite)`)

    console.log('3. Extraindo áudio em Opus/PTT e calculando waveform...')
    const tempDirsBefore = listHandlerTempDirs()
    const { ogg, waveform } = await extractAudio(video, 3)
    const tempDirsAfter = listHandlerTempDirs()

    assert(ogg.subarray(0, 4).toString('ascii') === 'OggS', 'áudio começa com OggS')
    assert(ogg.includes(Buffer.from('OpusHead')), 'áudio contém trilha Opus')
    assert(waveform.length === 64, 'waveform tem 64 barras')
    assert(waveform.every((value) => value >= 0 && value <= 100), 'waveform está entre 0 e 100')
    assert(Math.max(...waveform) > 0, 'waveform não está vazio')
    assert(
      tempDirsAfter.length === tempDirsBefore.length,
      'nenhum diretório temporário ficou para trás'
    )
    assert(AUDIO_STICKER_MAX_SECONDS === 10, 'limite de 10s configurado')

    console.log('4. Aplicando patch do proto (sound sticker)...')
    assert(patchAudioStickerProto(), 'patch do proto aplicado')
    assert(patchAudioStickerProto(), 'patch é idempotente')

    console.log('5. Validando os campos 26 (StickerMessage) e 134 (Message) no payload...')
    const message = proto.Message.fromObject({
      stickerMessage: { url: 'https://example.com/sticker.webp', fileSha256: Buffer.alloc(32) },
      messageContextInfo: { messageSecret: Buffer.alloc(32) }
    }) as unknown as proto.Message & {
      stickerMessage: proto.Message.IStickerMessage & { audioMessage?: proto.Message.IAudioMessage }
    }
    const audioMessage = proto.Message.AudioMessage.fromObject({
      url: 'https://example.com/audio.ogg',
      fileSha256: Buffer.alloc(32),
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    })
    message.stickerMessage.audioMessage = audioMessage
    const payload = Object.assign(Object.create(message), {
      audioStickerMessage: { message },
      messageContextInfo: { messageSecret: Buffer.alloc(32) }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const encoded = proto.Message.encode(payload as any).finish()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const encodedAgain = proto.Message.encode(payload as any).finish()
    const hasBytes = (bytes: Buffer, tag: number[]) => {
      for (let i = 0; i <= bytes.length - tag.length; i++) {
        if (tag.every((value, offset) => bytes[i + offset] === value)) return true
      }
      return false
    }
    assert(hasBytes(encoded, [0xd2, 0x01]), 'payload contém o campo 26 (audioMessage)')
    assert(hasBytes(encoded, [0xb2, 0x08]), 'payload contém o campo 134 (audioStickerMessage)')
    assert(encoded.length === encodedAgain.length, 'encode do patch é estável (sem campo duplicado)')

    console.log('\nTudo certo! Pipeline de figurinha com áudio validado.')
  } finally {
    await fs.promises.rm(tmpRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('\nFALHOU:', error)
  process.exit(1)
})
