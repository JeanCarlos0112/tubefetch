# TubeFetch

<img width="2816" height="1536" alt="Image" src="https://github.com/user-attachments/assets/e557d9bc-ee8c-495f-9a94-10158a499cba" />
<br />

<h3>O Gerenciador de Downloads Definitivo para YouTube</h3>
<p> Uma aplicação Desktop moderna, segura e de alta performance para baixar, organizar e gerenciar sua biblioteca de músicas localmente. </p>

<p> 
  <a href="https://github.com/JeanCarlos0112/youtube-audio-app-extractor/releases"> 
    <img src="https://img.shields.io/github/v/release/JeanCarlos0112/youtube-audio-app-extractor?style=flat-square&color=blue" alt="Latest Release" /> </a> <a href="https://github.com/JeanCarlos0112/youtube-audio-app-extractor/blob/main/LICENSE"> <img src="https://img.shields.io/github/license/JeanCarlos0112/youtube-audio-app-extractor?style=flat-square" alt="License" /> 
  </a> 
  <img src="https://img.shields.io/badge/platform-Windows-0078d7.svg?style=flat-square" alt="Platform Windows" />
  <img src="https://img.shields.io/badge/built%20with-Electron%20%2B%20React-61DAFB.svg?style=flat-square" alt="Built with Electron React" /> 
</p>

<p> 
  <a href="#funcionalidades">Funcionalidades
  </a> • 
  <a href="#instalação">Instalação
  </a> • 
  <a href="#desenvolvimento">Desenvolvimento
  </a> • <a href="#tecnologias">Tecnologias
  </a> 
</p> 
</div>

## 📸 Screenshots
### 🏠 Home
<img width="1365" height="669" alt="image" src="https://github.com/user-attachments/assets/c905fbf4-a7c6-41c7-897a-478c659ca1d1" />
<img width="1365" height="658" alt="image" src="https://github.com/user-attachments/assets/7e5a9b43-9f14-402a-894f-282e5ee0566a" />

### ⬇️ Downloads
<img width="1364" height="665" alt="image" src="https://github.com/user-attachments/assets/eec701f2-a810-4c47-96eb-848a9681cd53" />
<img width="1365" height="664" alt="image" src="https://github.com/user-attachments/assets/85633e91-66e7-4482-b137-560d501fe8e6" />

### 📚 Biblioteca
<img width="1362" height="668" alt="image" src="https://github.com/user-attachments/assets/595d3c24-af1b-4720-8152-a1c303e7e9ee" />
<img width="1365" height="669" alt="image" src="https://github.com/user-attachments/assets/9d613ea0-2fae-483f-96f3-ce25f021a482" />

## ✨ Funcionalidades
O TubeFetch não é apenas um downloader, é um gerenciador inteligente de mídia local.

* 🚀 **Downloads Multi-Threaded:** Utiliza um gerenciador de fila inteligente que detecta os núcleos do seu processador para realizar downloads paralelos sem travar o sistema.

* 🔐 **Login Seguro & Bypass:** Sistema de autenticação integrado via Google (com criptografia de cookies) para permitir o download de vídeos com restrição de idade e evitar bloqueios de IP ("Sign in to confirm you're not a bot").

* 📂 **Sincronização de Pastas:** Renomeou a pasta da playlist no Windows? O TubeFetch detecta automaticamente através de marcadores ocultos e atualiza sua biblioteca sem perder dados.

* 🎧 **Conversão Automática:** Baixa e converte automaticamente para MP3 de alta qualidade (320kbps quando disponível), aplicando metadados e capas de álbum.

* 📚 **Biblioteca Persistente:** Mantém seu histórico e organização salvos localmente com criptografia segura.

* ♻️ **Auto-Update:** Sistema de atualização integrado (estilo Hydra/Discord) que verifica, baixa e instala novas versões via GitHub Releases automaticamente.

* 🎨 **UI Moderna:** Interface construída com React e TailwindCSS, totalmente responsiva e com tema Dark Mode nativo.

## 📥 Instalação
1. Para usuários finais que desejam apenas usar o aplicativo:

2. Vá até a página de Releases.

3. Baixe o arquivo mais recente: TubeFetch-x.x.x-x64.msi.

4. Execute o instalador.

5. O aplicativo será instalado e um atalho será criado na sua Área de Trabalho.

#### Nota: Como o aplicativo ainda não possui um certificado pago da Microsoft, o Windows pode exibir a tela "SmartScreen". Clique em Mais informações -> Executar assim mesmo.

## 🛠️ Desenvolvimento
Se você é um desenvolvedor e deseja contribuir ou modificar o código:

### Pré-requisitos
* Node.js (Versão 16 ou superior)
* Git
* WiX Toolset v3.11 (Necessário para gerar o instalador MSI no Windows)

### Configuração do Ambiente
1. Clone o repositório:
```bash
git clone https://github.com/JeanCarlos0112/youtube-audio-app-extractor.git
cd youtube-audio-app-extractor
```

2. Instale as dependências:
```bash
npm install
```

3. **Configuração dos Binários (Crucial):** O projeto depende de `ffmpeg`, `ffprobe` e `yt-dlp`. Crie uma pasta chamada `bin` na raiz do projeto e adicione os executáveis correspondentes para o seu sistema operacional.

raiz-do-projeto/
├── bin/
│   ├── ffmpeg.exe
│   ├── ffprobe.exe
│   └── yt-dlp.exe
├── src/
└── package.json

4. Inicie o modo de desenvolvimento:
```bash
npm start
```

### Gerando o Instalador (Build)
Para criar o arquivo `.msi` de distribuição:
```bash
npm run make
```
O executável será gerado na pasta `out/make/wix/x64/`.

## 💻 Tecnologias
Este projeto foi construído utilizando as melhores ferramentas do ecossistema JavaScript:

* [**Electron**](https://www.electronjs.org/): Framework para criar apps desktop nativos.
* [**React**](https://react.dev/): Biblioteca para construção da interface de usuário.
* [**Tailwind CSS**](https://tailwindcss.com/): Framework de estilização utility-first.
* [**Electron Forge**](https://www.electronforge.io/): Ferramenta completa para build e empacotamento.
* [**yt-dlp**](https://github.com/yt-dlp/yt-dlp): O motor mais poderoso para download de vídeos (fork do youtube-dl).
* [**electron-store**](https://github.com/sindresorhus/electron-store): Persistência de dados local com criptografia.

## 🤝 Contribuição
Contribuições são bem-vindas! Sinta-se à vontade para abrir uma Issue para reportar bugs ou sugerir melhorias, ou envie um Pull Request.

1. Faça um Fork do projeto.
2. Crie uma Branch para sua Feature (git checkout -b feature/IncrívelFeature).
3. Faça o Commit das suas mudanças (git commit -m 'Add some IncrívelFeature').
4. Faça o Push para a Branch (git push origin feature/IncrívelFeature).
5. Abra um Pull Request.

## 📄 Licença
Este projeto está sob a licença **MIT**. Veja o arquivo LICENSE para mais detalhes.

<div align="center"> Feito com 💜 por <a href="https://github.com/JeanCarlos0112">Jean Carlos</a> </div>
