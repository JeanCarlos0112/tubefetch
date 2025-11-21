// if (require('electron-squirrel-startup')) {
//   require('electron').app.quit();
//   return;
// }
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');
const pLimit = require('p-limit');
const { create: createYtdlp } = require('youtube-dl-exec');

const IS_DEV = !app.isPackaged;
console.log('Ambiente IS_DEV:', IS_DEV);

// --- GERENCIAMENTO AVANÇADO DE BINÁRIOS ---
let ffmpegPathValue;
let ytDlpPath;

// Nomes dos arquivos
const ytDlpExe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ffmpegExe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffprobeExe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

// 1. Define a pasta de ORIGEM (Onde o instalador colocou os arquivos)
let sourceBinPath;
if (app.isPackaged) {
  sourceBinPath = path.join(process.resourcesPath, 'bin');
} else {
  sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'bin');
  // Fallback para dev se não tiver pasta bin
  if (!fs.existsSync(path.join(sourceBinPath, ytDlpExe))) {
     sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'node_modules/youtube-dl-exec/bin');
  }
}

// 2. Define a pasta de DESTINO SEGURO (AppData do Usuário - Sem problemas de permissão/espaço)
// Ex: C:\Users\Jean\AppData\Roaming\TubeFetch\bin
const userBinPath = path.join(app.getPath('userData'), 'bin');

// Função para copiar arquivos se não existirem ou atualizá-los
function ensureBinariesExist() {
  if (!fs.existsSync(userBinPath)) {
    fs.mkdirSync(userBinPath, { recursive: true });
  }

  const filesToCopy = [ytDlpExe, ffmpegExe, ffprobeExe];

  filesToCopy.forEach(file => {
    const src = path.join(sourceBinPath, file);
    const dest = path.join(userBinPath, file);

    // Copia apenas se a origem existir (em dev o ffmpeg pode estar em outro lugar)
    if (fs.existsSync(src)) {
      try {
        // Copia se não existir no destino (pode adicionar lógica de checar versão/tamanho aqui depois)
        if (!fs.existsSync(dest)) {
           fs.copyFileSync(src, dest);
           console.log(`Binário copiado para área segura: ${file}`);
        }
      } catch (e) {
        console.error(`Erro ao copiar ${file}:`, e);
      }
    }
  });
}

// Executa a cópia ao iniciar
ensureBinariesExist();

// 3. Define os caminhos finais apontando para a pasta SEGURA (UserData)
ytDlpPath = path.join(userBinPath, ytDlpExe);
ffmpegPathValue = path.join(userBinPath, ffmpegExe);

// Fallback para Dev: Se o ffmpeg não foi copiado (estava em node_modules), tenta achar
if (!fs.existsSync(ffmpegPathValue) && !app.isPackaged) {
    try { ffmpegPathValue = require('ffmpeg-static'); } catch (e) {}
}

console.log('Caminhos Finais (UserData):', { ytDlpPath, ffmpegPathValue });

// Inicializa o yt-dlp apontando para o caminho seguro (sem aspas, pois spawn lida bem com AppData)
const youtubedl = (fs.existsSync(ytDlpPath)) ? createYtdlp(ytDlpPath) : null;

if (!youtubedl) {
    console.error("ERRO CRÍTICO: yt-dlp não encontrado na pasta de usuário.");
}

const outDir = path.join(app.getPath('music'), 'YouTubeDownloads');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const DOWNLOAD_CONCURRENCY = 3;
const limit = pLimit(DOWNLOAD_CONCURRENCY);

let mainWindowInstance;

function createWindow() {
  const win = new BrowserWindow({
    width: 800, height: 600,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: true,
    }
  });
  mainWindowInstance = win;

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Reduzir a verbosidade do log da CSP, mostrando apenas uma vez ou quando muda
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      console.log('onHeadersReceived chamado para frame. IS_DEV:', IS_DEV);
    }
    const newHeaders = { ...details.responseHeaders };
    delete newHeaders['Content-Security-Policy']; // Garante que estamos sobrescrevendo
    delete newHeaders['content-security-policy'];

    const scriptSrcPolicy = IS_DEV
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'";

    newHeaders['Content-Security-Policy'] = [
      // Tentar uma CSP um pouco mais simples por enquanto para isolar
      `script-src ${scriptSrcPolicy}; default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';`
    ];
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
       console.log('Nova CSP injetada:', newHeaders['Content-Security-Policy']);
    }
    callback({ responseHeaders: newHeaders });
  });

  if (IS_DEV) {
    win.webContents.openDevTools();
  }
  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });


function sanitizeFilename(filename) {
  if (typeof filename !== 'string' || !filename) return 'sem_titulo';
  // Remove caracteres inválidos e espaços extras
  return filename.replace(/[<>:"/\\|?*]/g, '').trim();
}

async function handleDownloadVideo({ url, title, videoId, targetFolder }) {
  if (!youtubedl) {
      throw new Error("youtube-dl-exec não inicializado. yt-dlp não encontrado.");
  }
  if (!ffmpegPathValue || !fs.existsSync(ffmpegPathValue)) {
      throw new Error(`ffmpeg não encontrado no caminho: ${ffmpegPathValue}. Verifique a instalação e os caminhos.`);
  }

  const finalDir = targetFolder ? targetFolder : outDir;

  // Garante que a pasta exista (importante para playlists novas)
  if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
  }

  const sanitizedTitle = sanitizeFilename(title);
  const outputPath = path.join(finalDir, `${sanitizedTitle}.mp3`);
  if (!url) throw new Error("URL do vídeo não fornecida para o download.");
  console.log(`Iniciando download de "${title}" em: ${finalDir}`); // Log para conferência

  const ytdlpProcess = youtubedl.exec(url, {
    format: 'bestaudio/best',
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '5',
    output: outputPath,
    noWarnings: true,
    noCheckCertificates: true,
    ignoreErrors: false,
    ffmpegLocation: ffmpegPathValue,
    concurrentFragments: 5,
  });

   if (mainWindowInstance && videoId) {
     ytdlpProcess.stdout.on('data', (data) => {
       const line = data.toString();
       const progressMatch = line.match(/\[download\]\s*(\d+\.?\d*)%\s*of/);
       if (progressMatch && progressMatch[1]) {
         const percent = parseFloat(progressMatch[1]);
         // mainWindowInstance.webContents.send('video-download-progress', { videoId, percent, title });
       }
     });
   }

  try {
    await ytdlpProcess;
    console.log(`Download concluído para: ${title}. Salvo em: ${outputPath}`);
    if (!fs.existsSync(outputPath)) {
      console.error(`Falha ao verificar existência do arquivo MP3 para "${title}" em ${outputPath} após download.`);
      throw new Error(`Arquivo MP3 final para "${title}" não encontrado.`);
    }
    return outputPath;
  } catch (error) {
    const errorMessage = error.stderr || error.message || 'Erro desconhecido no download/conversão.';
    console.error(`Erro no download/conversão para ${title}: ${errorMessage}`);
    throw new Error(`Falha para ${title}: ${errorMessage}`);
  }
}

ipcMain.handle('fetchVideoInfo', async (_, url) => {
  console.log('IPC: fetchVideoInfo chamado com URL:', url);
  if (!youtubedl) {
    return { error: "youtube-dl-exec não inicializado. yt-dlp não encontrado." };
  }
  try {
    const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, noCheckCertificates: true });
    return { title: info.title, thumbnails: info.thumbnails, videoId: info.id, url: url };
  } catch (err) {
    const errorMessage = err.stderr || err.message || 'Erro desconhecido';
    console.error('Erro em fetchVideoInfo:', errorMessage);
    return { error: `Não foi possível obter informações do vídeo: ${errorMessage.split('\n')[0]}` };
  }
});

ipcMain.handle('fetchPlaylistItems', async (_, playlistUrl) => {
  console.log('--- INÍCIO FETCH PLAYLIST ---');
  console.log('URL:', playlistUrl);

  if (!youtubedl) {
    console.error('ERRO: youtubedl é nulo');
    return { error: "Motor yt-dlp não inicializado." };
  }

  try {
    console.log('Executando comando yt-dlp...');
    
    // Tenta buscar os dados
    const rawData = await youtubedl(playlistUrl, {
      flatPlaylist: true,
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      ignoreErrors: true
    });

    // LOG CRÍTICO: Vamos ver o que chegou
    console.log('Comando finalizado.');
    console.log('Tipo do retorno:', typeof rawData);
    console.log('É nulo?', rawData === null);
    
    // Se chegou undefined ou null, forçamos um erro explícito
    if (!rawData) {
        console.error('FALHA SILENCIOSA: yt-dlp retornou vazio/undefined');
        return { error: 'O yt-dlp executou mas não retornou dados JSON.' };
    }

    // Se chegou, mas não tem entradas
    if (!rawData.entries) {
        console.warn('AVISO: Playlist sem entradas (entries).');
        // Às vezes playlist vazia retorna objeto válido mas sem a array
        return { error: 'Playlist encontrada, mas parece estar vazia ou é privada.' };
    }

    console.log(`Sucesso! Encontrados ${rawData.entries.length} itens.`);

    const items = rawData.entries
      .filter(e => e && e.id && e.title)
      .map(e => ({
        id: e.id,
        title: e.title,
        url: e.url || `https://youtu.be/${e.id}`,
        thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`
      }));

    const resultadoFinal = { 
        playlistTitle: rawData.title || 'Playlist', 
        items: items 
    };

    console.log('Enviando resposta para o Frontend...');
    return resultadoFinal;

  } catch (err) {
    console.error('--- ERRO NO CATCH ---');
    console.error(err);
    // Retorna o erro formatado para o frontend não receber undefined
    return { error: 'Erro interno no backend.', details: err.message || err.stderr };
  }
});

ipcMain.handle('downloadVideo', async (_, args) => {
  console.log('IPC downloadVideo recebido:', args.title);
  console.log('--> Subpasta:', args.subFolder); // Agora isso DEVE aparecer preenchido

  // 1. Define a Pasta Raiz
  const rootDir = args.targetFolder ? args.targetFolder : outDir;
  
  // 2. Define a Pasta Final
  let finalDir = rootDir;
  if (args.subFolder) {
    // sanitizeFilename deve estar declarada no seu arquivo main.js
    const safeName = sanitizeFilename(args.subFolder);
    if (safeName) {
        finalDir = path.join(rootDir, safeName);
    }
  }
  
  console.log('--> Caminho Final:', finalDir);

  // 3. Cria a pasta se não existir
  if (!fs.existsSync(finalDir)) {
    try {
      fs.mkdirSync(finalDir, { recursive: true });
    } catch (e) {
      return { success: false, message: "Erro ao criar pasta: " + e.message };
    }
  }

  try {
    const file = await handleDownloadVideo({ 
      url: args.url, 
      title: args.title, 
      videoId: args.videoId, 
      targetFolder: finalDir 
    });
    
    return { success: true, file, title: args.title, finalPath: finalDir };
  } catch (err) {
    return { success: false, message: err.message, title: args.title };
  }
});

ipcMain.handle('downloadAllVideos', async (_, { items, folder, playlistTitle }) => {
  console.log(`IPC downloadAllVideos recebido. Playlist: ${playlistTitle}, Pasta: ${folder}`);
  
  if (!youtubedl) {
    if (mainWindowInstance) {
        mainWindowInstance.webContents.send('video-download-complete', { success: false, title: 'Todos os Itens', message: "youtube-dl-exec não inicializado." });
    }
    return items.map(item => ({ title: item.title, success: false, message: "youtube-dl-exec não inicializado." }));
  }

  // LÓGICA DE CRIAÇÃO DE PASTA DA PLAYLIST
  let targetDir;

  if (folder) {
    // Caso 1: Frontend já mandou o caminho completo (Pasta Personalizada + Nome Playlist)
    targetDir = folder;
  } else if (playlistTitle) {
    // Caso 2: Caminho Padrão. Nós (Backend) criamos a subpasta aqui.
    targetDir = path.join(outDir, sanitizeFilename(playlistTitle));
  } else {
    // Fallback (não deve acontecer para playlists): Salva na raiz
    targetDir = outDir;
  }

  // Garante que a pasta exista fisicamente antes de começar
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`Pasta criada: ${targetDir}`);
    } catch (e) {
      console.error(`Erro ao criar pasta ${targetDir}:`, e);
      // Se falhar ao criar pasta, volta para o outDir padrão para não perder o download
      targetDir = outDir;
    }
  }

  const tasks = items.map(item =>
    limit(async () => {
      console.log(`Iniciando tarefa para: ${item.title} em ${targetDir}`);
      try {
        // Passamos o targetDir calculado acima para a função de download individual
        const file = await handleDownloadVideo({ 
          url: item.url, 
          title: item.title, 
          videoId: item.id,
          targetFolder: targetDir 
        });
        
        if (mainWindowInstance) {
            mainWindowInstance.webContents.send('video-download-complete', { success: true, title: item.title, file });
        }
        return { title: item.title, success: true, file };
      } catch (error) {
        console.error(`Erro na tarefa para ${item.title}: ${error.message}`);
        if (mainWindowInstance) {
            mainWindowInstance.webContents.send('video-download-complete', { success: false, title: item.title, message: error.message });
        }
        return { title: item.title, success: false, message: error.message };
      }
    })
  );

  const results = await Promise.all(tasks);
  console.log('Todas as tarefas de downloadAllVideos concluídas.');
  return results;
});

ipcMain.handle('fetchAllVideoInfo', async (_, urls) => {
  console.log('IPC: fetchAllVideoInfo chamado com URLs:', urls.length);
  if (!youtubedl) {
    return urls.map(url => ({ url, error: "youtube-dl-exec não inicializado." }));
  }
  const tasks = urls.map(url =>
    limit(() => youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true
    })
      .then(info => ({ url, title: info.title, thumbnail: info.thumbnails?.[0]?.url, videoId: info.id }))
      .catch(error => ({ url, error: error.stderr || error.message }))
    )
  );
  return await Promise.all(tasks);
});

ipcMain.handle('open-downloads-folder', async () => {
  const { shell } = require('electron');
  try {
    console.log(`Abrindo pasta de downloads: ${outDir}`);
    await shell.openPath(outDir);
    return { success: true };
  } catch (error) {
    console.error("Falha ao abrir pasta de downloads:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});
// Adicione isso junto com os outros ipcMain.handle
ipcMain.handle('renameFolder', async (_, { oldPath, newName }) => {
  console.log(`Renomeando: ${oldPath} para nome: ${newName}`);
  
  try {
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: "A pasta original não existe." };
    }

    // Pega o diretório pai (ex: C:/Music/Downloads)
    const parentDir = path.dirname(oldPath);
    
    // Cria o novo caminho completo com o nome higienizado
    const sanitizedName = sanitizeFilename(newName);
    const newPath = path.join(parentDir, sanitizedName);

    // Renomeia fisicamente
    fs.renameSync(oldPath, newPath);

    return { success: true, newPath: newPath, newName: sanitizedName };
  } catch (error) {
    console.error("Erro ao renomear:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('getDefaultPath', () => {
  return outDir; // Retorna o caminho C:\Users\...\Music\YouTubeDownloads
});

ipcMain.handle('deleteFolder', async (_, folderPath) => {
  console.log(`Solicitação para deletar: ${folderPath}`);
  
  // TRAVA DE SEGURANÇA: Impede deletar a pasta raiz de downloads
  // Compara os caminhos normalizados para evitar erros de barra ( \ vs / )
  const relative = path.relative(outDir, folderPath);
  const isRootOrParent = relative === '' || relative.startsWith('..') || folderPath === outDir;

  if (isRootOrParent) {
    console.warn("BLQUEADO: Tentativa de deletar a pasta raiz de downloads.");
    return { success: false, error: "Por segurança, não é permitido deletar a pasta raiz de Downloads." };
  }

  try {
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: "A pasta não existe." };
    }
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log("Pasta deletada com sucesso.");
    return { success: true };
  } catch (error) {
    console.error("Erro ao deletar pasta:", error);
    return { success: false, error: error.message };
  }
});