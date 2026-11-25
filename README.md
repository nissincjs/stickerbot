# StickerBot 🤖

💻 Originalmente desenvolvido em Python, migrado para JavaScript e agora escrito em TypeScript. 🎉

StickerBot é um bot de figurinhas com uma vasta gama de comandos. Ele pode:
- Auxiliar na administração do seu grupo
- Divertir os membros
- Criar figurinhas incríveis

## 🤖 Showcase

- Veja o bot em funcionamento [aqui](https://api.whatsapp.com/send/?phone=558194742944&text=!menu).

## 📝 Lista de Tarefas

- Confira as tarefas pendentes e o progresso do projeto [aqui](TODO.md).

## 🚀 Funcionalidades Principais

- **Administração de Grupo:** Comandos para gerenciar e moderar grupos.
- **Criação de Figurinhas:** Transforme imagens, vídeos e textos em figurinhas personalizadas.
- **Figurinha com Áudio:** Crie figurinha animada com o som do próprio vídeo (`!figaudio`).
- **Diversão:** Baixe músicas do YouTube diretamente pelo WhatsApp.

## 🎵 Figurinha com áudio (sound sticker)

Responda a um **vídeo com som** com `!figaudio` (ou envie o vídeo com esse comando na legenda) para receber uma figurinha animada com o áudio do vídeo.

| Comando | O que faz |
|---|---|
| `!figaudio` | Figurinha animada com o áudio do vídeo respondido |
| `!figsom` / `!audiosticker` / `!figurinhaaudio` | Apelidos do mesmo comando |

> ⚠️ **Recurso novo e não-oficial.** O WhatsApp liberou as figurinhas com som recentemente e ainda está em rollout. Pode não tocar em aparelhos antigos ou no iOS; nesse caso o bot envia a figurinha e o áudio separados automaticamente (`SB_AUDIO_STICKER_FORCE_FALLBACK=true` força esse modo para testes).

Limites: vídeos de até **10 segundos** (o restante é cortado) e figurinha de até ~490 KB (o encoder reduz qualidade/FPS automaticamente).

Requisitos: `ffmpeg` no PATH com os codecs `libwebp` e `libopus`.

Para desativar o comando: `SB_AUDIO_STICKER=false`.

Crédito pela descoberta da técnica de sound sticker: Yusro GTG.

## 📦 Instalação

1. Clone este repositório:
    ```bash
    git clone https://github.com/juniorkrz/stickerbot
    ```
2. Navegue até o diretório do projeto:
    ```bash
    cd stickerbot
    ```
3. Instale as dependências:
    ```bash
    npm install
    ```
4. Configure as variáveis de ambiente necessárias (veja [.env.example](.env.example) para referência).

## 🚀 Como Usar

Compilando o projeto:
```bash
npm run build
```

Rodar em produção:
```bash
npm start
```

Rodar em desenvolvimento:
```bash
npm run dev
```

Rodar em desenvolvimento com auto reload:
```bash
npm run debug
```

## 🐳 Via Docker

Build:
```bash
docker build -t juniorkrz/stickerbot .
```

Run:
```bash
docker run -d --name stickerbot -p 3000:3000 -v [/your/data/folder]:/data juniorkrz/stickerbot
```

### Como escanear o QR Code

Assim que o container estiver em execução, você precisará vincular seu telefone a ele. Para fazer isso, você tem algumas opções:

- `http://localhost:3000/qr` para ver uma pequena página com o QR Code para digitalizar.
- `docker logs -f stickerbot` para abrir o log. O QR será impresso lá. (Via Docker)

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Faça commit das suas alterações (`git commit -m 'Adiciona nova feature'`)
4. Faça push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 👨🏻‍💻 Autor
- [Antônio Roberto Júnior](https://github.com/juniorkrz)

## 💡 Inspirações

Este projeto foi inspirado pelo trabalho de [helv-io/wa-stickerbot](https://github.com/helv-io/wa-stickerbot).

## 📄 Licença

Este projeto está licenciado sob a Licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## ⚙ Tecnologias e Ferramentas

![Docker](https://camo.githubusercontent.com/8396abd667a0eca7d28cdb29ec63b6bf29a7854c7c3d467e6ece648c7e9b81e1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f646f636b65722d2532333064623765642e7376673f7374796c653d666f722d7468652d6261646765266c6f676f3d646f636b6572266c6f676f436f6c6f723d7768697465)
![NodeJS](https://camo.githubusercontent.com/0d58facab1be74748c39244ff3d990ae8ddd765af40263ed006219154ba90649/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f6e6f64652e6a732d3644413535463f7374796c653d666f722d7468652d6261646765266c6f676f3d6e6f64652e6a73266c6f676f436f6c6f723d7768697465)
![SQLite](https://camo.githubusercontent.com/34832d20f2587ef5fae771070dc9a55bac4999625ca9fdd4a0ceb44ab17d3ed1/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f73716c6974652d2532333037343035652e7376673f7374796c653d666f722d7468652d6261646765266c6f676f3d73716c697465266c6f676f436f6c6f723d7768697465)
![TypeScript](https://camo.githubusercontent.com/a00920b123df05b3df5e368e509f18bacd65bc5909698fb42be5f35063550f47/68747470733a2f2f696d672e736869656c64732e696f2f62616467652f747970657363726970742d2532333030374143432e7376673f7374796c653d666f722d7468652d6261646765266c6f676f3d74797065736372697074266c6f676f436f6c6f723d7768697465)

## 🌟 Agradecimentos

Obrigado a todos os contribuidores e usuários que tornam este projeto possível!

---

Feito com 💜 por [Juniorkrz](https://github.com/juniorkrz)
