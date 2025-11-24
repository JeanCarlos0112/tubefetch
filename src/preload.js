// src/preload.js
const { contextBridge, ipcRenderer, shell } = require('electron');
const path = require('path'); // Necessário para join se usarmos no front, mas idealmente backend resolve

contextBridge.exposeInMainWorld('electronAPI', {
  // Helpers de sistema
  isWindows: process.platform === 'win32',
  
  // Funções de Análise
  analyzeUrl: (url) => {
    try {
      const parsedUrl = new URL(url);
      const params = new URLSearchParams(parsedUrl.search);
      const listId = params.get('list');
      let tipo;
      // Lógica melhorada de detecção
      if (parsedUrl.pathname.includes('/playlist')) {
        tipo = 'playlist';
      } else if (listId && !parsedUrl.pathname.includes('/watch')) {
        tipo = 'playlist';
      } else if (parsedUrl.pathname.includes('/watch') && listId) {
         // Vídeo dentro de playlist -> Tratar como playlist ou dar opção? 
         // Por padrão do youtube-dl, se tiver list, ele baixa a lista.
         // Mas o app trata como 'video' se não for explicitamente página de playlist
         tipo = 'video'; 
      } else if (parsedUrl.pathname.includes('/watch')) {
        tipo = 'video';
      } else if (listId && listId.startsWith('RD')) {
        tipo = 'mix';
      } else {
        tipo = 'desconhecido';
      }
      return { tipo, listId, videoId: params.get('v') };
    } catch (e) {
      console.error("Erro ao analisar URL:", e);
      return { tipo: 'invalida' };
    }
  },

  // Funções de IPC (Comunicação com Backend)
  fetchVideoInfo: (url) => ipcRenderer.invoke('fetchVideoInfo', url),
  fetchPlaylistItems: (url) => ipcRenderer.invoke('fetchPlaylistItems', url),
  
  // CORREÇÃO AQUI: Passamos 'args' direto para não perder 'subFolder' e 'targetFolder'
  downloadVideo: (args) => ipcRenderer.invoke('downloadVideo', args),
  
  downloadAllVideos: (args) => ipcRenderer.invoke('downloadAllVideos', args),
  
  // Sistema de Arquivos
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  getDefaultPath: () => ipcRenderer.invoke('getDefaultPath'),
  renameFolder: (data) => ipcRenderer.invoke('renameFolder', data),
  deleteFolder: (path) => ipcRenderer.invoke('deleteFolder', path),

  // Eventos
  onVideoDownloadComplete: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('video-download-complete', subscription);
    return () => ipcRenderer.removeListener('video-download-complete', subscription);
  },
  removeAllVideoDownloadCompleteListeners: () => ipcRenderer.removeAllListeners('video-download-complete'),
  saveData: (data) => ipcRenderer.invoke('saveData', data),
  loadData: () => ipcRenderer.invoke('loadData'),
});