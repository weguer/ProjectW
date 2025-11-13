/**
 * Main Process Entry Point
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { exec } from 'child_process';
import * as http from 'http';
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Ludusavi } from './services/ludusavi'
import { BackupManager } from './services/backup-manager'
import { GameScanner } from './services/game-scanner'
import * as fs from 'fs'
import * as dotenv from 'dotenv'
import * as path from 'path'
import type { GameShop, GoogleDriveConfig } from '@types'
import { APP_ICON_URL } from '@shared/icons'
import axios from 'axios'
import * as tar from 'tar'

// Carregar .env do diretório correto dependendo do ambiente
if (app.isPackaged) {
  // Em produção, carregar .env do diretório de recursos
  const envPath = path.join(process.resourcesPath, '.env');
  console.log('🔍 Tentando carregar .env em produção:', envPath);
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('❌ Erro ao carregar .env em produção:', result.error);
  } else {
    console.log('✅ .env carregado com sucesso em produção');
  }
} else {
  // Em desenvolvimento, carregar .env do diretório atual
  console.log('🔍 Tentando carregar .env em desenvolvimento');
  const result = dotenv.config();
  if (result.error) {
    console.error('❌ Erro ao carregar .env em desenvolvimento:', result.error);
  } else {
    console.log('✅ .env carregado com sucesso em desenvolvimento');
  }
}

// Definir variáveis de ambiente padrão se não estiverem presentes
if (!process.env.GOOGLE_DRIVE_REDIRECT_URIS) {
  console.log('⚠️ GOOGLE_DRIVE_REDIRECT_URIS não encontrada, definindo valor padrão');
  process.env.GOOGLE_DRIVE_REDIRECT_URIS = 'http://localhost:3000/oauth2callback,http://localhost:3001/oauth2callback,http://localhost:3002/oauth2callback,http://localhost:3003/oauth2callback,http://localhost:3004/oauth2callback';
}

// Log das variáveis de ambiente importantes
console.log('🔍 GOOGLE_DRIVE_REDIRECT_URIS:', process.env.GOOGLE_DRIVE_REDIRECT_URIS);

// Initialize services
const backupManager = new BackupManager()

function createWindow(): void {
  // Determinar o caminho do ícone com base no ambiente
  let iconPath: string;
  if (app.isPackaged) {
    // Em produção, usar o ícone do diretório de recursos
    iconPath = join(process.resourcesPath, 'icon.ico');
  } else {
    // Em desenvolvimento, usar o ícone do diretório public
    iconPath = join(__dirname, '../../public/icon.ico');
  }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false, // Disable default frame for custom title bar
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),  // Mudado para .mjs
      sandbox: false,
      contextIsolation: true,  // Garante que contextBridge funcione
      nodeIntegration: false   // Segurança
    },
    // Disable resize overlays in production
    resizable: app.isPackaged ? true : true,
    maximizable: app.isPackaged ? true : true
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Only open DevTools in development mode
    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Prevent resize overlays in production
  if (app.isPackaged) {
    mainWindow.on('resize', () => {
      // This prevents the resize overlay from showing
      if (mainWindow.isMaximized()) {
        // mainWindow.setSize(mainWindow.getSize()[0], mainWindow.getSize()[1]);
      }
    });
    
    // Handle maximize/unmaximize without showing overlay
    mainWindow.on('maximize', () => {
      // Custom handling if needed
    });
    
    mainWindow.on('unmaximize', () => {
      // Custom handling if needed
    });
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.projectw')

  // Initialize Ludusavi
  await Ludusavi.initialize()
  
  // Check and download latest Ludusavi version if needed
  await checkAndDownloadLudusavi()
  
  // Reset session timestamp for new backup session
  Ludusavi.resetSessionTimestamp()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register IPC handlers
  registerIpcHandlers()

  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URIS?.split(',')[0];
  console.log('🔍 Redirect URI do .env:', redirectUri);
  if (redirectUri) {
    try {
      const port = new URL(redirectUri).port;
      console.log('🔍 Porta do servidor OAuth:', port);
      server.listen(port, () => {
        console.log(`✅ Servidor OAuth callback rodando na porta ${port}`);
      });
    } catch (error) {
      console.error('❌ Could not start OAuth callback server. Invalid redirect URI in .env file.', error);
    }
  } else {
    console.log('⚠️ Nenhuma redirect URI encontrada no .env');
  }

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  server.close();
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function getDirectorySize(dirPath: string): number {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = join(dirPath, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }
  return size;
}

async function getNormalizedLudusaviGameFolderName(gameName: string): Promise<string> {
  // Usar a mesma lógica de normalização que o Ludusavi usa
  return Promise.resolve(
    gameName
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .trim() || 'Unknown_Game' // Ensure we have a valid name
  );
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/oauth2callback')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code');

    if (code) {
      // Send code to renderer process
      BrowserWindow.getAllWindows()[0]?.webContents.send('gdrive-code', code);

      // Respond with success page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <style>
          body { font-family: sans-serif; background-color: #f0f0f0; text-align: center; padding-top: 50px; }
          div { background-color: white; margin: auto; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: inline-block; }
          h1 { color: #4CAF50; }
        </style>
        <div>
          <h1>Autenticação bem-sucedida!</h1>
          <p>Você já pode fechar esta janela.</p>
        </div>
      `);
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Erro: Código de autorização não encontrado.</h1>');
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

/**
 * Register IPC handlers for communication with renderer
 */
function registerIpcHandlers(): void {
  // Games
  ipcMain.handle('get-games', () => backupManager.getGames())
  
  ipcMain.handle('add-game', async (_, name: string, customPath?: string) => {
    return backupManager.addGame(name, customPath)
  })
  
  ipcMain.handle('update-game-cover', async (_, gameId: string, coverUrl: string) => {
    backupManager.updateGameCover(gameId, coverUrl)
    return { success: true }
  })
  
  ipcMain.handle('update-all-icons', async () => {
    try {
      await GameScanner.updateAllGamesWithIcons(backupManager)
      return { success: true }
    } catch (error) {
      console.error('❌ Erro ao atualizar ícones:', error)
      return { success: false, error: (error as Error).message }
    }
  })
  
  // Scan for installed games
  let currentScanProcess: any = null
  
  ipcMain.handle('scan-games', async (event) => {
    return await GameScanner.scanInstalledGames((progress) => {
      // Send progress updates to renderer
      event.sender.send('scan-progress', progress)
    })
  })
  
  ipcMain.handle('cancel-scan', async () => {
    GameScanner.cancelScan()
  })
  
  // Add multiple scanned games
  ipcMain.handle('add-scanned-games', async (_, games: any[]) => {
    const addedGames = []
    for (const game of games) {
      try {
        const added = backupManager.addGame(
          game.gameId,              // name (usa gameId como identificador único)
          undefined,                // customSavePath
          game.coverUrl,           // coverUrl
          game.gameId,             // gameId (Steam ID, GOG ID, etc.)
          game.platform,           // platform
          game.displayName || game.name  // displayName (nome amigável)
        )
        addedGames.push(added)
      } catch (error) {
        // Game already exists, skip
        console.warn(`Jogo já existe: ${game.name}`)
      }
    }
    return addedGames
  })
  
  ipcMain.handle('remove-game', async (_, gameId: string) => {
    backupManager.removeGame(gameId)
  })

  // Backups
  ipcMain.handle('get-backups', (_, gameId: string) => {
    return backupManager.getBackupsForGame(gameId)
  })

  // Novo método para obter backups usando o LocalSaveManager
  ipcMain.handle('get-local-backups', async (_, shop: string, objectId: string) => {
    return await backupManager.getLocalBackups(shop as GameShop, objectId)
  })

  // Novo método para obter todos os backups de todos os jogos
  ipcMain.handle('get-all-local-backups', async () => {
    console.log('🔍 IPC: getAllLocalBackups chamado');
    const result = await backupManager.getAllLocalBackups()
    console.log('🔍 IPC: getAllLocalBackups resultado:', JSON.stringify(result, null, 2));
    return result;
  })

  // Novo método para obter todos os backups (locais e do Google Drive)
  ipcMain.handle('get-all-backups', async () => {
    console.log('🔍 IPC: getAllBackups chamado');
    const result = await backupManager.getAllBackups()
    console.log('🔍 IPC: getAllBackups resultado:', JSON.stringify(result, null, 2));
    return result;
  })

  ipcMain.handle('get-ludusavi-backups', async (_, gameName: string) => {
    const config = await backupManager.getConfig(); // Corrigido para obter a configuração atual
    const backupPath = config.backupPath;
    console.log('Root backup path:', backupPath);

    const ludusaviGameFolderName = await getNormalizedLudusaviGameFolderName(gameName); // Get normalized name
    console.log('Ludusavi normalized game folder name:', ludusaviGameFolderName);

    const gameBackupPath = join(backupPath, ludusaviGameFolderName); // Use the normalized name
    console.log('Game backup path:', gameBackupPath);

    if (!fs.existsSync(gameBackupPath)) {
      console.log('Game backup path does not exist.');
      return [];
    }

    const backupFolders = fs.readdirSync(gameBackupPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    console.log('Found backup folders:', backupFolders);

    const backups = backupFolders.map(folderName => {
      const fullPath = join(gameBackupPath, folderName);
      const stats = fs.statSync(fullPath);
      const createdAt = new Date(folderName);

      return {
        id: folderName,
        label: folderName,
        createdAt: isNaN(createdAt.getTime()) ? stats.mtime : createdAt,
        sizeBytes: getDirectorySize(fullPath),
        localPath: fullPath,
      };
    });

    return backups;
  });

  ipcMain.handle('get-backup-preview', async (_, gameName: string) => {
    return await backupManager.getBackupPreview(gameName)
  })

  // Novo método para criar backup usando o BackupManager
  ipcMain.handle('create-backup', async (_, gameId: string, label?: string) => {
    return new Promise((resolve, reject) => {
      backupManager
        .createLocalBackup(gameId, label, (progress) => {
          // Send progress to renderer
          BrowserWindow.getAllWindows()[0]?.webContents.send('backup-progress', progress)
        })
        .then(resolve)
        .catch(reject)
    })
  })

  // Backup com Ludusavi diretamente
  ipcMain.handle('create-ludusavi-backup', async (event, gameName: string, backupType: 'local' | 'gdrive') => {
    const config = backupManager.getConfig()
    console.log('🔧 Recebido pedido de backup individual:', { gameName, backupType, backupPath: config.backupPath })
    
    // Não precisamos sanitizar o nome do jogo aqui, pois o Ludusavi precisa do nome original
    // const ludusaviGameFolderName = await getNormalizedLudusaviGameFolderName(gameName); // Get normalized name

    return new Promise((resolve, reject) => {
      // Use the new Hydra approach instead
      backupManager.createLocalBackup(gameName, undefined, (progress) => {
        event.sender.send('backup-progress-simple', progress)
      })
        .then(resolve)
        .catch((error: any) => {
          console.error('❌ Erro no backup individual:', error)
          reject(error)
        })
    })
  })

  ipcMain.handle('create-all-games-backup', async (event) => {
    const config = backupManager.getConfig()
    console.log('🔧 Recebido pedido de backup geral:', { backupPath: config.backupPath })
    
    return new Promise((resolve, reject) => {
      // Use the new Hydra approach for all games backup
      backupManager.createAllGamesLocalBackup((progress) => {
        event.sender.send('backup-progress', progress)
      })
        .then(() => {
          resolve({ message: "Backup de todos os jogos concluído com sucesso!" })
        })
        .catch((error: any) => {
          console.error('❌ Erro no backup geral:', error)
          reject(error)
        })
    })
  })

  // Novo método para backup de todos os jogos no Google Drive
  ipcMain.handle('create-all-games-backup-gdrive', async (event, customFolderName?: string) => {
    console.log('🔧 Recebido pedido de backup geral para Google Drive')
    
    return new Promise((resolve, reject) => {
      backupManager.createAllGamesEphemeralBackupAndUploadToGoogleDrive(
        (gameIndex: number, gameName: string, percent: number) => {
          event.sender.send('backup-progress', {
            gameId: '',
            status: 'backing-up',
            progress: percent,
            message: `Processando ${gameIndex + 1}: ${gameName} (${percent}%)`
          })
        },
        customFolderName
      )
        .then(() => {
          resolve({ message: "Backup de todos os jogos para Google Drive concluído com sucesso!" })
        })
        .catch((error: any) => {
          console.error('❌ Erro no backup geral para Google Drive:', error)
          reject(error)
        })
    })
  })

  ipcMain.handle('cancel-backup', async () => {
    // In a future implementation, we could connect this to actually cancel the Ludusavi process
    console.log('Backup cancellation requested')
  })

  // Novo método para restaurar backup usando o BackupManager
  ipcMain.handle('restore-backup', async (_, backupId: string, shop: string, objectId: string) => {
    return new Promise((resolve, reject) => {
      backupManager
        .restoreBackup(backupId, shop as GameShop, objectId, (progress) => {
          BrowserWindow.getAllWindows()[0]?.webContents.send('restore-progress', progress)
        })
        .then(resolve)
        .catch(reject)
    })
  })

  // Novo método para deletar backup usando o BackupManager
  ipcMain.handle('delete-backup', async (_, backupId: string, shop: string, objectId: string) => {
    await backupManager.deleteBackup(backupId, shop as GameShop, objectId)
  })

  // Novo método para marcar backup como cloud-only
  ipcMain.handle('mark-backup-as-cloud-only', async (_, backupId: string, shop: string, objectId: string) => {
    await backupManager.markBackupAsCloudOnly(backupId, shop as GameShop, objectId)
  })

  // Google Drive
  ipcMain.handle('gdrive-init', async (_, clientId: string, clientSecret: string) => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Caminho do arquivo de credenciais do Google Drive não configurado')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    await gdrive.initializeClient(config)
    return gdrive.getAuthUrl(config)
  })

  ipcMain.handle('gdrive-auth', async (_, code: string) => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    await gdrive.setTokensFromCode(code, config)
  })

  ipcMain.handle('gdrive-check-auth', async () => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    return await gdrive.loadSavedTokens(config)
  })

  ipcMain.handle('gdrive-logout', async () => {
    const gdrive = backupManager.getGoogleDriveService();
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    await gdrive.clearAuth(config);
  });

  ipcMain.handle('gdrive-list-folders', async (_, parentId?: string) => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    return await gdrive.listFolders(parentId || 'root', config)
  })

  ipcMain.handle('gdrive-create-folder', async (_, folderName: string, parentId?: string) => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    return await gdrive.createFolder(folderName, parentId || 'root', config)
  })

  // Google Drive Default Folder handlers
  ipcMain.handle('set-google-drive-default-folder', (_, folderId: string, folderName: string) => {
    backupManager.setGoogleDriveDefaultFolder(folderId, folderName)
  })

  ipcMain.handle('clear-google-drive-default-folder', () => {
    backupManager.clearGoogleDriveDefaultFolder()
  })

  ipcMain.handle('get-google-drive-default-folder', () => {
    return backupManager.getGoogleDriveDefaultFolder()
  })

  // Novo método para upload para Google Drive usando o BackupManager
  ipcMain.handle('gdrive-upload', async (_, backupId: string, shop: string, objectId: string, customFolderName?: string) => {
    return new Promise((resolve, reject) => {
      backupManager
        .uploadToGoogleDrive(backupId, shop as GameShop, objectId, (progress) => {
          BrowserWindow.getAllWindows()[0]?.webContents.send('upload-progress', { backupId, progress })
        }, customFolderName)
        .then(resolve)
        .catch(reject)
    })
  })

  // Novo método para criar backup efêmero e fazer upload direto para Google Drive
  ipcMain.handle('gdrive-upload-ephemeral', async (_, gameId: string, label?: string, customFolderName?: string) => {
    return new Promise((resolve, reject) => {
      backupManager
        .createEphemeralBackupAndUploadToGoogleDrive(gameId, label, (progress) => {
          BrowserWindow.getAllWindows()[0]?.webContents.send('upload-progress', { backupId: 'ephemeral', progress })
        }, customFolderName)
        .then(resolve)
        .catch(reject)
    })
  })

  ipcMain.handle('gdrive-list', async () => {
    const gdrive = backupManager.getGoogleDriveService()
    
    // Obter o caminho do arquivo de credenciais do armazenamento
    const appConfig = backupManager.getConfig()
    const credentialsPath = appConfig.googleDrive.credentialsPath
    
    if (!credentialsPath) {
      throw new Error('Google Drive credentials path not configured. Please set the credentials file path in settings.')
    }
    
    const config: GoogleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    }
    return await gdrive.listBackups('steam', 'game-id', config)
  })

  // Novo método para obter backups do Google Drive de um jogo específico
  ipcMain.handle('get-google-drive-backups', async (_, shop: string, objectId: string) => {
    try {
      console.log('🔍 IPC: getGoogleDriveBackups chamado para:', { shop, objectId });
      const backups = await backupManager.getGameGoogleDriveBackups(shop, objectId);
      console.log('🔍 IPC: getGoogleDriveBackups resultado:', backups);
      return backups;
    } catch (error) {
      console.error('Erro ao obter backups do Google Drive:', error);
      return [];
    }
  });

  // Novo método para sincronizar contagens de backup
  ipcMain.handle('sync-backup-counts', async () => {
    try {
      console.log('🔍 IPC: syncBackupCounts chamado');
      await backupManager.syncBackupCounts();
      console.log('🔍 IPC: syncBackupCounts concluído');
    } catch (error) {
      console.error('Erro ao sincronizar contagens de backup:', error);
      throw error;
    }
  });

  // Config
  ipcMain.handle('get-config', () => backupManager.getConfig())
  ipcMain.handle('update-config', (_, config) => {
    backupManager.updateConfig(config)
  })

  // Verificar se está em modo de produção
  ipcMain.handle('is-packaged', () => app.isPackaged)

  // Dialogs
  ipcMain.handle('select-folder', async () => {
    // Permitir seleção de pasta em ambos os modos (desenvolvimento e produção)
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0]
  })

  ipcMain.handle('select-credentials-with-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON', extensions: ['json'] }
      ]
    });

    if (result.canceled) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      credentials: JSON.parse(content),
      path: filePath
    };
  });

  ipcMain.handle('select-credentials-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON', extensions: ['json'] }
      ]
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });

  // Shell
  ipcMain.handle('open-external-url', (_, url: string) => {
    shell.openExternal(url);
  });

  // Ludusavi
  ipcMain.handle('check-ludusavi', () => Ludusavi.isBinaryAvailable())
  
  ipcMain.handle('get-ludusavi-path', () => Ludusavi.getBinaryPath())

  ipcMain.handle('get-ludusavi-game-folder-name', async (_, gameName: string) => {
    return await getNormalizedLudusaviGameFolderName(gameName);
  });

  ipcMain.handle('ludusavi-restore', async (_, gameName: string, backupPath: string) => {
    const ludusaviPath = Ludusavi.getBinaryPath();
    
    // Try with config first
    const configPath = Ludusavi.getBinaryPath().replace(/ludusavi(\.exe)?$/, '');
    let command = `\"${ludusaviPath}\" --config \"${configPath}\" restore \"${gameName}\" --path \"${backupPath}\" --force`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error with config: ${error}`);
          // Fallback to command without config
          console.warn('Ludusavi restore with config failed, trying without config');
          const fallbackCommand = `\"${ludusaviPath}\" restore \"${gameName}\" --path \"${backupPath}\" --force`;
          exec(fallbackCommand, (error2, stdout2, stderr2) => {
            if (error2) {
              console.error(`exec error without config: ${error2}`);
              return reject(error2);
            }
            console.log(`stdout without config: ${stdout2}`);
            console.error(`stderr without config: ${stderr2}`);
            resolve(stdout2);
          });
        } else {
          console.log(`stdout with config: ${stdout}`);
          console.error(`stderr with config: ${stderr}`);
          resolve(stdout);
        }
      });
    });
  });

  // Window control handlers
  ipcMain.handle('minimize-window', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.minimize();
    }
  });

  ipcMain.handle('maximize-window', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      if (focusedWindow.isMaximized()) {
        focusedWindow.unmaximize();
      } else {
        focusedWindow.maximize();
      }
    }
  });

  ipcMain.handle('close-window', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.close();
    }
  });

}

/**
 * Check if Ludusavi exists and download the latest version if not
 */
async function checkAndDownloadLudusavi(): Promise<void> {
  try {
    // First check if Ludusavi binary already exists
    if (Ludusavi.isBinaryAvailable()) {
      console.log('✅ Ludusavi já está instalado')
      return
    }

    console.log('📥 Baixando a versão mais recente do Ludusavi...')
    
    // Determine platform
    const isWindows = process.platform === 'win32'
    const isLinux = process.platform === 'linux'
    
    if (!isWindows && !isLinux) {
      console.warn('⚠️ Plataforma não suportada para download automático do Ludusavi')
      return
    }
    
    // Get the latest release info from GitHub
    const releaseResponse = await axios.get('https://api.github.com/repos/mtkennerly/ludusavi/releases/latest')
    const latestRelease = releaseResponse.data
    const tagName = latestRelease.tag_name
    
    console.log(`🔍 Última versão do Ludusavi: ${tagName}`)
    
    let downloadUrl: string | null = null
    let assetName: string | null = null
    
    // Find the appropriate asset for the platform
    for (const asset of latestRelease.assets) {
      if (isWindows && asset.name.includes('win64')) {
        downloadUrl = asset.browser_download_url
        assetName = asset.name
        break
      } else if (isLinux && asset.name.includes('linux')) {
        downloadUrl = asset.browser_download_url
        assetName = asset.name
        break
      }
    }
    
    if (!downloadUrl || !assetName) {
      console.error('❌ Não foi possível encontrar o binário do Ludusavi para esta plataforma')
      return
    }
    
    console.log(`🔗 Baixando Ludusavi de: ${downloadUrl}`)
    
    // Create ludusavi directory if it doesn't exist
    const ludusaviDir = Ludusavi.getBinaryPath().replace(/(ludusavi\.exe|ludusavi)$/, '')
    if (!fs.existsSync(ludusaviDir)) {
      fs.mkdirSync(ludusaviDir, { recursive: true })
    }
    
    // Download the file
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    })
    
    const tempPath = path.join(ludusaviDir, assetName)
    
    // Save the downloaded file
    const writer = fs.createWriteStream(tempPath)
    response.data.pipe(writer)
    
    // Wait for download to complete
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })
    
    console.log('🔧 Extraindo Ludusavi...')
    
    // Extract based on file type
    if (assetName.endsWith('.zip')) {
      // For Windows ZIP files
      const { execSync } = require('child_process')
      execSync(`powershell -Command "Expand-Archive -Path '${tempPath}' -DestinationPath '${ludusaviDir}' -Force"`)
      
      // Move the binary to the correct location
      const extractedBinary = path.join(ludusaviDir, 'ludusavi.exe')
      if (fs.existsSync(extractedBinary)) {
        fs.renameSync(extractedBinary, Ludusavi.getBinaryPath())
      }
    } else if (assetName.endsWith('.tar.gz')) {
      // For Linux tar.gz files
      await tar.extract({
        gzip: true,
        file: tempPath,
        cwd: ludusaviDir
      })
      
      // Make the binary executable
      if (fs.existsSync(Ludusavi.getBinaryPath())) {
        fs.chmodSync(Ludusavi.getBinaryPath(), 0o755)
      }
    }
    
    // Clean up temporary file
    fs.unlinkSync(tempPath)
    
    console.log('🎉 Ludusavi instalado com sucesso!')
  } catch (error) {
    console.error('❌ Erro ao baixar Ludusavi:', error)
    
    // Show notification to user
    BrowserWindow.getAllWindows()[0]?.webContents.send('notification', {
      id: 'ludusavi-download-error',
      message: 'Falha ao baixar Ludusavi. Por favor, tente novamente mais tarde.',
      type: 'error'
    })
  }
}
