const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('fs');
const { create: createYtdlp } = require('youtube-dl-exec');
const pLimitImport = require('p-limit');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');
const Store = require('electron-store');

// ========================================================
// 0. CONFIGURAÇÃO E STORE (CRIPTOGRAFADO)
// ========================================================

const IS_DEV = !app.isPackaged;
const CPU_CORES = os.cpus().length;

const store = new Store({
  name: 'tubefetch-db',
  encryptionKey: 'TubeFetch_Secure_Key_2025', // Protege seus cookies
  defaults: { library: [], history: [], userCookies: '' }, // userCookies guarda a string segura
  clearInvalidConfig: true
});

let MAX_GLOBAL_SLOTS;
if (CPU_CORES <= 2) MAX_GLOBAL_SLOTS = 2;
else if (CPU_CORES <= 4) MAX_GLOBAL_SLOTS = 3;
else MAX_GLOBAL_SLOTS = Math.min(CPU_CORES - 1, 12);

console.log(`Sistema: ${CPU_CORES} núcleos. Max Downloads Simultâneos: ${MAX_GLOBAL_SLOTS}`);

// ========================================================
// 1. GERENCIAMENTO DE BINÁRIOS
// ========================================================
let ffmpegPathValue;
let ytDlpPath;

const ytDlpExe = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const ffmpegExe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffprobeExe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

let sourceBinPath;
if (app.isPackaged) {
  sourceBinPath = path.join(process.resourcesPath, 'bin');
} else {
  sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'bin');
  if (!fs.existsSync(path.join(sourceBinPath, ytDlpExe))) {
     sourceBinPath = path.join(path.resolve(__dirname, '..', '..'), 'node_modules/youtube-dl-exec/bin');
  }
}

const userBinPath = path.join(app.getPath('userData'), 'bin');

// Remove cookies.txt antigo se existir (Limpeza de segurança)
const oldCookiesPath = path.join(userBinPath, 'cookies.txt');
if (fs.existsSync(oldCookiesPath)) {
    try { fs.unlinkSync(oldCookiesPath); console.log("Cookies antigos inseguros removidos."); } catch(e){}
}

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
const outDir = path.join(app.getPath('music'), 'YouTubeDownloads');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ========================================================
// 2. FUNÇÕES AUXILIARES DE SEGURANÇA
// ========================================================

function sanitizeFilename(filename) {
  if (typeof filename !== 'string' || !filename) return 'sem_titulo';
  return filename.replace(/[<>:"/\\|?*]/g, '').trim().substring(0, 150);
}

function getFileFingerprint(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    return `${fileSize}-${hash}`;
  } catch (e) { return null; }
}

function createFolderMarker(folderPath, libraryId, extraData = {}) {
  if (!folderPath || !libraryId) return;
  const markerPath = path.join(folderPath, '.tube-meta');
  const data = { id: libraryId, created: new Date().toISOString(), ...extraData };
  try {
    if (fs.existsSync(markerPath) && process.platform === 'win32') {
        try { require('child_process').execSync(`attrib -h "${markerPath}"`); } catch (e) {}
    }
    fs.writeFileSync(markerPath, JSON.stringify(data, null, 2), 'utf-8');
    if (process.platform === 'win32') {
      exec(`attrib +h "${markerPath}"`);
    }
  } catch (e) { console.error("Erro marcador:", e); }
}

// --- SEGURANÇA DE COOKIES (TEMP FILE) ---
// Gera um arquivo temporário apenas para o download e retorna o caminho
function generateTempCookieFile() {
  const storedCookies = store.get('userCookies');
  if (!storedCookies) return null;

  // Cria um arquivo com nome aleatório para evitar colisão em downloads paralelos
  const tempPath = path.join(userBinPath, `sec-${Date.now()}-${Math.floor(Math.random()*1000)}.txt`);
  try {
    fs.writeFileSync(tempPath, storedCookies, 'utf-8');
    return tempPath;
  } catch (e) {
    console.error("Erro ao criar cookie temporário:", e);
    return null;
  }
}

// Deleta o arquivo temporário
function cleanupTempCookie(tempPath) {
  if (tempPath && fs.existsSync(tempPath)) {
    try { fs.unlinkSync(tempPath); } catch (e) {}
  }
}

async function finalizePlaylistData(libraryId, folderPath, title) {
  if (!fs.existsSync(folderPath)) return;
  try {
    const files = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.mp3'))
      .map(f => {
        const fullPath = path.join(folderPath, f);
        return {
          title: path.basename(f, '.mp3'),
          path: fullPath,
          fingerprint: getFileFingerprint(fullPath)
        };
      });

    const currentLib = store.get('library') || [];
    const newLib = currentLib.map(item => {
      if (item.id === libraryId) {
        return { ...item, count: files.length, items: files };
      }
      return item;
    });
    store.set('library', newLib);
    createFolderMarker(folderPath, libraryId, { lastSync: new Date().toISOString(), count: files.length });
    
    if (mainWindowInstance) mainWindowInstance.webContents.send('library-updated', newLib);
  } catch (error) { console.error(`[AUDITORIA] Erro:`, error); }
}

function cookiesToNetscape(cookies) {
  let out = "# Netscape HTTP Cookie File\n# This file is generated by TubeFetch.\n\n";
  cookies.forEach(cookie => {
    const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
    const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
    const path = cookie.path;
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiration = cookie.expirationDate ? Math.round(cookie.expirationDate) : 0;
    out += `${domain}\t${includeSubdomains}\t${path}\t${secure}\t${expiration}\t${cookie.name}\t${cookie.value}\n`;
  });
  return out;
}

// ========================================================
// 3. JANELA PRINCIPAL
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
    }});
  mainWindowInstance = win;
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const newHeaders = { ...details.responseHeaders };
    delete newHeaders['Content-Security-Policy'];
    delete newHeaders['content-security-policy'];
    newHeaders['Content-Security-Policy'] = ["script-src 'self' 'unsafe-inline' 'unsafe-eval'; default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';"];
    callback({ responseHeaders: newHeaders });
  });
  win.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  setTimeout(checkForUpdates, 3000);
}

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ========================================================
// 4. DOWNLOAD MANAGER
// ========================================================
class DownloadManager {
  constructor(maxSlots) {
    this.maxSlots = maxSlots;
    this.activeCount = 0;
    this.groups = [];
  }
  addJob(title, items, libraryId, folderPath) {
    this.groups.push({
      id: Date.now() + Math.random(),
      title, items, active: 0,
      totalSize: items.length,
      libraryId, folderPath,
      timestamp: Date.now()
    });
    this.processQueue();
  }
  processQueue() {
    while (this.activeCount < this.maxSlots) {
      const pendingGroups = this.groups.filter(g => g.items.length > 0);
      if (pendingGroups.length === 0) break;
      let bestCandidate = null, lowestScore = Infinity;
      pendingGroups.forEach((group) => {
        const idx = this.groups.indexOf(group);
        const score = group.active + (idx * 2.5) + (group.totalSize < 30 ? 2.0 : 0);
        if (score < lowestScore) { lowestScore = score; bestCandidate = group; }
      });
      if (bestCandidate) {
        const task = bestCandidate.items.shift();
        this.runTask(bestCandidate, task);
      } else break;
    }
  }
  async runTask(group, taskInfo) {
    this.activeCount++;
    group.active++;
    try {
      const result = await handleDownloadVideo(taskInfo);
      if (mainWindowInstance) mainWindowInstance.webContents.send('video-download-complete', { success: true, title: taskInfo.title, file: result.path, fingerprint: result.fingerprint });
    } catch (error) {
      if (mainWindowInstance) mainWindowInstance.webContents.send('video-download-complete', { success: false, title: taskInfo.title, message: error.message });
    } finally {
      this.activeCount--;
      group.active--;
      if (group.items.length === 0 && group.active === 0) {
        this.groups = this.groups.filter(g => g.id !== group.id);
        if (group.libraryId && group.folderPath) await finalizePlaylistData(group.libraryId, group.folderPath, group.title);
      }
      this.processQueue();
    }
  }
}
const manager = new DownloadManager(MAX_GLOBAL_SLOTS);

// ========================================================
// 5. DOWNLOAD WORKER (COM COOKIES SEGUROS)
// ========================================================
async function handleDownloadVideo({ url, title, videoId, targetFolder }) {
  if (!youtubedl) throw new Error("Binários ausentes.");
  const finalDir = targetFolder ? targetFolder : outDir;
  if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

  const sanitizedTitle = sanitizeFilename(title);
  const outputPath = path.join(finalDir, `${sanitizedTitle}.mp3`);

  const args = {
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
    addMetadata: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    referer: 'https://www.youtube.com/',
  };

  // --- SEGURANÇA: GERA COOKIE TEMPORÁRIO ---
  const tempCookie = generateTempCookieFile();
  if (tempCookie) {
      args.cookies = tempCookie;
  }

  const ytdlpProcess = youtubedl.exec(url, args);
  if (mainWindowInstance && videoId) ytdlpProcess.stdout.on('data', () => {});

  try {
    await ytdlpProcess;
    if (!fs.existsSync(outputPath)) throw new Error(`Arquivo não gerado.`);
    const fingerprint = getFileFingerprint(outputPath);
    return { path: outputPath, fingerprint };
  } catch (error) {
    throw new Error(error.stderr || error.message || 'Erro desconhecido.');
  } finally {
    // --- SEGURANÇA: DELETA O COOKIE IMEDIATAMENTE ---
    cleanupTempCookie(tempCookie);
  }
}

// ========================================================
// 6. HANDLERS IPC E LOGIN
// ========================================================

ipcMain.handle('loginYoutube', async () => {
  const loginWindow = new BrowserWindow({
    width: 800, height: 700, autoHideMenuBar: true,
    title: "Conectar ao YouTube (Seguro)",
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:youtube-session' }
  });

  loginWindow.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com/');

  return new Promise((resolve) => {
    let isLoggedIn = false;
    loginWindow.webContents.on('did-navigate', async (event, url) => {
      if (url.includes('youtube.com') && !url.includes('accounts.google.com') && !isLoggedIn) {
        try {
          const cookies = await loginWindow.webContents.session.cookies.get({ domain: 'youtube.com' });
          const googleCookies = await loginWindow.webContents.session.cookies.get({ domain: 'google.com' });
          const allCookies = [...cookies, ...googleCookies];
          const hasAuth = allCookies.some(c => c.name === 'SSID' || c.name === 'SID'); // Login Real?

          if (hasAuth) {
            isLoggedIn = true;
            const netscapeContent = cookiesToNetscape(allCookies);
            
            // --- SEGURANÇA: SALVA NO STORE CRIPTOGRAFADO ---
            store.set('userCookies', netscapeContent);
            console.log("Cookies salvos com segurança no Store.");

            // Pega Info do Usuário
            await loginWindow.loadURL('https://www.youtube.com/account');
            const userInfo = await loginWindow.webContents.executeJavaScript(`
              new Promise((resolve) => {
                setTimeout(() => {
                  try {
                    const nameEl = document.querySelector("h1") || document.querySelector(".ytd-user-name-renderer");
                    let name = nameEl ? nameEl.innerText.trim() : "Usuário";
                    const images = Array.from(document.querySelectorAll('img'));
                    const avatarImg = images.find(img => img.src && img.src.includes('ggpht.com') && img.width > 50);
                    const avatar = avatarImg ? avatarImg.src : "";
                    resolve({ name, avatar });
                  } catch(e) { resolve({ name: "Usuário Conectado", avatar: "" }); }
                }, 2000);
              })
            `);
            store.set('userInfo', userInfo);

            if (!loginWindow.isDestroyed()) loginWindow.close();
            resolve({ success: true, user: userInfo });
          }
        } catch (error) { resolve({ success: false, error: error.message }); }
      }
    });
    loginWindow.on('closed', () => { if(!isLoggedIn) resolve({ success: false, error: "Janela fechada." }); });
  });
});

// Logout
ipcMain.handle('logoutYoutube', async () => {
  store.delete('userCookies'); // Apaga do cofre
  store.delete('userInfo');
  // Limpa sessão do Electron
  await session.fromPartition('persist:youtube-session').clearStorageData();
  return { success: true };
});

ipcMain.handle('fetchVideoInfo', async (_, url) => {
  try {
    if (!youtubedl) throw new Error("Motor yt-dlp não inicializado.");
    const args = { dumpSingleJson: true, noWarnings: true, noCheckCertificates: true };
    
    const tempCookie = generateTempCookieFile();
    if (tempCookie) args.cookies = tempCookie;

    try {
        const info = await youtubedl(url, args);
        return { title: info.title, thumbnails: info.thumbnails, videoId: info.id, url: url };
    } finally {
        cleanupTempCookie(tempCookie);
    }
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fetchPlaylistItems', async (_, playlistUrl) => {
  try {
    if (!youtubedl) throw new Error("Motor yt-dlp não inicializado.");
    const args = { flatPlaylist: true, dumpSingleJson: true, noWarnings: true, noCheckCertificates: true, ignoreErrors: true };
    
    const tempCookie = generateTempCookieFile();
    if (tempCookie) args.cookies = tempCookie;

    try {
        const rawData = await youtubedl(playlistUrl, args);
        if (!rawData || !rawData.entries) return { error: 'Playlist vazia.' };
        const items = (rawData.entries || []).filter(e => e && e.id && e.title).map(e => ({ id: e.id, title: e.title, url: e.url || `https://youtu.be/${e.id}`, thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg` }));
        return { playlistTitle: rawData.title || 'Playlist', items };
    } finally {
        cleanupTempCookie(tempCookie);
    }
  } catch (err) { return { error: 'Erro backend.', details: err.message }; }
});

ipcMain.handle('downloadVideo', async (_, args) => {
  const rootDir = args.targetFolder ? args.targetFolder : outDir;
  let finalDir = rootDir;
  if (args.subFolder) finalDir = path.join(rootDir, sanitizeFilename(args.subFolder));
  if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
  if (args.subFolder && args.libraryId) createFolderMarker(finalDir, args.libraryId);

  const libId = (args.subFolder && args.libraryId) ? args.libraryId : null;
  const fPath = (args.subFolder) ? finalDir : null;
  manager.addJob(args.title, [{ url: args.url, title: args.title, videoId: args.videoId, targetFolder: finalDir }], libId, fPath);
  return { success: true, title: args.title, finalPath: finalDir };
});

ipcMain.handle('downloadAllVideos', async (_, { items, folder, playlistTitle, libraryId }) => {
  if (!youtubedl) return [];
  let targetDir;
  if (folder) targetDir = folder;
  else if (playlistTitle) targetDir = path.join(outDir, sanitizeFilename(playlistTitle));
  else targetDir = outDir;

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  if (libraryId) createFolderMarker(targetDir, libraryId);

  const tasks = items.map(item => ({ url: item.url, title: item.title, videoId: item.id, targetFolder: targetDir }));
  manager.addJob(playlistTitle || "Playlist", tasks, libraryId, targetDir);
  return { success: true, queued: tasks.length };
});

ipcMain.handle('select-folder', async () => { const result = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
ipcMain.handle('open-downloads-folder', async () => { await shell.openPath(outDir); });
ipcMain.handle('getDefaultPath', () => outDir);
ipcMain.handle('saveData', async (_, data) => { store.set('library', data.library); store.set('history', data.history); return { success: true }; });
ipcMain.handle('loadData', async () => { return { library: store.get('library'), history: store.get('history'), userInfo: store.get('userInfo') }; });
ipcMain.handle('renameFolder', async (_, { oldPath, newName }) => { try { if (!fs.existsSync(oldPath)) return { success: false }; const p = path.dirname(oldPath); const n = path.join(p, sanitizeFilename(newName)); fs.renameSync(oldPath, n); return { success: true, newPath: n, newName: sanitizeFilename(newName) }; } catch (e) { return { success: false, error: e.message }; } });
ipcMain.handle('deleteFolder', async (_, folderPath) => { const r = path.relative(outDir, folderPath); if (r === '' || r.startsWith('..') || folderPath === outDir) return { success: false }; try { if (fs.existsSync(folderPath)) fs.rmSync(folderPath, { recursive: true, force: true }); return { success: true }; } catch (e) { return { success: false, error: e.message }; } });

ipcMain.handle('verifyLibraryIntegrity', async () => {
  console.log('Iniciando verificação inteligente...');
  const library = store.get('library') || [];
  const results = { updates: [], conflicts: [], removals: [] };
  let physicalFolders = [];
  try {
    if (fs.existsSync(outDir)) {
        const entries = fs.readdirSync(outDir, { withFileTypes: true });
        physicalFolders = entries.filter(d => d.isDirectory()).map(d => {
        const fullPath = path.join(outDir, d.name);
        let markerId = null;
        const markerPath = path.join(fullPath, '.tube-meta');
        if (fs.existsSync(markerPath)) { try { markerId = JSON.parse(fs.readFileSync(markerPath, 'utf-8')).id; } catch(e) {} }
        return { name: d.name, path: fullPath, markerId, filesLazy: () => fs.readdirSync(fullPath).filter(f => f.endsWith('.mp3')).map(f => ({ name: f.toLowerCase(), fingerprint: getFileFingerprint(path.join(fullPath, f)) })) };
        });
    }
  } catch (e) { return { error: "Erro disco" }; }

  for (const libItem of library) {
    if (!libItem.path) continue;
    if (fs.existsSync(libItem.path)) {
        const actualName = path.basename(libItem.path);
        const storedName = sanitizeFilename(libItem.title);
        if (actualName !== storedName) results.updates.push({ id: libItem.id, newPath: libItem.path, newTitle: actualName });
        continue; 
    }
    const markerMatch = physicalFolders.find(f => f.markerId === libItem.id);
    if (markerMatch) {
        results.updates.push({ id: libItem.id, newPath: markerMatch.path, newTitle: markerMatch.name, realFilesCount: markerMatch.filesLazy().length });
        continue;
    }
    let bestMatch = null, bestScore = 0;
    const refItems = libItem.items || [];
    const totalRef = refItems.length || 1;
    physicalFolders.forEach(folder => {
        if (folder.markerId && folder.markerId !== libItem.id) return;
        const files = folder.filesLazy();
        let matchCount = 0;
        refItems.forEach(ref => {
            if ((ref.fingerprint && files.some(f => f.fingerprint === ref.fingerprint)) || files.some(f => f.name === sanitizeFilename(ref.title).toLowerCase() + ".mp3")) matchCount++;
        });
        const score = matchCount / totalRef;
        if (score > bestScore) { bestScore = score; bestMatch = { ...folder, files }; }
    });
    if (bestMatch && bestScore >= 0.50) {
        if (bestScore >= 0.90) results.updates.push({ id: libItem.id, newPath: bestMatch.path, newTitle: bestMatch.name, realFilesCount: bestMatch.files.length });
        else results.conflicts.push({ id: libItem.id, title: libItem.title, foundFolder: bestMatch.name, matchPercentage: Math.round(bestScore * 100), newPath: bestMatch.path, realFilesCount: bestMatch.files.length });
    } else {
        results.removals.push({ id: libItem.id, title: libItem.title });
    }
  }
  return results;
});

ipcMain.handle('applyLibrarySync', async (_, { updates, removals }) => {
    const currentLib = store.get('library') || [];
    let newLib = [...currentLib];
    if (updates) updates.forEach(up => { newLib = newLib.map(item => item.id === up.id ? { ...item, title: up.newTitle || item.title, path: up.newPath, fullPath: up.newPath, count: up.realFilesCount || item.count } : item); });
    if (removals) { const ids = new Set(removals.map(r => r.id)); newLib = newLib.filter(item => !ids.has(item.id)); }
    store.set('library', newLib);
    return { success: true, library: newLib };
});

// ========================================================
// 8. AUTO-UPDATER CUSTOMIZADO PARA MSI (GITHUB)
// ========================================================
const semver = require('semver');
const { net } = require('electron');

const GITHUB_REPO = 'JeanCarlos0112/youtube-audio-app-extractor'; // Seu repositório

async function checkForUpdates() {
  if (IS_DEV) {
    console.log("Modo DEV: Pulando verificação de update.");
    return;
  }

  console.log("Verificando atualizações...");

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!response.ok) return; // Falha silenciosa se sem internet

    const data = await response.json();
    const latestVersion = data.tag_name.replace('v', ''); // Remove 'v' se tiver (ex: v1.0.1 -> 1.0.1)
    const currentVersion = app.getVersion();

    console.log(`Versão Atual: ${currentVersion} | Última: ${latestVersion}`);

    // Se a versão do GitHub for maior que a atual
    if (semver.gt(latestVersion, currentVersion)) {
      
      // Procura o arquivo .msi nos assets da release
      const msiAsset = data.assets.find(asset => asset.name.endsWith('.msi'));
      
      if (msiAsset) {
        const choice = await dialog.showMessageBox({
          type: 'info',
          buttons: ['Atualizar Agora', 'Depois'],
          title: 'Nova Versão Disponível',
          message: `A versão ${latestVersion} do TubeFetch está disponível.`,
          detail: 'O download será feito e o instalador abrirá automaticamente.'
        });

        if (choice.response === 0) { // Clicou em "Atualizar Agora"
          downloadAndInstallUpdate(msiAsset.browser_download_url, msiAsset.name);
        }
      }
    }
  } catch (error) {
    console.error("Erro ao verificar update:", error);
  }
}

function downloadAndInstallUpdate(url, filename) {
  const tempPath = path.join(app.getPath('temp'), filename);
  const file = fs.createWriteStream(tempPath);

  // Mostra progresso simplificado (opcional) ou apenas baixa em background
  console.log(`Baixando update de: ${url}`);
  
  // Usa net do Electron ou https nativo
  const request = require('https').get(url, (response) => {
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log("Download concluído. Executando instalador...");
      
      // Executa o MSI e fecha o app atual
      shell.openPath(tempPath).then(() => {
        app.quit();
      });
    });
  });
}