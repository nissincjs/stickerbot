import { extractMessageContent, GroupMetadata } from '@whiskeysockets/baileys'
import path from 'path'

import { getClient } from '../bot'
import { bot, stickerMeta } from '../config'
import { AudioStickerTooLargeError, makeAudioSticker, VideoHasNoAudioError } from '../handlers/audioSticker'
import { getLogger } from '../handlers/logger'
import { StickerBotCommand } from '../types/Command'
import { WAMessageExtended } from '../types/Message'
import { getQuotedMessage, react, sendMessage } from '../utils/baileysHelper'
import { checkCommand } from '../utils/commandValidator'
import { emojis } from '../utils/emojis'
import { capitalize, getRandomItemFromArray, spintax } from '../utils/misc'

// Gets the logger
const logger = getLogger()

// Gets the extension of this file, to dynamically import '.ts' if in development and '.js' if in production
const extension = __filename.endsWith('.js') ? '.js' : '.ts'

// Gets the file name without the .ts/.js extension
const commandName = capitalize(path.basename(__filename, extension))

// Command settings:
export const command: StickerBotCommand = {
  name: commandName,
  aliases: ['figaudio', 'figsom', 'audiosticker', 'figurinhaaudio'],
  desc: 'Cria uma figurinha animada usando o áudio de um vídeo.',
  example: '(responda a um vídeo ou envie o vídeo com este comando na legenda)',
  needsPrefix: true,
  inMaintenance: false,
  runInPrivate: true,
  runInGroups: true,
  onlyInBotGroup: false,
  onlyBotAdmin: false,
  onlyAdmin: false,
  onlyVip: false,
  botMustBeAdmin: false,
  interval: 30,
  limiter: {}, // do not touch this
  run: async (
    jid: string,
    sender: string,
    message: WAMessageExtended,
    alias: string,
    body: string,
    group: GroupMetadata | undefined,
    isBotAdmin: boolean,
    isVip: boolean,
    isGroupAdmin: boolean,
    amAdmin: boolean
  ) => {
    const check = await checkCommand(jid, message, alias, group, isBotAdmin, isVip, isGroupAdmin, amAdmin, command)
    if (!check) return

    const replies = {
      DISABLED: '⚠ {Ei|Ops|Opa}, a criação de figurinha com áudio {está|tá} desativada no momento!',
      MISSING_VIDEO: `⚠ {Ei|Ops|Opa|Desculpe|Foi mal}, {para|pra} usar o comando *${alias}* ` +
        '{você|vc|tu} {deve|precisa} responder a um *vídeo* com som (ou enviar o vídeo com o comando na legenda).',
      NO_AUDIO: '{Poxa|Eita|Ops}, esse vídeo {não tem|não possui} áudio nenhum. ' +
        'Manda um vídeo com som que eu faço a figurinha!',
      TOO_LARGE: '{Eita|Poxa|Ops}, esse vídeo é {pesado|grande} demais e a figurinha passou do limite do WhatsApp. ' +
        'Tenta um vídeo mais curto ou com menos movimento.',
      UNKNOWN_ERROR: '{Foi mal|Ops|Eita|Ei|Opa}, {um erro desconhecido aconteceu|algo deu errado} ' +
        'ao criar a figurinha com áudio, tente novamente mais tarde!'
    }

    if (!bot.audioStickerEnabled) {
      await sendMessage({ text: spintax(replies.DISABLED) }, message)
      return message
    }

    // Aceita responder a um vídeo ou enviar o vídeo com o comando na legenda
    const quotedMsg = getQuotedMessage(message)
    const mediaMessage = quotedMsg || message
    const content = extractMessageContent(mediaMessage.message)
    const video = content?.videoMessage
    if (!video) {
      await sendMessage({ text: spintax(replies.MISSING_VIDEO) }, message)
      return message
    }

    await react(message, getRandomItemFromArray(emojis.wait))

    try {
      const sent = await makeAudioSticker({
        client: getClient(),
        jid,
        mediaMessage,
        video,
        meta: {
          author: stickerMeta.author,
          pack: stickerMeta.pack
        }
      })

      if (sent) {
        await react(message, getRandomItemFromArray(emojis.music))
      }
      // Retorna a mensagem para o bot não criar uma figurinha normal em seguida (caso do vídeo com legenda)
      return message
    } catch (error) {
      logger.error(`Error creating audio sticker: ${error}`)

      let reply = replies.UNKNOWN_ERROR
      if (error instanceof VideoHasNoAudioError) reply = replies.NO_AUDIO
      if (error instanceof AudioStickerTooLargeError) reply = replies.TOO_LARGE

      await sendMessage({ text: spintax(reply) }, message)
      await react(message, emojis.error)
      return message
    }
  }
}
