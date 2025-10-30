/**
 * Game Save Backup & Restore Types
 */

export interface Game {
  id: string
  name: string
  displayName?: string  // Nome amigável (ex: "Hollow Knight Silksong")
  gameId?: string       // ID da plataforma (Steam ID, GOG ID, etc.)
  platform?: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown'
  customSavePath?: string
  coverUrl?: string
  lastBackup?: Date
  backupCount: number
  createdAt: Date
  updatedAt: Date
}

export interface Backup {
  id: string
  gameId: string
  gameName: string
  localPath?: string
  cloudFileId?: string
  label?: string
  sizeBytes: number
  createdAt: Date
  isCloudBackup: boolean
}

export interface LudusaviBackup {
  overall: {
    totalGames: number
    totalBytes: number
    processedGames: number
    processedBytes: number
    changedGames: {
      new: number
      different: number
      same: number
    }
  }
  games: Record<string, LudusaviGame>  // Key pode ser Steam ID, GOG ID ou nome
  
  // Custom path for the backup, extracted from the config
  customBackupPath?: string | null
}

export interface LudusaviGame {
  decision?: 'Processed' | 'Ignored'
  change?: 'New' | 'Different' | 'Same'
  files: Record<string, LudusaviFile>
  registry: Record<string, any>
}

export interface LudusaviFile {
  change: 'New' | 'Different' | 'Same' | 'Removed' | 'Unknown'
  bytes: number
}

// Informações sobre um jogo no manifesto do Ludusavi
export interface LudusaviManifestGame {
  files?: Record<string, LudusaviManifestPath>
  registry?: Record<string, any>
  steam?: {
    id: number | string
  }
  gog?: {
    id: number | string
  }
}

export interface LudusaviManifestPath {
  tags?: string[]  // 'save', 'config', etc.
  when?: Array<{
    os?: string
    store?: string
  }>
}

export interface LudusaviConfig {
  manifest: {
    enable: boolean
    secondary: Array<{
      url: string
      enable: boolean
    }>
  }
  customGames: Array<{
    name: string
    files: string[]
    registry: any[]
  }>
}

export interface AppConfig {
  backupPath: string
  googleDrive: {
    enabled: boolean
    clientId?: string
    clientSecret?: string
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    credentialsPath?: string
    defaultFolderId?: string
    defaultFolderName?: string
  }
  ludusaviPath: string
  autoBackup: boolean
  compressionEnabled: boolean
}

export interface GoogleDriveFile {
  id: string
  name: string
  size: string
  createdTime: string
  modifiedTime: string
  mimeType: string
}

export interface BackupProgress {
  gameId: string
  status: 'detecting' | 'backing-up' | 'uploading' | 'complete' | 'error'
  progress: number
  message: string
}

// Tipo para notificações da aplicação
export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: string
  message: string
  type: NotificationType
}

// Tipos adicionados para compatibilidade com o Hydra
export type GameShop = 'steam' | 'epic' | 'gog' | 'custom' | 'unknown'

export interface UnlockedAchievement {
  id: string
  name: string
  description: string
  iconUrl: string
  unlockTime: number
  isHidden: boolean
}

export interface LocalSaveBackup {
  id: string
  label: string | null
  createdAt: string
  downloadOptionTitle: string | null
  artifactLengthInBytes: number
  hostname: string
}

export interface LocalSaveUserPreferences {
  localSavesPath?: string
  googleDriveCredentialsPath?: string
  googleDriveAccessToken?: string
  googleDriveRefreshToken?: string
}

export interface GoogleDriveConfig {
  credentialsPath?: string
  tokenPath?: string
  userPreferences?: LocalSaveUserPreferences
}

export interface LocalSaveManagerConfig {
  localSavesPath: string
  ludusaviPath?: string
  ludusaviConfigPath?: string
  onProgress?: (message: string) => void
  onError?: (error: Error) => void
}