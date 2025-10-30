/**
 * Preload Script
 * Exposes safe IPC methods to renderer process
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { Game, Backup, AppConfig, BackupProgress } from '@types'

// Custom APIs for renderer
const api = {
  // Games
  getGames: (): Promise<Game[]> => ipcRenderer.invoke('get-games'),
  addGame: (name: string, customPath?: string): Promise<Game> =>
    ipcRenderer.invoke('add-game', name, customPath),
  removeGame: (gameId: string): Promise<void> => ipcRenderer.invoke('remove-game', gameId),
  updateAllIcons: (): Promise<{success: boolean, error?: string}> => 
    ipcRenderer.invoke('update-all-icons'),
  
  // Scan for installed games
  scanGames: (): Promise<any[]> => ipcRenderer.invoke('scan-games'),
  cancelScan: (): Promise<void> => ipcRenderer.invoke('cancel-scan'),
  addScannedGames: (games: any[]): Promise<Game[]> => 
    ipcRenderer.invoke('add-scanned-games', games),

  // Backups
  getBackups: (gameId: string): Promise<Backup[]> => ipcRenderer.invoke('get-backups', gameId),
  getLudusaviBackups: (gameName: string): Promise<Backup[]> => ipcRenderer.invoke('get-ludusavi-backups', gameName),
  getBackupPreview: (gameName: string): Promise<any> =>
    ipcRenderer.invoke('get-backup-preview', gameName),
  createBackup: (gameId: string, label?: string): Promise<Backup> =>
    ipcRenderer.invoke('create-backup', gameId, label),
  createLudusaviBackup: (gameName: string, backupType: 'local' | 'gdrive'): Promise<any> =>
    ipcRenderer.invoke('create-ludusavi-backup', gameName, backupType),
  createAllGamesBackup: (): Promise<any> =>
    ipcRenderer.invoke('create-all-games-backup'),
  createAllGamesBackupGdrive: (customFolderName?: string): Promise<any> =>
    ipcRenderer.invoke('create-all-games-backup-gdrive', customFolderName),
  restoreBackup: (backupId: string, shop: string, objectId: string): Promise<void> =>
    ipcRenderer.invoke('restore-backup', backupId, shop, objectId),
  deleteBackup: (backupId: string, shop: string, objectId: string): Promise<void> => 
    ipcRenderer.invoke('delete-backup', backupId, shop, objectId),
  
  // Novo método para marcar backup como cloud-only
  markBackupAsCloudOnly: (backupId: string, shop: string, objectId: string): Promise<void> => 
    ipcRenderer.invoke('mark-backup-as-cloud-only', backupId, shop, objectId),
  
  // Novo método para obter backups do Google Drive
  getGoogleDriveBackups: (shop: string, objectId: string): Promise<any[]> => 
    ipcRenderer.invoke('get-google-drive-backups', shop, objectId),

  // Novos métodos para backups locais
  getLocalBackups: (shop: string, objectId: string): Promise<any[]> => 
    ipcRenderer.invoke('get-local-backups', shop, objectId),
  getAllLocalBackups: (): Promise<any[]> => 
    ipcRenderer.invoke('get-all-local-backups'),

  // Novo método para obter todos os backups (locais e do Google Drive)
  getAllBackups: (): Promise<any[]> => 
    ipcRenderer.invoke('get-all-backups'),

  // Novo método para sincronizar contagens de backup
  syncBackupCounts: (): Promise<void> => 
    ipcRenderer.invoke('sync-backup-counts'),

  // Google Drive
  gdriveInit: (clientId: string, clientSecret: string): Promise<string> =>
    ipcRenderer.invoke('gdrive-init', clientId, clientSecret),
  gdriveAuth: (code: string): Promise<void> => ipcRenderer.invoke('gdrive-auth', code),
  gdriveCheckAuth: (): Promise<boolean> => ipcRenderer.invoke('gdrive-check-auth'),
  gdriveUpload: (backupId: string, shop: string, objectId: string, customFolderName?: string): Promise<void> => 
    ipcRenderer.invoke('gdrive-upload', backupId, shop, objectId, customFolderName),
  gdriveUploadEphemeral: (gameId: string, label?: string, customFolderName?: string): Promise<void> => 
    ipcRenderer.invoke('gdrive-upload-ephemeral', gameId, label, customFolderName),
  gdriveList: (): Promise<any[]> => ipcRenderer.invoke('gdrive-list'),
  gdriveListFolders: (parentId?: string): Promise<any[]> => ipcRenderer.invoke('gdrive-list-folders', parentId),
  gdriveCreateFolder: (folderName: string, parentId?: string): Promise<string> => ipcRenderer.invoke('gdrive-create-folder', folderName, parentId),
  gdriveLogout: (): Promise<void> => ipcRenderer.invoke('gdrive-logout'),

  // Google Drive Default Folder
  setGoogleDriveDefaultFolder: (folderId: string, folderName: string): Promise<void> => 
    ipcRenderer.invoke('set-google-drive-default-folder', folderId, folderName),
  clearGoogleDriveDefaultFolder: (): Promise<void> => 
    ipcRenderer.invoke('clear-google-drive-default-folder'),
  getGoogleDriveDefaultFolder: (): Promise<{id: string, name: string} | null> => 
    ipcRenderer.invoke('get-google-drive-default-folder'),

  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('get-config'),
  updateConfig: (config: Partial<AppConfig>): Promise<void> =>
    ipcRenderer.invoke('update-config', config),
    
  // Verificar se está em modo de produção
  isPackaged: (): Promise<boolean> => ipcRenderer.invoke('is-packaged'),

  // Dialogs
  selectFolder: (): Promise<string> => ipcRenderer.invoke('select-folder'),
  selectCredentials: async (): Promise<{ credentials: any; path: string } | null> => {
    const result = await ipcRenderer.invoke('select-credentials-with-path');
    return result;
  },
  selectCredentialsPath: (): Promise<string> => ipcRenderer.invoke('select-credentials-path'),

  // Shell
  openExternalUrl: (url: string): Promise<void> => ipcRenderer.invoke('open-external-url', url),

  // Ludusavi
  checkLudusavi: (): Promise<boolean> => ipcRenderer.invoke('check-ludusavi'),
  getLudusaviPath: (): Promise<string> => ipcRenderer.invoke('get-ludusavi-path'),
  ludusaviRestore: (gameName: string, fullBackupPath: string): Promise<string> => ipcRenderer.invoke('ludusavi-restore', gameName, fullBackupPath),

  // Cancel backup
  cancelBackup: (): Promise<void> => ipcRenderer.invoke('cancel-backup'),

  // Event listeners
  onScanProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('scan-progress', (_, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('scan-progress')
  },
  onBackupProgress: (callback: (progress: BackupProgress) => void) => {
    ipcRenderer.on('backup-progress', (_, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('backup-progress')
  },
  onBackupProgressSimple: (callback: (progress: number) => void) => {
    ipcRenderer.on('backup-progress-simple', (_, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('backup-progress-simple')
  },
  onRestoreProgress: (callback: (progress: BackupProgress) => void) => {
    ipcRenderer.on('restore-progress', (_, progress) => callback(progress))
    return () => ipcRenderer.removeAllListeners('restore-progress')
  },
  onUploadProgress: (callback: (data: { backupId: string; progress: number }) => void) => {
    ipcRenderer.on('upload-progress', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('upload-progress')
  },

  onGdriveCode: (callback: (code: string) => void) => {
    ipcRenderer.on('gdrive-code', (_, code) => callback(code));
    return () => ipcRenderer.removeAllListeners('gdrive-code');
  },

  // Window control
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke('maximize-window'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('close-window')
}

// Use `contextBridge` to expose APIs to renderer
try {
  contextBridge.exposeInMainWorld('api', api)
  console.log('✅ Preload: API exposta com sucesso!')
} catch (error) {
  console.error('❌ Preload: Erro ao expor API:', error)
  // Fallback se contextBridge falhar
  ;(global as any).api = api
}