import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Download, Home, Library, Search, Folder, FolderInput, 
  MoreVertical, CheckCircle2, Loader2, XCircle, Music, 
  ChevronDown, ChevronUp, Trash2, Edit3, CheckSquare, Square, Save, Plus, 
  AlertTriangle, RefreshCw, FileSearch, User, LogOut 
} from 'lucide-react';
import './index.css';

const App = () => {
  // Estados Globais
  const [activeTab, setActiveTab] = useState('home');
  const [customPath, setCustomPath] = useState('Padrão (/Music/YouTubeDownloads)');
  const [realPath, setRealPath] = useState(null);
  const [defaultPath, setDefaultPath] = useState('');
  const [libraryItems, setLibraryItems] = useState([]);
  const [downloadsQueue, setDownloadsQueue] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Estados Home e Modais
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [renamingItem, setRenamingItem] = useState(null);
  const [newNameInput, setNewNameInput] = useState('');
  const [showSingleVideoFolderModal, setShowSingleVideoFolderModal] = useState(false);
  const [singleVideoFolderName, setSingleVideoFolderName] = useState('');
  const [syncConflicts, setSyncConflicts] = useState([]);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // --- INICIALIZAÇÃO ---
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const path = await window.electronAPI.getDefaultPath();
        if (path) setDefaultPath(path);

        const savedData = await window.electronAPI.loadData();
        if (savedData) {
          setLibraryItems(savedData.library || []);
          setDownloadsQueue((savedData.history || []).map(item => {
            if (item.status === 'downloading' || item.status === 'pending') return { ...item, status: 'interrupted', progress: 0 };
            return item;
          }));
          if (savedData.userInfo) setUser(savedData.userInfo); // <--- CARREGA USUÁRIO
        }
        
        runIntegrityCheck();
        setIsLoaded(true);
      } catch (e) { console.error("Erro init:", e); setIsLoaded(true); }
    };
    initializeApp();
  }, []);

  const runIntegrityCheck = async () => { const result = await window.electronAPI.verifyLibraryIntegrity(); if (result.error) return; if (result.updates.length > 0) { await window.electronAPI.applyLibrarySync({ updates: result.updates }); const newData = await window.electronAPI.loadData(); setLibraryItems(newData.library); } if (result.removals.length > 0) { await window.electronAPI.applyLibrarySync({ removals: result.removals }); const newData = await window.electronAPI.loadData(); setLibraryItems(newData.library); alert(`AVISO:\n${result.removals.length} itens removidos pois as pastas não foram encontradas.`); } if (result.conflicts.length > 0) { setSyncConflicts(result.conflicts); setActiveTab('library'); } };
  useEffect(() => { if (isLoaded) { const timer = setTimeout(() => { window.electronAPI.saveData({ library: libraryItems, history: downloadsQueue }); }, 1000); return () => clearTimeout(timer); } }, [libraryItems, downloadsQueue, isLoaded]);
  useEffect(() => { const timer = setTimeout(() => { if (url.trim()) analyzeLink(url); else resetPreview(); }, 800); return () => clearTimeout(timer); }, [url]);
  useEffect(() => { const handleComplete = ({ success, title, file, fingerprint }) => { setDownloadsQueue(prev => prev.map(download => { if (download.type === 'video' && download.items[0].title === title) { return { ...download, status: success ? 'success' : 'error', progress: 100, fingerprint: fingerprint }; } if (download.type === 'playlist' && download.items.some(i => i.title === title)) { const updatedItems = download.items.map(subItem => subItem.title === title ? { ...subItem, status: success ? 'success' : 'error', fingerprint: fingerprint } : subItem ); const completedCount = updatedItems.filter(i => i.status === 'success' || i.status === 'error').length; const progress = Math.round((completedCount / updatedItems.length) * 100); return { ...download, items: updatedItems, progress, status: progress === 100 ? 'success' : 'downloading' }; } return download; })); if (success && fingerprint) { setLibraryItems(prevLib => prevLib.map(libItem => { if (libItem.title === title && !libItem.items) { return { ...libItem, fingerprint }; } if (libItem.items && Array.isArray(libItem.items)) { const updatedSubItems = libItem.items.map(subItem => { if (subItem.title === title) { return { ...subItem, fingerprint }; } return subItem; }); if (updatedSubItems !== libItem.items) { return { ...libItem, items: updatedSubItems }; } } return libItem; })); } }; if (window.electronAPI?.onVideoDownloadComplete) window.electronAPI.onVideoDownloadComplete(handleComplete); return () => window.electronAPI?.removeAllVideoDownloadCompleteListeners?.(); }, []);
  
  const sanitize = (name) => name ? name.replace(/[<>:"/\\|?*]/g, '').trim() : '';
  const getThumbnail = (item) => { if (item.thumbnail) return item.thumbnail; if (item.thumbnails && Array.isArray(item.thumbnails) && item.thumbnails.length > 0) return item.thumbnails[item.thumbnails.length - 1].url; return 'https://via.placeholder.com/320x180/18181b/52525b?text=Audio'; };
  const resetPreview = () => { setPreviewData(null); setPreviewType(null); setIsPlaylistExpanded(false); setSelectedItems(new Set()); setPlaylistTitle(''); };
  
  const analyzeLink = async (inputUrl) => {
    setAnalyzing(true); resetPreview();
    try {
      const analysis = window.electronAPI.analyzeUrl(inputUrl);
      if (analysis.tipo === 'video') {
        const info = await window.electronAPI.fetchVideoInfo(inputUrl);
        if (!info) return alert("Erro de comunicação com backend.");
        if (!info.error) { setPreviewData([info]); setPreviewType('video'); } else alert(`Erro: ${info.error}`);
      } else if (analysis.tipo === 'playlist') {
        const result = await window.electronAPI.fetchPlaylistItems(inputUrl);
        if (!result) return alert("Erro de comunicação com backend.");
        if (!result.error && result.items.length > 0) { setPreviewData(result.items); setPlaylistTitle(result.playlistTitle); setPreviewType('playlist'); setSelectedItems(new Set(result.items.map(i => i.id))); } else alert(`Erro: ${result.error}`);
      }
    } catch (e) { console.error(e); alert(e.message); } finally { setAnalyzing(false); }
  };
  const handleSelectFolder = async () => { const path = await window.electronAPI.selectFolder(); if (path) { setRealPath(path); setCustomPath(path); } };
  const initiateDownloadProcess = () => { if (!previewData) return; if (previewType === 'video') { setSingleVideoFolderName(sanitize(previewData[0].title)); setShowSingleVideoFolderModal(true); } else { executeDownload(true, playlistTitle); } };
  const executeDownload = async (createSubFolderForSingle, subFolderName) => { setShowSingleVideoFolderModal(false); const itemsToDownload = previewData.filter(item => previewType === 'video' ? true : selectedItems.has(item.id)); if (itemsToDownload.length === 0) return alert("Selecione pelo menos um item."); const downloadTitle = previewType === 'video' ? itemsToDownload[0].title : playlistTitle; const mainThumbnail = getThumbnail(itemsToDownload[0]); let finalSubFolderName = null; if (previewType === 'playlist') finalSubFolderName = sanitize(downloadTitle); else if (previewType === 'video' && createSubFolderForSingle) finalSubFolderName = sanitize(subFolderName || downloadTitle); const baseFolder = realPath || defaultPath || "Downloads"; const visualPath = finalSubFolderName ? `${baseFolder}/${finalSubFolderName}` : baseFolder; const newDownloadItem = { id: Date.now(), type: previewType, title: finalSubFolderName || downloadTitle, thumbnail: mainThumbnail, status: 'downloading', progress: 0, path: visualPath, items: itemsToDownload.map(i => ({...i, status: 'pending'})), total: itemsToDownload.length }; setDownloadsQueue(prev => [newDownloadItem, ...prev]); setUrl(''); if (previewType === 'video') { const videoUrl = itemsToDownload[0].url || url; const res = await window.electronAPI.downloadVideo({ url: videoUrl, title: itemsToDownload[0].title, videoId: itemsToDownload[0].videoId || itemsToDownload[0].id, targetFolder: realPath, subFolder: finalSubFolderName, libraryId: newDownloadItem.id }); setDownloadsQueue(prev => prev.map(d => d.id === newDownloadItem.id ? { ...d, status: res.success ? 'success' : 'error', progress: 100 } : d)); if (createSubFolderForSingle && res.success) { setLibraryItems(prev => [{ id: newDownloadItem.id, title: finalSubFolderName, count: itemsToDownload.length, thumbnail: mainThumbnail, path: res.finalPath, fullPath: res.finalPath, items: itemsToDownload }, ...prev]); } } else { let folderParam = null; if (realPath && finalSubFolderName) { const separator = window.electronAPI.isWindows ? '\\' : '/'; folderParam = realPath + separator + finalSubFolderName; } await window.electronAPI.downloadAllVideos({ items: itemsToDownload, folder: folderParam, playlistTitle: finalSubFolderName, libraryId: newDownloadItem.id }); const estimatedPath = realPath ? `${realPath}/${finalSubFolderName}` : `${defaultPath}/${finalSubFolderName}`; setLibraryItems(prev => [{ id: newDownloadItem.id, title: finalSubFolderName, count: itemsToDownload.length, thumbnail: mainThumbnail, path: visualPath, fullPath: folderParam || estimatedPath, items: itemsToDownload }, ...prev]); } };
  const deleteLibraryItem = async (id) => { const item = libraryItems.find(i => i.id === id); if (!item) return; if (confirm(`Excluir "${item.title}"? Isso apagará a pasta e os arquivos.`)) { if (item.fullPath) await window.electronAPI.deleteFolder(item.fullPath); setLibraryItems(prev => prev.filter(i => i.id !== id)); } };
  const handleRenameConfirm = async () => { if (!renamingItem || !newNameInput.trim()) return; if (renamingItem.fullPath) { const res = await window.electronAPI.renameFolder({ oldPath: renamingItem.fullPath, newName: newNameInput }); if (res.success) setLibraryItems(prev => prev.map(i => i.id === renamingItem.id ? { ...i, title: res.newName, fullPath: res.newPath, path: res.newPath } : i)); else alert("Erro: " + res.error); } setRenamingItem(null); };
  const resolveConflict = async (accepted) => { const conflict = syncConflicts[currentConflictIndex]; if (accepted) { const update = { id: conflict.id, newPath: conflict.newPath, newTitle: conflict.foundFolder, realFilesCount: conflict.realFilesCount }; await window.electronAPI.applyLibrarySync({ updates: [update] }); const newData = await window.electronAPI.loadData(); setLibraryItems(newData.library); } if (currentConflictIndex < syncConflicts.length - 1) setCurrentConflictIndex(prev => prev + 1); else { setSyncConflicts([]); setCurrentConflictIndex(0); } };

  // --- FUNÇÃO DE LOGIN ATUALIZADA ---
  const handleLogin = async () => {
    if (user) {
      if(confirm("Deseja desconectar e trocar de conta?")) {
         alert("Para trocar de conta, por favor faça o processo novamente.");
      }
      return;
    }

    const msg = "Conectar sua conta do YouTube?\n\nIsso abrirá uma janela segura do Google para você fazer login.\nRecomendado para baixar vídeos sem restrições.";
    if (confirm(msg)) {
      const res = await window.electronAPI.loginYoutube();
      if (res.success && res.user) {
        setUser(res.user);
        alert(`Bem-vindo, ${res.user.name}!`);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowUserMenu(false);
    if (confirm("Deseja realmente desconectar sua conta?")) {
      await window.electronAPI.logoutYoutube(); 
      setUser(null);
      // alert("Desconectado.");
    }
  };
  
  // LISTENER DE ATUALIZAÇÃO DA BIBLIOTECA
  useEffect(() => {
    if (window.electronAPI?.onLibraryUpdated) {
      const removeListener = window.electronAPI.onLibraryUpdated((newLibrary) => {
        console.log("Biblioteca atualizada pelo Backend (Auditoria):", newLibrary);
        setLibraryItems(newLibrary);
      });
      return () => removeListener();
    }
  }, []);

  return (
    <div className="flex h-screen bg-zinc-950 font-sans selection:bg-amber-500/30 text-zinc-100 relative">
      
      {syncConflicts.length > 0 && (<div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center animate-fade-in backdrop-blur-md"><div className="bg-zinc-900 p-8 rounded-2xl border border-amber-500/50 shadow-2xl w-[500px] text-center"><div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><FileSearch className="text-amber-500" size={32} /></div><h3 className="text-2xl font-bold mb-2 text-white">Sincronização Necessária</h3><p className="text-zinc-400 text-sm mb-6 leading-relaxed">A pasta original da playlist <strong>"{syncConflicts[currentConflictIndex].title}"</strong> não foi encontrada.<br/><br/>Encontramos uma pasta chamada <strong>"{syncConflicts[currentConflictIndex].foundFolder}"</strong> com {syncConflicts[currentConflictIndex].matchPercentage}% de conteúdo idêntico.<br/><br/>Deseja atualizar sua biblioteca?</p><div className="flex gap-3 justify-center"><button onClick={() => resolveConflict(false)} className="px-6 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition font-medium">Não</button><button onClick={() => resolveConflict(true)} className="px-6 py-3 rounded-xl bg-amber-500 text-zinc-900 font-bold hover:bg-amber-400 transition flex items-center gap-2"><RefreshCw size={18}/> Sim</button></div><div className="mt-4 text-xs text-zinc-600">Conflito {currentConflictIndex + 1} de {syncConflicts.length}</div></div></div>)}
      {showSingleVideoFolderModal && (<div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"><div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700 shadow-2xl w-[450px]"><h3 className="text-xl font-bold mb-2 text-white">Organizar Download</h3><p className="text-zinc-400 text-sm mb-6">Deseja criar uma pasta específica para esta música?</p><div className="mb-6"><label className="text-xs text-amber-500 font-bold mb-1 block uppercase">Nome da Pasta Sugerido</label><input autoFocus type="text" value={singleVideoFolderName} onChange={(e) => setSingleVideoFolderName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-white outline-none focus:border-amber-500" /></div><div className="flex justify-between gap-3"><button onClick={() => executeDownload(false, null)} className="px-4 py-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition text-sm flex-1">Não, salvar solto</button><button onClick={() => executeDownload(true, singleVideoFolderName)} className="px-4 py-3 rounded-lg bg-amber-500 text-zinc-900 font-bold hover:bg-amber-400 transition text-sm flex-1 flex justify-center items-center gap-2"><Plus size={16}/> Sim, criar pasta</button></div></div></div>)}
      {renamingItem && (<div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm"><div className="bg-zinc-900 p-6 rounded-xl border border-zinc-700 shadow-2xl w-96"><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Edit3 size={18} className="text-amber-500"/> Renomear</h3><input autoFocus type="text" value={newNameInput} onChange={(e) => setNewNameInput(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 mb-4 text-white outline-none focus:border-amber-500" /><div className="flex justify-end gap-3"><button onClick={() => setRenamingItem(null)} className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition text-sm">Cancelar</button><button onClick={handleRenameConfirm} className="px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 font-bold hover:bg-amber-400 transition text-sm flex items-center gap-2"><Save size={16}/> Salvar</button></div></div></div>)}

      <aside className="w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col p-4 shrink-0">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2"><div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20"><Download className="text-zinc-950" size={20} strokeWidth={3} /></div><span className="text-xl font-bold tracking-tight">TubeFetch</span></div>
        <nav className="space-y-1 flex-1">
          <SidebarBtn icon={Home} label="Home" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
          <SidebarBtn icon={Download} label="Downloads" active={activeTab === 'downloads'} onClick={() => setActiveTab('downloads')} count={downloadsQueue.filter(d => d.status === 'downloading').length} />
          <SidebarBtn icon={Library} label="Biblioteca" active={activeTab === 'library'} onClick={() => setActiveTab('library')} />
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-8 bg-zinc-950 shrink-0 z-20 relative">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={18} />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-10 pr-4 py-2 text-sm outline-none focus:border-amber-500/50 transition" 
            />
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              // --- ÁREA DO USUÁRIO LOGADO ---
              <div className="relative" ref={userMenuRef}>
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className={`
                    flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full border transition-all duration-300 group
                    bg-green-500/10 border-green-500/30 hover:bg-green-500/20 hover:border-green-500/60
                    ${showUserMenu ? 'ring-2 ring-green-500/20' : ''}
                  `}
                >
                   <img 
                     src={user.avatar || 'https://via.placeholder.com/40?text=U'} 
                     className="w-8 h-8 rounded-full object-cover border-2 border-green-500"
                     alt="Perfil" 
                   />
                   <div className="flex flex-col items-start">
                      <span className="text-xs font-bold leading-tight max-w-[120px] truncate text-green-400 group-hover:text-green-300 transition-colors">
                        {user.name}
                      </span>
                      <span className="text-[10px] font-medium text-green-600 group-hover:text-green-500 transition-colors">
                        ● Conectado
                      </span>
                   </div>
                   <ChevronDown size={14} className={`text-green-600 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-fade-in flex flex-col">
                    <button 
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-3 text-left text-red-500 hover:bg-red-500/10 transition-colors duration-200 w-full group"
                    >
                      <LogOut size={16} className="group-hover:scale-110 transition-transform"/>
                      <span className="font-medium text-sm">Desconectar</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // --- BOTÃO DE CONECTAR ---
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-500/20 rounded-full transition-all duration-300 text-xs font-bold uppercase tracking-wide hover:shadow-[0_0_15px_rgba(220,38,38,0.4)]"
              >
                <User size={14} strokeWidth={3} />
                Conectar
              </button>
            )}

            <div className="h-4 w-px bg-zinc-800"></div> 
            
            <div className="flex gap-4 text-zinc-400 text-sm font-medium">
              <button className="hover:text-white transition">Configurações</button>
              <button className="hover:text-white transition">Ajuda</button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          {activeTab === 'home' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
              <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 shadow-2xl">
                <h2 className="text-lg font-bold mb-1">Novo Download</h2>
                <p className="text-zinc-400 text-sm mb-6">Cole o link do YouTube para começar</p>
                <div className="relative mb-4"><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} disabled={analyzing} placeholder="https://youtube.com..." className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-4 pl-4 pr-24 outline-none focus:border-amber-500 transition font-mono text-sm text-amber-500 disabled:opacity-50" /><div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1"><button onClick={handleSelectFolder} title="Alterar destino" className="p-2 text-zinc-500 hover:text-amber-500 hover:bg-zinc-800 rounded"><FolderInput size={20}/></button><button onClick={() => window.electronAPI.openDownloadsFolder()} title="Abrir pasta" className="p-2 text-zinc-500 hover:text-amber-500 hover:bg-zinc-800 rounded"><Folder size={20}/></button></div></div>
                <div className="text-xs text-zinc-500 mb-6 flex gap-2"><span>Salvando em:</span><span className="text-zinc-300 truncate max-w-md">{customPath}</span></div>
                <button onClick={initiateDownloadProcess} disabled={analyzing || !previewData || (previewType === 'playlist' && selectedItems.size === 0)} className={`w-full py-3 rounded-lg font-bold text-zinc-900 transition ${analyzing || !previewData ? 'bg-zinc-800 text-zinc-500' : 'bg-amber-500 hover:bg-amber-400'}`}>{analyzing ? 'Analisando...' : previewData ? `Baixar ${previewType === 'playlist' ? `(${selectedItems.size} itens)` : 'Vídeo'}` : 'Analisar'}</button>
              </div>
              {previewData && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden animate-fade-in">
                  <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                    <div className="flex items-center gap-3">
                       {previewType === 'video' ? (<img src={previewData[0].thumbnails.pop().url} className="w-16 h-10 object-cover rounded" />) : (<div className="flex -space-x-2">{previewData.slice(0,3).map(i => <img key={i.id} src={i.thumbnail} className="w-10 h-10 rounded-full border-2 border-zinc-900" />)}</div>)}
                       <div><h3 className="font-bold text-sm">{previewType === 'video' ? previewData[0].title : playlistTitle}</h3><p className="text-xs text-zinc-500">{previewType === 'video' ? 'Vídeo Único' : `${previewData.length} faixas encontradas`}</p></div>
                    </div>
                    {previewType === 'playlist' && (<button onClick={() => setIsPlaylistExpanded(!isPlaylistExpanded)} className="flex items-center gap-2 text-xs font-bold text-amber-500 hover:bg-amber-500/10 px-3 py-1.5 rounded transition">{isPlaylistExpanded ? 'Recolher' : 'Selecionar Faixas'} {isPlaylistExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>)}
                  </div>
                  {isPlaylistExpanded && previewType === 'playlist' && (<div className="bg-zinc-900 max-h-[300px] overflow-y-auto p-2"><div className="flex justify-end px-2 mb-2"><button onClick={() => {if (selectedItems.size === previewData.length) setSelectedItems(new Set()); else setSelectedItems(new Set(previewData.map(i => i.id)));}} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">{selectedItems.size === previewData.length ? <CheckSquare size={14}/> : <Square size={14}/>} {selectedItems.size === previewData.length ? 'Desmarcar Tudo' : 'Selecionar Tudo'}</button></div>{previewData.map(item => (<div key={item.id} onClick={() => {const newSet = new Set(selectedItems); if (newSet.has(item.id)) newSet.delete(item.id); else newSet.add(item.id); setSelectedItems(newSet);}} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition border border-transparent ${selectedItems.has(item.id) ? 'bg-zinc-900 border-amber-500/30' : 'hover:bg-zinc-900'}`}><div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedItems.has(item.id) ? 'bg-amber-500 border-amber-500 text-zinc-900' : 'border-zinc-600'}`}>{selectedItems.has(item.id) && <CheckCircle2 size={14}/>}</div><img src={item.thumbnail} className="w-12 h-8 object-cover rounded" /><p className={`text-sm truncate flex-1 ${selectedItems.has(item.id) ? 'text-white' : 'text-zinc-500'}`}>{item.title}</p></div>))}</div>)}
                </div>
              )}
            </div>
          )}
          {activeTab === 'downloads' && (<div className="max-w-5xl mx-auto space-y-4 animate-fade-in">{downloadsQueue.length === 0 && <div className="text-center text-zinc-600 py-20">Nenhum download recente.</div>}{downloadsQueue.map(download => (<div key={download.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-4"><div className="flex gap-4"><img src={download.thumbnail} className="w-24 h-16 object-cover rounded bg-zinc-950" /><div className="flex-1 min-w-0"><div className="flex justify-between mb-2"><h3 className="font-bold truncate">{download.title}</h3><StatusBadge status={download.status} /></div><div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative"><div className={`h-full transition-all duration-500 ${download.status === 'success' ? 'bg-green-500' : download.status === 'error' ? 'bg-red-500' : (download.status === 'interrupted' ? 'bg-zinc-600' : 'bg-amber-500')}`} style={{width: `${download.progress}%`}} /></div><div className="flex justify-between text-xs text-zinc-500 mt-1"><span>{download.type === 'playlist' ? `${download.items.filter(i=>i.status==='success').length}/${download.total} concluídos` : ''}</span><span>{download.status === 'interrupted' ? 'Interrompido' : download.progress + '%'}</span></div></div></div></div>))}</div>)}
          {activeTab === 'library' && (<div className="max-w-6xl mx-auto animate-fade-in grid grid-cols-1 md:grid-cols-3 gap-6">{libraryItems.length === 0 && <div className="col-span-3 text-center text-zinc-500 py-20">Biblioteca vazia.</div>}{libraryItems.map(item => (<LibraryCard key={item.id} item={item} onRename={() => {setRenamingItem(item); setNewNameInput(item.title);}} onDelete={() => deleteLibraryItem(item.id)} />))}</div>)}
        </div>
      </main>
    </div>
  );
};
const LibraryCard = ({ item, onRename, onDelete }) => {const [showMenu, setShowMenu] = useState(false); const menuRef = useRef(null); useEffect(() => {const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); }; document.addEventListener('mousedown', handleClick); return () => document.removeEventListener('mousedown', handleClick);}, []); return (<div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 group relative hover:border-zinc-600 transition"><div className="h-32 bg-zinc-950 relative"><img src={item.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition" /><div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" /><div className="absolute top-2 right-2" ref={menuRef}><button onClick={() => setShowMenu(!showMenu)} className="p-1.5 bg-zinc-950/80 rounded-full text-zinc-400 hover:text-white transition"><MoreVertical size={16}/></button>{showMenu && (<div className="absolute right-0 top-8 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 w-32 z-10 flex flex-col text-sm"><button onClick={() => { onRename(); setShowMenu(false); }} className="px-3 py-2 text-left hover:bg-zinc-700 flex items-center gap-2"><Edit3 size={14}/> Renomear</button><button onClick={() => { onDelete(); setShowMenu(false); }} className="px-3 py-2 text-left hover:bg-zinc-700 text-red-400 flex items-center gap-2"><Trash2 size={14}/> Remover</button></div>)}</div><span className="absolute bottom-2 right-2 bg-zinc-950/80 text-xs px-2 py-1 rounded text-zinc-300 flex items-center gap-1"><Music size={12}/> {item.count}</span></div><div className="p-4"><h3 className="font-bold text-zinc-100 truncate" title={item.title}>{item.title}</h3><p className="text-xs text-zinc-500 mt-1 flex items-center gap-1 truncate"><Folder size={10} /> {item.path}</p></div></div>);};
const SidebarBtn = ({ icon: Icon, label, active, onClick, count }) => (<button onClick={onClick} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition ${active ? 'bg-zinc-900 text-amber-500' : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'}`}><div className="flex items-center gap-3"><Icon size={20} /><span>{label}</span></div>{count > 0 && <span className="bg-amber-500 text-zinc-900 text-xs font-bold px-1.5 py-0.5 rounded">{count}</span>}</button>);
const StatusBadge = ({ status }) => {if (status === 'success') return <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded flex items-center gap-1"><CheckCircle2 size={12}/> Sucesso</span>; if (status === 'error') return <span className="text-xs bg-red-500/10 text-red-500 px-2 py-1 rounded flex items-center gap-1"><XCircle size={12}/> Erro</span>; if (status === 'interrupted') return <span className="text-xs bg-zinc-500/10 text-zinc-500 px-2 py-1 rounded flex items-center gap-1"><AlertTriangle size={12}/> Interrompido</span>; return <span className="text-xs bg-amber-500/10 text-amber-500 px-2 py-1 rounded flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Baixando</span>;};
const container = document.getElementById('root'); const root = createRoot(container); root.render(<App />);
