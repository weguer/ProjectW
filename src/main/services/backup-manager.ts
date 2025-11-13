/**
 * Backup Manager Service
 * Orchestrates backup and restore operations
 * Adapted to follow Hydra's approach
 */

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { v4 as uuid } from 'uuid'
import { Ludusavi } from './ludusavi'
import { GoogleDriveService } from './google-drive'
import Store from 'electron-store'
import { app } from 'electron'
import type { Game, Backup, BackupProgress, AppConfig, GameShop, LocalSaveBackup, LocalSaveManagerConfig, GoogleDriveConfig } from '@types'
import { LocalSaveManager } from './local-save-manager'

export class BackupManager {
  private store: Store<any>
  private googleDrive: GoogleDriveService
  private localSaveManager: LocalSaveManager

  constructor() {
    // Usar um diretório seguro baseado no userData do Electron
    const defaultBackupPath = this.getSecureAppDataPath('backups');
    
    this.store = new Store({
      defaults: {
        games: [],
        backups: [],
        config: {
          backupPath: defaultBackupPath,
          googleDrive: {
            enabled: false,
            defaultFolderId: null,
            defaultFolderName: null
          },
          ludusaviPath: '',
          autoBackup: false,
          compressionEnabled: true
        }
      }
    })

    this.googleDrive = new GoogleDriveService()
    
    // Initialize LocalSaveManager with config
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    this.localSaveManager = new LocalSaveManager(localSaveConfig)
    
    this.ensureBackupDirectory()
    
    // Synchronize backup counts on startup
    this.syncBackupCounts().catch(console.error)
  }

  /**
   * Update game cover URL
   */
  public updateGameCover(gameId: string, coverUrl: string): void {
    const games = this.store.get('games') as Game[]
    const game = games.find((g: Game) => g.id === gameId)
    
    if (game) {
      game.coverUrl = coverUrl
      game.updatedAt = new Date()
      this.store.set('games', games)
      console.log(`✅ Cover URL atualizada para o jogo ${game.name}: ${coverUrl}`)
    } else {
      console.warn(`⚠️ Jogo não encontrado para atualização: ${gameId}`)
    }
  }

  /**
   * Get a secure app data path for backups and configs
   */
  private getSecureAppDataPath(subDir: string): string {
    try {
      // Usar o diretório userData do Electron que é seguro em todos os sistemas
      const userDataPath = app.getPath('userData');
      const fullPath = path.join(userDataPath, subDir);
      return fullPath;
    } catch (error) {
      console.error('❌ Erro ao obter caminho seguro do userData:', error);
      // Fallback para um diretório temporário se necessário
      const tempPath = path.join(os.tmpdir(), 'project-w', subDir);
      return tempPath;
    }
  }

  /**
   * Ensure backup directory exists
   */
  private ensureBackupDirectory(): void {
    try {
      const backupPath = this.store.get('config').backupPath;
      
      // Verificar se o caminho é válido
      if (!backupPath || backupPath.trim() === '') {
        console.error('❌ Caminho de backup inválido:', backupPath);
        // Usar um fallback seguro
        const fallbackPath = this.getSecureAppDataPath('backups');
        this.store.set('config.backupPath', fallbackPath);
        
        if (!fs.existsSync(fallbackPath)) {
          fs.mkdirSync(fallbackPath, { recursive: true });
        }
        return;
      }
      
      // Criar diretório se não existir
      if (!fs.existsSync(backupPath)) {
        console.log(`📁 Criando diretório de backup: ${backupPath}`);
        fs.mkdirSync(backupPath, { recursive: true });
      }
      
      // Também garantir que os subdiretórios necessários existam
      const configPath = path.join(backupPath, 'config');
      const cloudSavesPath = path.join(backupPath, 'CloudSaves');
      
      if (!fs.existsSync(configPath)) {
        fs.mkdirSync(configPath, { recursive: true });
      }
      
      if (!fs.existsSync(cloudSavesPath)) {
        fs.mkdirSync(cloudSavesPath, { recursive: true });
      }
    } catch (error) {
      console.error('❌ Erro ao criar diretório de backup:', error);
      // Tentar usar um diretório temporário como fallback
      try {
        const tempPath = this.getSecureAppDataPath('backups');
        console.log(`🔄 Usando diretório temporário como fallback: ${tempPath}`);
        this.store.set('config.backupPath', tempPath);
        
        if (!fs.existsSync(tempPath)) {
          fs.mkdirSync(tempPath, { recursive: true });
        }
      } catch (fallbackError) {
        console.error('❌ Erro no fallback de criação de diretório:', fallbackError);
        // Se tudo falhar, continuar a execução sem travar o app
      }
    }
  }

  /**
   * Get all games
   */
  public getGames(): Game[] {
    return this.store.get('games') as Game[]
  }

  /**
   * Add a new game
   */
  public addGame(
    name: string,
    customSavePath?: string,
    coverUrl?: string,
    gameId?: string,
    platform?: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown',
    displayName?: string
  ): Game {
    const games = this.store.get('games') as Game[]
    
    // Check if game already exists (by name or gameId)
    const existing = games.find((g: Game) => 
      g.name === name || (gameId && g.gameId === gameId)
    )
    if (existing) {
      throw new Error(`Game "${name}" already exists`)
    }

    const game: Game = {
      id: uuid(),
      name,
      displayName: displayName || name,
      gameId,
      platform,
      customSavePath,
      coverUrl,
      backupCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    games.push(game)
    this.store.set('games', games)

    // Add to Ludusavi if custom path provided
    if (customSavePath) {
      Ludusavi.addCustomGame(name, customSavePath).catch(console.error)
    }

    return game
  }

  /**
   * Remove a game
   */
  public removeGame(gameId: string): void {
    const games = this.store.get('games') as Game[]
    const game = games.find((g: Game) => g.id === gameId)
    
    if (game?.customSavePath) {
      Ludusavi.removeCustomGame(game.name).catch(console.error)
    }

    this.store.set('games', games.filter((g: Game) => g.id !== gameId))
    
    // Also remove associated backups
    const backups = this.store.get('backups') as Backup[]
    this.store.set('backups', backups.filter((b: Backup) => b.gameId !== gameId))
  }

  /**
   * Get backups for a game
   */
  public getBackupsForGame(gameId: string): Backup[] {
    const backups = this.store.get('backups') as Backup[]
    return backups.filter((b: Backup) => b.gameId === gameId)
  }

  /**
   * Get backup preview (detect saves without backing up)
   */
  public async getBackupPreview(gameName: string): Promise<any> {
    // For compatibility with existing code, we'll use the old approach
    return await Ludusavi.getBackupPreview('steam', gameName)
  }

  /**
   * Create a local backup using Hydra's approach
   */
  public async createLocalBackup(
    gameId: string,
    label?: string,
    onProgress?: (progress: BackupProgress) => void
  ): Promise<LocalSaveBackup> {
    const games = this.store.get('games') as Game[]
    const game = games.find((g: Game) => g.id === gameId)

    if (!game) {
      throw new Error('Game not found')
    }

    onProgress?.({
      gameId,
      status: 'detecting',
      progress: 0,
      message: 'Detecting save files...'
    })

    // Use Hydra's LocalSaveManager to create backup
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    
    // Create a new instance to ensure config is up to date
    const localSaveManager = new LocalSaveManager(localSaveConfig)
    
    // Determine shop type
    const shop: GameShop = game.platform || 'steam'
    const objectId = game.gameId || game.name

    onProgress?.({
      gameId,
      status: 'backing-up',
      progress: 30,
      message: 'Creating backup...'
    })

    const backup = await localSaveManager.createLocalBackup(
      objectId,
      shop,
      null, // downloadOptionTitle
      label
    )

    onProgress?.({
      gameId,
      status: 'complete',
      progress: 100,
      message: 'Backup completed successfully'
    })

    // Update game
    game.lastBackup = new Date()
    game.backupCount++
    game.updatedAt = new Date()
    this.store.set('games', games)

    return backup
  }

  /**
   * Upload backup to Google Drive using Hydra's approach
   */
  public async uploadToGoogleDrive(
    backupId: string,
    shop: GameShop,
    objectId: string,
    onProgress?: (progress: number) => void,
    customFolderName?: string
  ): Promise<void> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .trim() || 'Unknown_Game';
      
    // Get the backup path from local saves
    const backupPath = path.join(this.store.get('config').backupPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId)
    
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup not found')
    }

    if (!this.store.get('config').googleDrive.enabled) {
      throw new Error('Google Drive not enabled')
    }

    // Create GoogleDriveConfig
    const googleDriveConfig: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: this.store.get('config').googleDrive.credentialsPath,
        googleDriveAccessToken: this.store.get('config').googleDrive.accessToken,
        googleDriveRefreshToken: this.store.get('config').googleDrive.refreshToken
      }
    }

    const fileId = await this.googleDrive.uploadBackup(
      shop,
      objectId,
      backupPath,
      backupId,
      googleDriveConfig,
      customFolderName, // Usar o nome da pasta personalizada se fornecido
      (current, total) => {
        if (onProgress) {
          onProgress((current / total) * 100)
        }
      }
    )

    // Update backup record if needed
    console.log(`Backup uploaded with file ID: ${fileId}`)
  }

  /**
   * Create an ephemeral backup and upload directly to Google Drive without saving locally
   */
  public async createEphemeralBackupAndUploadToGoogleDrive(
    gameId: string,
    label?: string,
    onProgress?: (progress: number) => void,
    customFolderName?: string
  ): Promise<void> {
    const games = this.store.get('games') as Game[]
    const game = games.find((g: Game) => g.id === gameId)

    if (!game) {
      throw new Error('Game not found')
    }

    if (!this.store.get('config').googleDrive.enabled) {
      throw new Error('Google Drive not enabled')
    }

    // Determine shop type
    const shop: GameShop = game.platform || 'steam'
    const objectId = game.gameId || game.name

    // Create ephemeral backup (temporary backup that won't be saved locally)
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    
    const localSaveManager = new LocalSaveManager(localSaveConfig)
    const ephemeralBackup = await localSaveManager.createEphemeralBackup(
      objectId,
      shop,
      null, // downloadOptionTitle
      label
    )

    try {
      // Upload directly to Google Drive
      const googleDriveConfig: GoogleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: this.store.get('config').googleDrive.credentialsPath,
          googleDriveAccessToken: this.store.get('config').accessToken,
          googleDriveRefreshToken: this.store.get('config').refreshToken
        }
      }

      const fileId = await this.googleDrive.uploadBackup(
        shop,
        objectId,
        ephemeralBackup.backupPath,
        ephemeralBackup.backupId,
        googleDriveConfig,
        customFolderName,
        (current, total) => {
          if (onProgress) {
            onProgress((current / total) * 100)
          }
        }
      )

      console.log(`Ephemeral backup uploaded with file ID: ${fileId}`)
    } finally {
      // Clean up ephemeral backup
      try {
        await fs.promises.rm(path.dirname(ephemeralBackup.backupPath), { recursive: true, force: true })
        console.log('Ephemeral backup cleaned up successfully')
      } catch (error) {
        console.error('Failed to clean up ephemeral backup:', error)
      }
    }
  }

  /**
   * Restore a backup using Hydra's approach
   */
  public async restoreBackup(
    backupId: string,
    shop: GameShop,
    objectId: string,
    onProgress?: (progress: BackupProgress) => void
  ): Promise<void> {
    onProgress?.({
      gameId: '', // We don't have gameId in this context
      status: 'backing-up',
      progress: 0,
      message: 'Preparing restore...'
    })

    // Verificar se é um backup do Google Drive (começa com 'gdrive-')
    const isGoogleDriveBackup = backupId.startsWith('gdrive-');
    let tempBackupPath: string | null = null;
    let googleDriveFileId: string | null = null;
    
    if (isGoogleDriveBackup) {
      // Extrair o ID real do Google Drive
      googleDriveFileId = backupId.replace('gdrive-', '');
      
      // Baixar o backup do Google Drive
      onProgress?.({
        gameId: '',
        status: 'backing-up',
        progress: 20,
        message: 'Downloading backup from Google Drive...'
      })
      
      try {
        const googleDriveConfig: GoogleDriveConfig = {
          userPreferences: {
            googleDriveCredentialsPath: this.store.get('config').googleDrive.credentialsPath,
            googleDriveAccessToken: this.store.get('config').googleDrive.accessToken,
            googleDriveRefreshToken: this.store.get('config').googleDrive.refreshToken
          }
        };
        
        // Criar um diretório temporário para o download
        const tempDownloadPath = path.join(this.store.get('config').backupPath, "temp-restore");
        await fs.promises.mkdir(tempDownloadPath, { recursive: true });
        
        await this.googleDrive.downloadBackup(
          shop,
          objectId,
          googleDriveFileId,
          tempDownloadPath,
          googleDriveConfig
        );
        
        // Definir o caminho temporário do backup
        tempBackupPath = tempDownloadPath;
        console.log('📥 Caminho temporário do backup:', tempBackupPath);
      } catch (error) {
        console.error(`❌ Erro ao baixar backup do Google Drive: ${googleDriveFileId}`, error);
        throw error;
      }
    }

    // Use Hydra's LocalSaveManager to restore backup
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    
    // Create a new instance to ensure config is up to date
    const localSaveManager = new LocalSaveManager(localSaveConfig)

    onProgress?.({
      gameId: '',
      status: 'backing-up',
      progress: 50,
      message: 'Restoring files...'
    })

    // Se for um backup do Google Drive, usar o caminho temporário
    if (isGoogleDriveBackup && tempBackupPath && googleDriveFileId) {
      // Para backups do Google Drive, passamos o caminho temporário como customLocalSavesPath
      // e o googleDriveFileId como backupId
      await localSaveManager.restoreLocalBackup(
        shop,
        objectId,
        googleDriveFileId, // Usar o ID real do Google Drive como backupId
        null, // winePrefix
        tempBackupPath // customLocalSavesPath - o caminho temporário onde o backup foi extraído
      );
    } else {
      await localSaveManager.restoreLocalBackup(
        shop,
        objectId,
        backupId
      );
    }

    // Limpar o diretório temporário se foi criado
    if (isGoogleDriveBackup) {
      try {
        const tempDownloadPath = path.join(this.store.get('config').backupPath, "temp-restore");
        await fs.promises.rm(tempDownloadPath, { recursive: true, force: true });
      } catch (error) {
        console.error('❌ Erro ao limpar diretório temporário:', error);
      }
    }

    onProgress?.({
      gameId: '',
      status: 'complete',
      progress: 100,
      message: 'Restore completed successfully'
    })
  }

  /**
   * Delete a backup
   */
  public async deleteBackup(backupId: string, shop: GameShop, objectId: string): Promise<void> {
    console.log(`🔍 deleteBackup chamado para backupId: ${backupId}, shop: ${shop}, objectId: ${objectId}`);
    
    // Verificar se é um backup do Google Drive (começa com 'gdrive-')
    const isGoogleDriveBackup = backupId.startsWith('gdrive-');
    console.log(`🔍 É backup do Google Drive: ${isGoogleDriveBackup}`);
    
    if (isGoogleDriveBackup) {
      // Extrair o ID real do Google Drive
      const googleDriveFileId = backupId.replace('gdrive-', '');
      console.log(`🔍 ID do Google Drive: ${googleDriveFileId}`);
      
      // Deletar do Google Drive
      try {
        const googleDriveConfig: GoogleDriveConfig = {
          userPreferences: {
            googleDriveCredentialsPath: this.store.get('config').googleDrive.credentialsPath,
            googleDriveAccessToken: this.store.get('config').googleDrive.accessToken,
            googleDriveRefreshToken: this.store.get('config').googleDrive.refreshToken
          }
        };
        
        await this.googleDrive.deleteBackup(shop, objectId, googleDriveFileId, googleDriveConfig);
        console.log(`✅ Backup do Google Drive deletado com sucesso: ${googleDriveFileId}`);
      } catch (error) {
        console.error(`❌ Erro ao deletar backup do Google Drive: ${googleDriveFileId}`, error);
        throw error;
      }
    } else {
      console.log(`🔍 Deletando backup local: ${backupId}`);
      // Delete local backup using Hydra's approach
      const localSaveConfig: LocalSaveManagerConfig = {
        localSavesPath: this.store.get('config').backupPath,
        ludusaviPath: this.store.get('config').ludusaviPath
      }
      
      const localSaveManager = new LocalSaveManager(localSaveConfig)
      await localSaveManager.deleteLocalBackup(shop, objectId, backupId)
    }

    // Also delete from store if it exists there
    const backups = this.store.get('backups') as Backup[]
    this.store.set('backups', backups.filter((b: Backup) => b.id !== backupId))
    
    // Update game backup count
    const games = this.store.get('games') as Game[]
    // Find the game by shop and objectId
    const game = games.find((g: Game) => {
      const gameShop: GameShop = g.platform || 'steam'
      const gameObjectId = g.gameId || g.name
      return gameShop === shop && gameObjectId === objectId
    })
    
    if (game) {
      // Recalculate the actual number of backups for this game
      const actualBackups = await this.getLocalBackups(shop, objectId)
      game.backupCount = actualBackups.length
      game.updatedAt = new Date()
      this.store.set('games', games)
    }
    
    console.log(`✅ deleteBackup concluído para backupId: ${backupId}`);
  }

  /**
   * Mark a backup as cloud-only (not to be listed in local backups)
   */
  public async markBackupAsCloudOnly(backupId: string, shop: GameShop, objectId: string): Promise<void> {
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    
    const localSaveManager = new LocalSaveManager(localSaveConfig)
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = localSaveManager['normalizeGameName'](objectId); // Access private method through bracket notation
    const backupPath = path.join(this.store.get('config').backupPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId)
    
    // Create a marker file to indicate this backup is cloud-only
    const markerPath = path.join(backupPath, ".cloud-only")
    await fs.promises.writeFile(markerPath, "This backup exists only in the cloud")
  }

  /**
   * Get configuration
   */
  public getConfig(): AppConfig {
    return this.store.get('config') as AppConfig
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<AppConfig>): void {
    const currentConfig = this.store.get('config') as AppConfig
    this.store.set('config', { ...currentConfig, ...config })
    this.ensureBackupDirectory()
  }

  /**
   * Set Google Drive default folder
   */
  public setGoogleDriveDefaultFolder(folderId: string, folderName: string): void {
    const config = this.store.get('config') as AppConfig
    config.googleDrive.defaultFolderId = folderId
    config.googleDrive.defaultFolderName = folderName
    this.store.set('config', config)
  }

  /**
   * Get Google Drive default folder
   */
  public getGoogleDriveDefaultFolder(): { id: string; name: string } | null {
    const config = this.store.get('config') as AppConfig
    if (config.googleDrive.defaultFolderId && config.googleDrive.defaultFolderName) {
      return {
        id: config.googleDrive.defaultFolderId,
        name: config.googleDrive.defaultFolderName
      }
    }
    return null
  }

  /**
   * Clear Google Drive default folder
   */
  public clearGoogleDriveDefaultFolder(): void {
    const config = this.store.get('config') as AppConfig
    config.googleDrive.defaultFolderId = undefined
    config.googleDrive.defaultFolderName = undefined
    this.store.set('config', config)
  }

  /**
   * Get Google Drive service
   */
  public getGoogleDriveService(): GoogleDriveService {
    return this.googleDrive
  }

  /**
   * Get local backups for a game using Hydra's approach
   */
  public async getLocalBackups(shop: GameShop, objectId: string): Promise<LocalSaveBackup[]> {
    const localSaveConfig: LocalSaveManagerConfig = {
      localSavesPath: this.store.get('config').backupPath,
      ludusaviPath: this.store.get('config').ludusaviPath
    }
    
    const localSaveManager = new LocalSaveManager(localSaveConfig)
    return await localSaveManager.getLocalBackups(shop, objectId)
  }

  /**
   * Get Google Drive backups for a specific game
   */
  public async getGameGoogleDriveBackups(shop: string, objectId: string): Promise<any[]> {
    try {
      console.log('🔍 getGameGoogleDriveBackups: Iniciando coleta de backups do Google Drive para jogo específico');
      console.log('🔍 getGameGoogleDriveBackups: Parâmetros:', { shop, objectId });
      
      // Verificar se o Google Drive está habilitado
      const config = this.getConfig();
      if (!config.googleDrive.enabled) {
        console.log('🔍 getGameGoogleDriveBackups: Google Drive não habilitado');
        return [];
      }

      // Obter serviço do Google Drive
      const googleDriveService = this.getGoogleDriveService();
      const googleDriveConfig: GoogleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: config.googleDrive.credentialsPath,
          googleDriveAccessToken: config.googleDrive.accessToken,
          googleDriveRefreshToken: config.googleDrive.refreshToken
        }
      };

      // Verificar autenticação
      const isAuthenticated = await googleDriveService.loadSavedTokens(googleDriveConfig);
      console.log('🔍 getGameGoogleDriveBackups: Autenticado no Google Drive:', isAuthenticated);
      
      if (!isAuthenticated) {
        console.log('🔍 getGameGoogleDriveBackups: Não autenticado no Google Drive');
        return [];
      }

      // Usar a pasta padrão se estiver definida, caso contrário procurar em qualquer lugar
      const selectedFolderId = config.googleDrive.defaultFolderId || undefined;
      
      // Listar backups do Google Drive para este jogo
      const backups = await googleDriveService.listBackups(
        shop, 
        objectId, 
        googleDriveConfig,
        selectedFolderId
      );
      
      console.log('🔍 getGameGoogleDriveBackups: Backups encontrados:', backups.length);
      console.log('🔍 getGameGoogleDriveBackups: Backups detalhados:', backups);
      
      // Converter backups do Google Drive para o formato esperado
      const convertedBackups = backups.map((backup: any) => ({
        id: `gdrive-${backup.id}`,
        label: this.formatBackupLabel(backup.name, backup.createdTime || backup.modifiedTime),
        createdAt: new Date(backup.createdTime || backup.modifiedTime || new Date()),
        sizeBytes: 0, // Tamanho não disponível diretamente
        cloudFileId: backup.id,
        isCloudBackup: true
      }));
      
      console.log('🔍 getGameGoogleDriveBackups: Backups convertidos:', convertedBackups);
      return convertedBackups;
    } catch (error) {
      console.error('Failed to get Google Drive backups for game:', error);
      return [];
    }
  }

  /**
   * Format backup label to be more user-friendly
   */
  private formatBackupLabel(backupId: string, backupDate: string): string {
    // Se o backupId for um UUID, criar uma label mais amigável
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(backupId)) {
      // Usar a data do backup para criar uma label
      const date = new Date(backupDate);
      return `Backup de ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // Caso contrário, usar o nome original
    return backupId;
  }

  /**
   * Get backups from Google Drive default folder
   */
  public async getGoogleDriveBackups(): Promise<Array<{game: Game, backups: any[]}>> {
    try {
      console.log('🔍 getGoogleDriveBackups: Iniciando coleta de backups do Google Drive');
      
      // Verificar se o Google Drive está habilitado e tem pasta padrão
      const config = this.getConfig();
      console.log('🔍 getGoogleDriveBackups: Configuração do Google Drive:', config.googleDrive);
      
      if (!config.googleDrive.enabled || !config.googleDrive.defaultFolderId) {
        console.log('🔍 getGoogleDriveBackups: Google Drive não habilitado ou sem pasta padrão');
        return [];
      }

      const games = this.getGames();
      console.log('🔍 getGoogleDriveBackups: Total de jogos encontrados:', games.length);
      const allBackups: Array<{game: Game, backups: any[]}> = [];
      
      // Obter serviço do Google Drive
      const googleDriveService = this.getGoogleDriveService();
      const googleDriveConfig: GoogleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: config.googleDrive.credentialsPath,
          googleDriveAccessToken: config.googleDrive.accessToken,
          googleDriveRefreshToken: config.googleDrive.refreshToken
        }
      };

      // Verificar autenticação
      const isAuthenticated = await googleDriveService.loadSavedTokens(googleDriveConfig);
      console.log('🔍 getGoogleDriveBackups: Autenticado no Google Drive:', isAuthenticated);
      
      if (!isAuthenticated) {
        console.log('🔍 getGoogleDriveBackups: Não autenticado no Google Drive');
        return [];
      }

      for (const game of games) {
        try {
          console.log('🔍 getGoogleDriveBackups: Processando jogo:', game.name);
          const shop: GameShop = game.platform || 'steam';
          const objectId = game.gameId || game.name;
          
          // Listar backups do Google Drive para este jogo
          const backups = await googleDriveService.listBackups(
            shop, 
            objectId, 
            googleDriveConfig,
            config.googleDrive.defaultFolderId
          );
          
          console.log('🔍 getGoogleDriveBackups: Backups encontrados para', game.name, ':', backups.length);
          console.log('🔍 getGoogleDriveBackups: Backups detalhados:', backups);
          
          // Converter backups do Google Drive para o formato esperado
          const convertedBackups = backups.map((backup: any) => ({
            id: `gdrive-${backup.id}`,
            label: this.formatBackupLabel(backup.name, backup.createdTime || backup.modifiedTime),
            createdAt: new Date(backup.createdTime || backup.modifiedTime || new Date()),
            sizeBytes: 0, // Tamanho não disponível diretamente
            cloudFileId: backup.id,
            isCloudBackup: true
          }));
          
          // Only include games that have backups
          if (convertedBackups.length > 0) {
            console.log('🔍 getGoogleDriveBackups: Adicionando', convertedBackups.length, 'backups para', game.name);
            allBackups.push({
              game,
              backups: convertedBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            });
          } else {
            console.log('🔍 getGoogleDriveBackups: Nenhum backup encontrado para', game.name);
          }
        } catch (error) {
          console.error(`Failed to load Google Drive backups for game ${game.name}:`, error);
          // Continue with other games even if one fails
        }
      }
      
      console.log('🔍 getGoogleDriveBackups: Total de jogos com backups:', allBackups.length);
      console.log('🔍 getGoogleDriveBackups: Dados completos:', JSON.stringify(allBackups, null, 2));
      return allBackups;
    } catch (error) {
      console.error('Failed to get Google Drive backups:', error);
      return [];
    }
  }

  /**
   * Get all local backups from all games
   */
  public async getAllLocalBackups(): Promise<Array<{game: Game, backups: LocalSaveBackup[]}>> {
    console.log('🔍 getAllLocalBackups: Iniciando coleta de todos os backups');
    const games = this.getGames();
    console.log('🔍 getAllLocalBackups: Total de jogos encontrados:', games.length);
    const allBackups: Array<{game: Game, backups: LocalSaveBackup[]}> = [];
    
    for (const game of games) {
      try {
        console.log('🔍 getAllLocalBackups: Processando jogo:', game.name);
        const shop: GameShop = game.platform || 'steam';
        const objectId = game.gameId || game.name;
        console.log('🔍 getAllLocalBackups: Parâmetros para getLocalBackups:', { shop, objectId });
        const backups = await this.getLocalBackups(shop, objectId);
        console.log('🔍 getAllLocalBackups: Backups encontrados para', game.name, ':', backups.length);
        
        // Only include games that have backups
        if (backups.length > 0) {
          console.log('🔍 getAllLocalBackups: Adicionando', backups.length, 'backups para', game.name);
          allBackups.push({
            game,
            backups: backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          });
        } else {
          console.log('🔍 getAllLocalBackups: Nenhum backup encontrado para', game.name);
        }
      } catch (error) {
        console.error(`Failed to load backups for game ${game.name}:`, error);
        // Continue with other games even if one fails
      }
    }
    
    console.log('🔍 getAllLocalBackups: Total de jogos com backups:', allBackups.length);
    console.log('🔍 getAllLocalBackups: Dados completos:', JSON.stringify(allBackups, null, 2));
    return allBackups;
  }

  /**
   * Get all backups (local and Google Drive)
   */
  public async getAllBackups(): Promise<Array<{game: Game, backups: any[]}>> {
    console.log('🔍 getAllBackups: Iniciando coleta de todos os backups');
    
    // Obter backups locais
    const localBackups = await this.getAllLocalBackups();
    console.log('🔍 getAllBackups: Backups locais encontrados:', localBackups.length);
    
    // Obter backups do Google Drive
    const googleDriveBackups = await this.getGoogleDriveBackups();
    console.log('🔍 getAllBackups: Backups do Google Drive encontrados:', googleDriveBackups.length);
    
    // Combinar backups
    const allBackupsMap = new Map<string, {game: Game, backups: any[]}>();
    
    // Adicionar backups locais
    for (const {game, backups} of localBackups) {
      const key = game.id;
      if (!allBackupsMap.has(key)) {
        allBackupsMap.set(key, {game, backups: []});
      }
      const existing = allBackupsMap.get(key)!;
      existing.backups.push(...backups.map((b: any) => ({...b, isLocalBackup: true})));
    }
    
    // Adicionar backups do Google Drive
    for (const {game, backups} of googleDriveBackups) {
      const key = game.id;
      if (!allBackupsMap.has(key)) {
        allBackupsMap.set(key, {game, backups: []});
      }
      const existing = allBackupsMap.get(key)!;
      existing.backups.push(...backups);
    }
    
    // Converter mapa para array e ordenar backups por data
    const result = Array.from(allBackupsMap.values()).map(({game, backups}) => ({
      game,
      backups: backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }));
    
    console.log('🔍 getAllBackups: Total de jogos com backups:', result.length);
    return result;
  }

  /**
   * Synchronize backup counts for all games
   */
  public async syncBackupCounts(): Promise<void> {
    console.log('🔍 syncBackupCounts: Iniciando sincronização de contagem de backups');
    const games = this.store.get('games') as Game[];
    let updated = false;
    
    for (const game of games) {
      try {
        const shop: GameShop = game.platform || 'steam';
        const objectId = game.gameId || game.name;
        console.log('🔍 syncBackupCounts: Verificando jogo:', game.name);
        
        // Obter backups locais
        const localBackups = await this.getLocalBackups(shop, objectId);
        console.log('🔍 syncBackupCounts: Backups locais encontrados para', game.name, ':', localBackups.length);
        
        // Obter backups do Google Drive
        let googleDriveBackupsCount = 0;
        try {
          const googleDriveBackups = await this.getGameGoogleDriveBackups(shop, objectId);
          googleDriveBackupsCount = googleDriveBackups.length;
          console.log('🔍 syncBackupCounts: Backups do Google Drive encontrados para', game.name, ':', googleDriveBackupsCount);
        } catch (error) {
          console.error('🔍 syncBackupCounts: Erro ao obter backups do Google Drive para', game.name, ':', error);
        }
        
        // Contagem total de backups (locais + Google Drive)
        const totalBackupsCount = localBackups.length + googleDriveBackupsCount;
        console.log('🔍 syncBackupCounts: Total de backups para', game.name, ':', totalBackupsCount);
        
        // Update backup count if it doesn't match
        if (game.backupCount !== totalBackupsCount) {
          console.log('🔍 syncBackupCounts: Atualizando backupCount de', game.backupCount, 'para', totalBackupsCount, 'para', game.name);
          game.backupCount = totalBackupsCount;
          game.updatedAt = new Date();
          updated = true;
        }
      } catch (error) {
        console.error(`Failed to sync backup count for game ${game.name}:`, error);
      }
    }
    
    // Save updated games if any changes were made
    if (updated) {
      console.log('🔍 syncBackupCounts: Salvando jogos atualizados');
      this.store.set('games', games);
    }
    
    console.log('🔍 syncBackupCounts: Sincronização concluída');
  }

  /**
   * Create local backups for all games
   */
  public async createAllGamesLocalBackup(
    onProgress?: (progress: BackupProgress) => void
  ): Promise<void> {
    const games = this.getGames();
    const totalGames = games.length;
    
    console.log(`🔍 Iniciando backup de todos os jogos. Total: ${totalGames}`);
    
    for (let i = 0; i < totalGames; i++) {
      const game = games[i];
      const progressPercent = Math.round((i / totalGames) * 100);
      
      try {
        console.log(`🔍 Processando jogo ${i + 1}/${totalGames}: ${game.name}`);
        
        onProgress?.({
          gameId: game.id,
          status: 'detecting',
          progress: progressPercent,
          message: `Processando ${i + 1}/${totalGames}: ${game.name}`
        });
        
        // Create backup for this game
        await this.createLocalBackup(
          game.id,
          `Backup de ${new Date().toLocaleDateString('pt-BR')} - ${game.name}`,
          onProgress
        );
        
        console.log(`✅ Backup concluído para: ${game.name}`);
      } catch (error) {
        console.error(`❌ Erro ao fazer backup do jogo ${game.name}:`, error);
        // Continue with other games even if one fails
      }
    }
    
    onProgress?.({
      gameId: '',
      status: 'complete',
      progress: 100,
      message: 'Backup de todos os jogos concluído!'
    });
    
    console.log('✅ Backup de todos os jogos concluído');
  }

  /**
   * Create ephemeral backups for all games and upload directly to Google Drive
   */
  public async createAllGamesEphemeralBackupAndUploadToGoogleDrive(
    onProgress?: (gameIndex: number, gameName: string, percent: number) => void,
    customFolderName?: string
  ): Promise<void> {
    const games = this.getGames();
    const totalGames = games.length;
    
    console.log(`🔍 Iniciando backup de todos os jogos para Google Drive. Total: ${totalGames}`);
    
    for (let i = 0; i < totalGames; i++) {
      const game = games[i];
      const progressPercent = Math.round((i / totalGames) * 100);
      
      try {
        console.log(`🔍 Processando jogo ${i + 1}/${totalGames}: ${game.name}`);
        
        if (onProgress) {
          onProgress(i, game.name, progressPercent);
        }
        
        // Create ephemeral backup and upload directly to Google Drive
        await this.createEphemeralBackupAndUploadToGoogleDrive(
          game.id,
          `Backup de ${new Date().toLocaleDateString('pt-BR')} - ${game.name}`,
          (percent) => {
            // Progress callback for individual game upload
            if (onProgress) {
              onProgress(i, game.name, Math.round((i / totalGames) * 100 + (percent / totalGames)));
            }
          },
          customFolderName
        );
        
        console.log(`✅ Backup concluído para: ${game.name}`);
      } catch (error) {
        console.error(`❌ Erro ao fazer backup do jogo ${game.name}:`, error);
        // Continue with other games even if one fails
      }
    }
    
    console.log('✅ Backup de todos os jogos para Google Drive concluído');
  }
}
