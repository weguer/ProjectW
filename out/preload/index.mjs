import { contextBridge, ipcRenderer } from "electron";
const api = {
  // Games
  getGames: () => ipcRenderer.invoke("get-games"),
  addGame: (name, customPath) => ipcRenderer.invoke("add-game", name, customPath),
  removeGame: (gameId) => ipcRenderer.invoke("remove-game", gameId),
  updateAllIcons: () => ipcRenderer.invoke("update-all-icons"),
  // Scan for installed games
  scanGames: () => ipcRenderer.invoke("scan-games"),
  cancelScan: () => ipcRenderer.invoke("cancel-scan"),
  addScannedGames: (games) => ipcRenderer.invoke("add-scanned-games", games),
  // Backups
  getBackups: (gameId) => ipcRenderer.invoke("get-backups", gameId),
  getLudusaviBackups: (gameName) => ipcRenderer.invoke("get-ludusavi-backups", gameName),
  getBackupPreview: (gameName) => ipcRenderer.invoke("get-backup-preview", gameName),
  createBackup: (gameId, label) => ipcRenderer.invoke("create-backup", gameId, label),
  createLudusaviBackup: (gameName, backupType) => ipcRenderer.invoke("create-ludusavi-backup", gameName, backupType),
  createAllGamesBackup: () => ipcRenderer.invoke("create-all-games-backup"),
  createAllGamesBackupGdrive: (customFolderName) => ipcRenderer.invoke("create-all-games-backup-gdrive", customFolderName),
  restoreBackup: (backupId, shop, objectId) => ipcRenderer.invoke("restore-backup", backupId, shop, objectId),
  deleteBackup: (backupId, shop, objectId) => ipcRenderer.invoke("delete-backup", backupId, shop, objectId),
  // Novo método para marcar backup como cloud-only
  markBackupAsCloudOnly: (backupId, shop, objectId) => ipcRenderer.invoke("mark-backup-as-cloud-only", backupId, shop, objectId),
  // Novo método para obter backups do Google Drive
  getGoogleDriveBackups: (shop, objectId) => ipcRenderer.invoke("get-google-drive-backups", shop, objectId),
  // Novos métodos para backups locais
  getLocalBackups: (shop, objectId) => ipcRenderer.invoke("get-local-backups", shop, objectId),
  getAllLocalBackups: () => ipcRenderer.invoke("get-all-local-backups"),
  // Novo método para obter todos os backups (locais e do Google Drive)
  getAllBackups: () => ipcRenderer.invoke("get-all-backups"),
  // Novo método para sincronizar contagens de backup
  syncBackupCounts: () => ipcRenderer.invoke("sync-backup-counts"),
  // Google Drive
  gdriveInit: (clientId, clientSecret) => ipcRenderer.invoke("gdrive-init", clientId, clientSecret),
  gdriveAuth: (code) => ipcRenderer.invoke("gdrive-auth", code),
  gdriveCheckAuth: () => ipcRenderer.invoke("gdrive-check-auth"),
  gdriveUpload: (backupId, shop, objectId, customFolderName) => ipcRenderer.invoke("gdrive-upload", backupId, shop, objectId, customFolderName),
  gdriveUploadEphemeral: (gameId, label, customFolderName) => ipcRenderer.invoke("gdrive-upload-ephemeral", gameId, label, customFolderName),
  gdriveList: () => ipcRenderer.invoke("gdrive-list"),
  gdriveListFolders: (parentId) => ipcRenderer.invoke("gdrive-list-folders", parentId),
  gdriveCreateFolder: (folderName, parentId) => ipcRenderer.invoke("gdrive-create-folder", folderName, parentId),
  gdriveLogout: () => ipcRenderer.invoke("gdrive-logout"),
  // Google Drive Default Folder
  setGoogleDriveDefaultFolder: (folderId, folderName) => ipcRenderer.invoke("set-google-drive-default-folder", folderId, folderName),
  clearGoogleDriveDefaultFolder: () => ipcRenderer.invoke("clear-google-drive-default-folder"),
  getGoogleDriveDefaultFolder: () => ipcRenderer.invoke("get-google-drive-default-folder"),
  // Config
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config) => ipcRenderer.invoke("update-config", config),
  // Verificar se está em modo de produção
  isPackaged: () => ipcRenderer.invoke("is-packaged"),
  // Dialogs
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  selectCredentials: async () => {
    const result = await ipcRenderer.invoke("select-credentials-with-path");
    return result;
  },
  selectCredentialsPath: () => ipcRenderer.invoke("select-credentials-path"),
  // Shell
  openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url),
  // Ludusavi
  checkLudusavi: () => ipcRenderer.invoke("check-ludusavi"),
  getLudusaviPath: () => ipcRenderer.invoke("get-ludusavi-path"),
  ludusaviRestore: (gameName, fullBackupPath) => ipcRenderer.invoke("ludusavi-restore", gameName, fullBackupPath),
  // Cancel backup
  cancelBackup: () => ipcRenderer.invoke("cancel-backup"),
  // Event listeners
  onScanProgress: (callback) => {
    ipcRenderer.on("scan-progress", (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners("scan-progress");
  },
  onBackupProgress: (callback) => {
    ipcRenderer.on("backup-progress", (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners("backup-progress");
  },
  onBackupProgressSimple: (callback) => {
    ipcRenderer.on("backup-progress-simple", (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners("backup-progress-simple");
  },
  onRestoreProgress: (callback) => {
    ipcRenderer.on("restore-progress", (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners("restore-progress");
  },
  onUploadProgress: (callback) => {
    ipcRenderer.on("upload-progress", (_, data) => callback(data));
    return () => ipcRenderer.removeAllListeners("upload-progress");
  },
  onGdriveCode: (callback) => {
    ipcRenderer.on("gdrive-code", (_, code) => callback(code));
    return () => ipcRenderer.removeAllListeners("gdrive-code");
  },
  // Window control
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  closeWindow: () => ipcRenderer.invoke("close-window")
};
try {
  contextBridge.exposeInMainWorld("api", api);
  console.log("✅ Preload: API exposta com sucesso!");
} catch (error) {
  console.error("❌ Preload: Erro ao expor API:", error);
  global.api = api;
}
