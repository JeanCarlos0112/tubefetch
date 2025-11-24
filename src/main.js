const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('fs');
const { create: createYtdlp } = require('youtube-dl-exec');
const os = require('os');

// ========================================================
// 0. CONFIGURAÇÃO DE HARDWARE
// ========================================================

const IS_DEV = !app.isPackaged;
const CPU_CORES = os.cpus().length;

// Lógica de Slots Globais (Hardware Capacity)
let MAX_GLOBAL_SLOTS;
if (CPU_CORES <= 2) MAX_GLOBAL_SLOTS = 2;
else if (CPU_CORES <= 4) MAX_GLOBAL_SLOTS = 3;
else MAX_GLOBAL_SLOTS = Math.min(CPU_CORES - 1, 12); // Teto de 12 para máquinas potentes

console.log(`Sistema: ${CPU_CORES} núcleos. Max Downloads Simultâneos: ${MAX_GLOBAL_SLOTS}`);

// ========================================================
// 1. DOWNLOAD MANAGER INTELIGENTE (CORE DA LÓGICA)
// ========================================================

class DownloadManager {
  constructor(maxSlots) {
    this.maxSlots = maxSlots;
    this.activeCount = 0;
    this.groups = []; // Fila de grupos (Playlists/Videos)
  }

  addJob(title, items) {
    const group = {
      id: Date.now() + Math.random(),
      title: title,
      items: items,
      active: 0,
      totalSize: items.length, // Guarda o tamanho original para cálculo de peso
      timestamp: Date.now()
    };
    this.groups.push(group);
    this.processQueue();
  }

  processQueue() {
    // Enquanto houver slots livres no processador...
    while (this.activeCount < this.maxSlots) {
      
      // Filtra grupos que ainda têm itens pendentes
      const pendingGroups = this.groups.filter(g => g.items.length > 0);
      if (pendingGroups.length === 0) break;

      let bestCandidate = null;
      let lowestScore = Infinity;

      // CÁLCULO DE PRIORIDADE (ALGORITMO PONDERADO)
      pendingGroups.forEach((group) => {
        // Índice atual na fila (0 é o topo, 1 é o segundo...)
        const currentIndex = this.groups.indexOf(group);
        
        // 1. Penalidade por Ordem de Chegada (Quem chegou depois tem "Score" maior)
        // Multiplicador 2.5 garante que a 1ª playlist pegue ~2 a 3 slots para cada 1 slot da 2ª
        const orderPenalty = currentIndex * 2.5;

        // 2. Penalidade por Tamanho (Playlist Pequena vs Grande)
        // Se a playlist tem menos de 30 itens, aumentamos o score para ela não roubar muitos slots
        // Se for grande, penalty é 0.
        const sizePenalty = group.totalSize < 30 ? 2.0 : 0;

        // Fórmula Final: Score = Ativos + Penalidades
        // O grupo com MENOR score ganha o slot.
        const score = group.active + orderPenalty + sizePenalty;

        if (score < lowestScore) {
          lowestScore = score;
          bestCandidate = group;
        }
      });

      if (bestCandidate) {
        // Inicia o download do vencedor
        const task = bestCandidate.items.shift();
        this.runTask(bestCandidate, task);
      } else {
        break; 
      }
    }
  }

  async runTask(group, taskInfo) {
    this.activeCount++;
    group.active++;
    
    // Log para verificarmos a distribuição (pode remover em produção)
    console.log(`[ALOCADO] "${group.title.substring(0, 15)}..." | Slots usados: ${group.active} | Global: ${this.activeCount}`);

    try {
      const result = await handleDownloadVideo(taskInfo);
      if (mainWindowInstance) {
        mainWindowInstance.webContents.send('video-download-complete', { 
          success: true, title: taskInfo.title, file: result 
        });
      }
    } catch (error) {
      console.error(`Erro task ${taskInfo.title}:`, error.message);
      if (mainWindowInstance) {
        mainWindowInstance.webContents.send('video-download-complete', { 
          success: false, title: taskInfo.title, message: error.message 
        });
      }
    } finally {
      this.activeCount--;
      group.active--;
      
      // Se o grupo acabou, remove da memória
      if (group.items.length === 0 && group.active === 0) {
        this.groups = this.groups.filter(g => g.id !== group.id);
        console.log(`[FINALIZADO] Grupo "${group.title}" concluído.`);
      }

      // Chama o escalonador novamente para preencher o slot vago
      this.processQueue();
    }
  }
}

const manager = new DownloadManager(MAX_GLOBAL_SLOTS);

// ========================================================
// 2. SETUP DE ARQUIVOS E DIRETÓRIOS
// ========================================================
let ffmpegPathValue;
let ytDlpPath;

const ytDlpExe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ffmpegExe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffprobeExe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

// Origem
let sourceBinPath;
if (app.isPackaged) {
  sourceBinPath = path.join(process.resourcesPath, 'bin');
} else {
  sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'bin');
  if (!fs.existsSync(path.join(sourceBinPath, ytDlpExe))) {
     sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'node_modules/youtube-dl-exec/bin');
  }
}

// Destino (AppData)
const userBinPath = path.join(app.getPath('userData'), 'bin');

function ensureBinariesExist() {
  try {
    if (!fs.existsSync(userBinPath)) fs.mkdirSync(userBinPath, { recursive: true });
    [ytDlpExe, ffmpegExe, ffprobeExe].forEach(file => {
      const src = path.join(sourceBinPath, file);
      const dest = path.join(userBinPath, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src, dest);
    });
  } catch (e) {
    dialog.showErrorBox("Erro Instalação", `Falha binários:\n${e.message}`);
  }
}
ensureBinariesExist();

ytDlpPath = path.join(userBinPath, ytDlpExe);
ffmpegPathValue = path.join(userBinPath, ffmpegExe);

if (!fs.existsSync(ffmpegPathValue) && !app.isPackaged) {
    try { ffmpegPathValue = require('ffmpeg-static'); } catch (e) {}
}

const youtubedl = (fs.existsSync(ytDlpPath)) ? createYtdlp(ytDlpPath) : null;

// Pasta de Downloads Padrão
const outDir = path.join(app.getPath('music'), 'YouTubeDownloads');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ========================================================
// 3. JANELA
// ========================================================
let mainWindowInstance;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000, height: 700,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, 
    }
  });
  mainWindowInstance = win;

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const newHeaders = { ...details.responseHeaders };
    delete newHeaders['Content-Security-Policy'];
    delete newHeaders['content-security-policy'];
    newHeaders['Content-Security-Policy'] = ["script-src 'self' 'unsafe-inline' 'unsafe-eval'; default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';"];
    callback({ responseHeaders: newHeaders });
  });

  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ========================================================
// 4. DOWNLOAD WORKER
// ========================================================
function sanitizeFilename(filename) {
  if (typeof filename !== 'string' || !filename) return 'sem_titulo';
  return filename.replace(/[<>:"/\\|?*]/g, '').trim().substring(0, 150);
}

async function handleDownloadVideo({ url, title, videoId, targetFolder }) {
  if (!youtubedl) throw new Error("Erro Crítico: Binários não encontrados.");
  
  const finalDir = targetFolder ? targetFolder : outDir;
  if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

  const sanitizedTitle = sanitizeFilename(title);
  const outputPath = path.join(finalDir, `${sanitizedTitle}.mp3`);

  // Otimização: 3 fragments para economizar RAM em downloads paralelos
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
    concurrentFragments: 3, 
  });

  if (mainWindowInstance && videoId) {
     ytdlpProcess.stdout.on('data', () => {});
  }

  try {
    await ytdlpProcess;
    if (!fs.existsSync(outputPath)) throw new Error(`Arquivo final não gerado.`);
    return outputPath;
  } catch (error) {
    throw new Error(error.stderr || error.message || 'Erro desconhecido.');
  }
}

// ========================================================
// 5. HANDLERS IPC
// ========================================================

ipcMain.handle('fetchVideoInfo', async (_, url) => {
  try {
    if (!youtubedl) throw new Error("Motor yt-dlp não inicializado.");
    const info = await youtubedl(url, { dumpSingleJson: true, noWarnings: true, noCheckCertificates: true });
    return { title: info.title, thumbnails: info.thumbnails, videoId: info.id, url: url };
  } catch (err) {
    const msg = err.stderr || err.message;
    return { error: msg }; 
  }
});

ipcMain.handle('fetchPlaylistItems', async (_, playlistUrl) => {
  try {
    if (!youtubedl) throw new Error("Motor yt-dlp não inicializado.");
    const rawData = await youtubedl(playlistUrl, {
      flatPlaylist: true,
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      ignoreErrors: true
    });

    if (!rawData || !rawData.entries) return { error: 'Playlist vazia ou erro de rede.' };

    const items = (rawData.entries || [])
      .filter(e => e && e.id && e.title)
      .map(e => ({
        id: e.id,
        title: e.title,
        url: e.url || `https://youtu.be/${e.id}`,
        thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`
      }));

    return { playlistTitle: rawData.title || 'Playlist', items };
  } catch (err) {
    return { error: 'Erro interno no backend.', details: err.message };
  }
});

// Handler Unificado: Joga tudo para o Manager Inteligente
ipcMain.handle('downloadVideo', async (_, args) => {
  const rootDir = args.targetFolder ? args.targetFolder : outDir;
  let finalDir = rootDir;
  if (args.subFolder) finalDir = path.join(rootDir, sanitizeFilename(args.subFolder));

  const task = {
    url: args.url,
    title: args.title,
    videoId: args.videoId,
    targetFolder: finalDir
  };

  // Adiciona como grupo único (Tamanho = 1)
  manager.addJob(args.title, [task]);
  return { success: true, title: args.title, finalPath: finalDir };
});

ipcMain.handle('downloadAllVideos', async (_, { items, folder, playlistTitle }) => {
  if (!youtubedl) return [];

  let targetDir;
  if (folder) targetDir = folder;
  else if (playlistTitle) targetDir = path.join(outDir, sanitizeFilename(playlistTitle));
  else targetDir = outDir;

  const tasks = items.map(item => ({
    url: item.url,
    title: item.title,
    videoId: item.id,
    targetFolder: targetDir
  }));

  const groupTitle = playlistTitle || "Playlist";
  
  // Adiciona a playlist inteira. O Manager vai ver o tamanho dela.
  manager.addJob(groupTitle, tasks);

  return { success: true, queued: tasks.length };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-downloads-folder', async () => { await shell.openPath(outDir); });
ipcMain.handle('getDefaultPath', () => outDir);

ipcMain.handle('renameFolder', async (_, { oldPath, newName }) => {
  try {
    if (!fs.existsSync(oldPath)) return { success: false, error: "Pasta não encontrada." };
    const parentDir = path.dirname(oldPath);
    const newPath = path.join(parentDir, sanitizeFilename(newName));
    fs.renameSync(oldPath, newPath);
    return { success: true, newPath, newName: sanitizeFilename(newName) };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('deleteFolder', async (_, folderPath) => {
  const relative = path.relative(outDir, folderPath);
  if (relative === '' || relative.startsWith('..') || folderPath === outDir) {
    return { success: false, error: "Ação bloqueada por segurança." };
  }
  try {
    if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});