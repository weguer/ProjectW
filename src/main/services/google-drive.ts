/**
 * Google Drive Service
 * Handles OAuth authentication and file upload/download to Google Drive
 * Adapted to follow Hydra's structure and approach
 */

import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { GoogleDriveConfig, LocalSaveBackup } from '@types'

// Load environment variables
import * as dotenv from 'dotenv'

// Carregar .env do diretório correto dependendo do ambiente
if (app.isPackaged) {
  // Em produção, carregar .env do diretório de recursos
  const envPath = path.join(process.resourcesPath, '.env');
  console.log('🔍 [GoogleDriveService] Tentando carregar .env em produção:', envPath);
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('❌ [GoogleDriveService] Erro ao carregar .env em produção:', result.error);
  } else {
    console.log('✅ [GoogleDriveService] .env carregado com sucesso em produção');
  }
} else {
  // Em desenvolvimento, carregar .env do diretório atual
  console.log('🔍 [GoogleDriveService] Tentando carregar .env em desenvolvimento');
  const result = dotenv.config();
  if (result.error) {
    console.error('❌ [GoogleDriveService] Erro ao carregar .env em desenvolvimento:', result.error);
  } else {
    console.log('✅ [GoogleDriveService] .env carregado com sucesso em desenvolvimento');
  }
}

// Definir variáveis de ambiente padrão se não estiverem presentes
if (!process.env.GOOGLE_DRIVE_REDIRECT_URIS) {
  console.log('⚠️ [GoogleDriveService] GOOGLE_DRIVE_REDIRECT_URIS não encontrada, definindo valor padrão');
  process.env.GOOGLE_DRIVE_REDIRECT_URIS = 'http://localhost:3000/oauth2callback,http://localhost:3001/oauth2callback,http://localhost:3002/oauth2callback,http://localhost:3003/oauth2callback,http://localhost:3004/oauth2callback';
}

// Log das variáveis de ambiente importantes
console.log('🔍 [GoogleDriveService] GOOGLE_DRIVE_REDIRECT_URIS:', process.env.GOOGLE_DRIVE_REDIRECT_URIS);

// Simple logger implementation
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args)
};

export class GoogleDriveService {
  private oauth2Client: OAuth2Client | null = null
  private drive: any = null
  private tokenPath: string

  constructor() {
    this.tokenPath = path.join(app.getPath('userData'), 'google-token.json')
  }

  /**
   * Initialize OAuth2 client with credentials
   */
  public async initializeClient(config: GoogleDriveConfig): Promise<void> {
    try {
      // Always use the configured path from user preferences
      const customPath = config.userPreferences?.googleDriveCredentialsPath;
      
      if (!customPath) {
        throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
      }
      
      const credentialsPath = path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
      
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(`Google Drive credentials file not found at: ${credentialsPath}. Please check the file path in settings.`);
      }

      const credentialsData = fs.readFileSync(credentialsPath, "utf8");
      const credentials = JSON.parse(credentialsData);

      // Handle both 'installed' and 'web' application types
      const clientConfig = credentials.installed || credentials.web;
      
      if (!clientConfig || !clientConfig.client_id || !clientConfig.client_secret) {
        throw new Error("Invalid Google Drive credentials file. Missing client_id or client_secret in the JSON structure.");
      }

      // Use redirect URI from credentials or default
      const redirectUri = clientConfig.redirect_uris?.[0] || "urn:ietf:wg:oauth:2.0:oob";

      this.oauth2Client = new google.auth.OAuth2(
        clientConfig.client_id,
        clientConfig.client_secret,
        redirectUri
      );

      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      // Get tokens from user preferences or fallback to token file
      if (config.userPreferences?.googleDriveAccessToken && config.userPreferences?.googleDriveRefreshToken) {
        this.oauth2Client.setCredentials({
          access_token: config.userPreferences.googleDriveAccessToken,
          refresh_token: config.userPreferences.googleDriveRefreshToken,
        });
      } else {
        const tokenPath = config.tokenPath || path.join(process.cwd(), "Credentials", "token.json");
        if (fs.existsSync(tokenPath)) {
          const tokenRaw = fs.readFileSync(tokenPath, "utf8");
          const tokens = JSON.parse(tokenRaw);
          this.oauth2Client.setCredentials(tokens);
        }
      }
    } catch (error) {
      console.error("Failed to initialize Google Drive auth", error);
      throw error;
    }
  }

  /**
   * Get authentication URL for user to authorize
   */
  public async getAuthUrl(config: GoogleDriveConfig): Promise<string> {
    await this.initializeClient(config);

    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ];

    // Generate auth URL for desktop app
    const authUrl = this.oauth2Client!.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    return authUrl;
  }

  /**
   * Set tokens from authorization code
   */
  public async setTokensFromCode(code: string, config: GoogleDriveConfig): Promise<{ access_token: string; refresh_token: string }> {
    await this.initializeClient(config);
    
    const { tokens } = await this.oauth2Client!.getToken(code);
    this.oauth2Client!.setCredentials(tokens);

    // Save tokens to file for persistence
    const tokenPath = config.tokenPath || path.join(process.cwd(), "Credentials", "token.json");
    const tokenDir = path.dirname(tokenPath);
    
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }
    
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

    console.log("Google Drive authentication successful");
    return {
      access_token: tokens.access_token || '',
      refresh_token: tokens.refresh_token || ''
    };
  }

  /**
   * Load saved tokens from file
   */
  public async loadSavedTokens(config: GoogleDriveConfig): Promise<boolean> {
    try {
      console.log("🔐 Checking Google Drive authentication...");
      await this.initializeClient(config);
      
      // Check if we have tokens in user preferences
      if (config.userPreferences?.googleDriveAccessToken && config.userPreferences?.googleDriveRefreshToken) {
        console.log("🔐 Found tokens in user preferences");
        // Test the connection by making a simple API call
        try {
          const response = await this.drive.about.get({
            fields: 'user'
          });
          console.log("🔐 API call successful, status:", response.status);
          return response.status === 200;
        } catch (error) {
          console.error("❌ Token in preferences is invalid:", error);
          // Try to refresh the token
          try {
            console.log("🔄 Attempting to refresh token...");
            const { credentials } = await this.oauth2Client!.refreshAccessToken();
            console.log("✅ Token refreshed successfully");
            return true;
          } catch (refreshError) {
            console.error("❌ Token refresh failed:", refreshError);
            return false;
          }
        }
      }

      // Check if token file exists
      const tokenPath = config.tokenPath || path.join(process.cwd(), "Credentials", "token.json");
      console.log("🔐 Checking token file at:", tokenPath);
      
      if (fs.existsSync(tokenPath)) {
        console.log("🔐 Token file exists");
        try {
          const tokenRaw = fs.readFileSync(tokenPath, "utf8");
          const tokens = JSON.parse(tokenRaw);
          
          if (tokens.access_token) {
            console.log("🔐 Found access token in file");
            this.oauth2Client!.setCredentials(tokens);
            
            // Test the connection
            try {
              const response = await this.drive.about.get({
                fields: 'user'
              });
              console.log("🔐 API call successful, status:", response.status);
              return response.status === 200;
            } catch (error) {
              console.error("❌ API call failed:", error);
              // Try to refresh the token
              try {
                console.log("🔄 Attempting to refresh token...");
                const { credentials } = await this.oauth2Client!.refreshAccessToken();
                console.log("✅ Token refreshed successfully");
                return true;
              } catch (refreshError) {
                console.error("❌ Token refresh failed:", refreshError);
                return false;
              }
            }
          } else {
            console.log("🔐 No access token in file");
          }
        } catch (error) {
          console.error("❌ Token file is invalid:", error);
          return false;
        }
      } else {
        console.log("🔐 Token file does not exist");
      }

      console.log("🔐 No valid authentication found");
      return false;
    } catch (error) {
      console.error("❌ Failed to check Google Drive authentication", error);
      return false;
    }
  }

  /**
   * Clear authentication
   */
  public async clearAuth(config: GoogleDriveConfig): Promise<void> {
    try {
      // Clear token file if it exists
      const tokenPath = config.tokenPath || path.join(process.cwd(), "Credentials", "token.json");
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
      }
      
      // Clear OAuth2 client credentials
      if (this.oauth2Client) {
        this.oauth2Client.setCredentials({});
      }
      
      console.log("Google Drive disconnected successfully");
    } catch (error) {
      console.error("Failed to disconnect from Google Drive", error);
      throw error;
    }
  }

  /**
   * Ensure a folder exists in Google Drive
   */
  private async ensureFolderExists(parentId: string, folderName: string): Promise<string> {
    // Check if folder already exists
    const list = await this.drive.files.list({
      q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    
    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id;
    }
    
    // Create folder if it doesn't exist
    const created = await this.drive.files.create({
      requestBody: { 
        name: folderName, 
        mimeType: "application/vnd.google-apps.folder", 
        parents: [parentId] 
      },
      fields: "id",
    });
    
    return created.data.id;
  }

  /**
   * Create a new folder in Google Drive
   */
  public async createFolder(folderName: string, parentId: string = 'root', config: GoogleDriveConfig): Promise<string> {
    try {
      await this.initializeClient(config);
      
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      };
      
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id'
      });
      
      return response.data.id;
    } catch (error) {
      console.error("Failed to create Google Drive folder", error);
      throw error;
    }
  }

  /**
   * Upload a backup to Google Drive following Hydra's structure
   */
  public async uploadBackup(
    shop: string,
    objectId: string,
    backupPath: string,
    backupId: string,
    config: GoogleDriveConfig,
    customFolderName?: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<string> {
    try {
      logger.info("🚀 UPLOAD BACKUP STARTED - Simplified version");
      await this.initializeClient(config);

      // Normalize the objectId to avoid invalid characters in folder names
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim() || 'Unknown_Game';

      // Simplified folder structure: CloudSaves/gameId/backupId/
      const mainFolderName = customFolderName || "CloudSaves";
      const gameFolderName = `${shop}-${normalizedObjectId}`;
      
      // Create main folder
      const mainFolderId = await this.ensureFolderExists("root", mainFolderName);
      logger.info("📁 Main folder created/found:", mainFolderName, "ID:", mainFolderId);
      
      // Create game folder
      const gameFolderId = await this.ensureFolderExists(mainFolderId, gameFolderName);
      logger.info("📁 Game folder created/found:", gameFolderName, "ID:", gameFolderId);
      
      // Create backup folder
      const backupFolderId = await this.ensureFolderExists(gameFolderId, backupId);
      logger.info("📁 Backup folder created/found:", backupId, "ID:", backupFolderId);

      // Upload the backup contents - EXACTLY like local backup
      logger.info("📤 Starting upload from:", backupPath);
      logger.info("📤 Backup path exists:", fs.existsSync(backupPath));
      
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup path not found: ${backupPath}`);
      }

      // The backupPath IS the game folder (shop-objectId)
      // Just like local backup: backupPath already contains steam-543870/
      const gameBackupPath = backupPath;
      logger.info("📤 Game backup path:", gameBackupPath);
      logger.info("📤 Game backup path exists:", fs.existsSync(gameBackupPath));

      // Debug: List contents of the backup path
      try {
        const contents = await fs.promises.readdir(gameBackupPath, { withFileTypes: true });
        logger.info("📤 Backup path contents:", contents.map(c => ({ name: c.name, isDirectory: c.isDirectory() })));
      } catch (error) {
        logger.error("📤 Error reading backup path contents:", error);
      }

      if (!fs.existsSync(gameBackupPath)) {
        throw new Error(`Game backup path not found: ${gameBackupPath}`);
      }

      const backupContents = await fs.promises.readdir(gameBackupPath, { withFileTypes: true });
      logger.info("📤 Backup contents:", backupContents.length, "items");
      
      // Count total files for progress
      const countFiles = async (dir: string): Promise<number> => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        let total = 0;
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) total += await countFiles(p);
          else total += 1;
        }
        return total;
      };

      const totalFiles = await countFiles(gameBackupPath);
      logger.info("📤 Total files to upload:", totalFiles);
      
      let processed = 0;
      const notify = () => {
        processed += 1;
        if (onProgress) {
          onProgress(processed, totalFiles);
        }
      };

      // Upload the game backup directory contents
      await this.uploadDirectory(gameBackupPath, backupFolderId, notify);
      
      logger.info("✅ Upload completed successfully");
      return backupFolderId;
    } catch (error) {
      console.error("Failed to upload backup to Google Drive", error);
      throw error;
    }
  }

  /**
   * Helper function to upload a directory recursively
   */
  private async uploadDirectory(localDir: string, parentId: string, notify: () => void): Promise<void> {
    const entries = await fs.promises.readdir(localDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const localPath = path.join(localDir, entry.name);
      
      if (entry.isDirectory()) {
        logger.info("📁 Creating folder:", entry.name);
        const folderId = await this.ensureFolderExists(parentId, entry.name);
        await this.uploadDirectory(localPath, folderId, notify);
      } else if (entry.isFile()) {
        logger.info("📄 Uploading file:", entry.name);
        try {
          await this.drive.files.create({
            requestBody: { name: entry.name, parents: [parentId] },
            media: { body: fs.createReadStream(localPath) },
            fields: "id",
          });
          logger.info("✅ File uploaded:", entry.name);
        } catch (error) {
          logger.error("❌ Error uploading file:", entry.name, error);
          throw error;
        }
        notify();
      }
    }
  }

  /**
   * Download a backup from Google Drive
   */
  public async downloadBackup(
    shop: string,
    objectId: string,
    backupIdOrDriveId: string,
    downloadPath: string,
    config: GoogleDriveConfig
  ): Promise<void> {
    try {
      logger.info("📥 GOOGLE DRIVE DOWNLOAD - Using local restore logic");
      await this.initializeClient(config);

      // Normalize the objectId to avoid invalid characters in folder names
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim() || 'Unknown_Game';

      // Create the EXACT structure that local restore expects:
      // downloadPath/CloudSaves/steam-543870/backupId/steam-543870/
      const cloudSavesPath = path.join(downloadPath, "CloudSaves");
      const gameFolderPath = path.join(cloudSavesPath, `${shop}-${normalizedObjectId}`);
      const backupFolderPath = path.join(gameFolderPath, backupIdOrDriveId);
      const targetLeafPath = path.join(backupFolderPath, `${shop}-${normalizedObjectId}`);

      logger.info("📥 Creating local structure:");
      logger.info("📥 CloudSaves path:", cloudSavesPath);
      logger.info("📥 Game folder path:", gameFolderPath);
      logger.info("📥 Backup folder path:", backupFolderPath);
      logger.info("📥 Target leaf path:", targetLeafPath);

      // Create the directory structure
      await fs.promises.mkdir(targetLeafPath, { recursive: true });

      // Find the backup folder in Google Drive
      let sourceFolderId: string | null = null;
      
      logger.info("📥 Searching for backup folder with ID:", backupIdOrDriveId);
      
      // Try to find the backup folder by ID directly
      try {
        const backupFolder = await this.drive.files.get({ 
          fileId: backupIdOrDriveId, 
          fields: "id, name, mimeType, parents" 
        });
        logger.info("📥 Backup folder info:", backupFolder.data);
        
        if (backupFolder.data.mimeType === "application/vnd.google-apps.folder") {
          sourceFolderId = backupIdOrDriveId;
          logger.info("📥 Using backup folder directly:", sourceFolderId);
        }
      } catch (error) {
        logger.info("📥 Could not get folder by ID, trying alternative approach...");
      }
      
      if (!sourceFolderId) {
        logger.info("📥 Trying to find backup folder by name...");
        // Try to find the backup folder by searching for it
        const backupFolderQuery = `name='${backupIdOrDriveId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        logger.info("📥 Backup folder query:", backupFolderQuery);
        
        const backupFolderResponse = await this.drive.files.list({
          q: backupFolderQuery,
          fields: "files(id, name, parents)",
        });
        
        if (backupFolderResponse.data.files && backupFolderResponse.data.files.length > 0) {
          sourceFolderId = backupFolderResponse.data.files[0].id;
          logger.info("📥 Found backup folder:", sourceFolderId);
        }
      }
      
      if (!sourceFolderId) {
        throw new Error(`Backup folder not found: ${backupIdOrDriveId}`);
      }

      // Download all files from the source folder to the target leaf path
      logger.info("📥 Downloading files from folder:", sourceFolderId, "to:", targetLeafPath);
      await this.downloadDirectory(sourceFolderId, targetLeafPath);
      
      logger.info("✅ Download completed successfully");
    } catch (error) {
      logger.error("Failed to download backup from Google Drive", error);
      throw error;
    }
  }

  /**
   * Helper function to download a directory recursively
   */
  private async downloadDirectory(folderId: string, localPath: string): Promise<void> {
    try {
      // List all files in the folder
      const files = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType)",
      });

      if (!files.data.files) {
        return;
      }

      for (const file of files.data.files) {
        const filePath = path.join(localPath, file.name);
        
        if (file.mimeType === "application/vnd.google-apps.folder") {
          // It's a folder, create it and recurse
          await fs.promises.mkdir(filePath, { recursive: true });
          await this.downloadDirectory(file.id, filePath);
        } else {
          // It's a file, download it
          const dest = fs.createWriteStream(filePath);
          const response = await this.drive.files.get({
            fileId: file.id,
            alt: "media",
          }, { responseType: "stream" });
          
          response.data.pipe(dest);
          
          await new Promise((resolve, reject) => {
            dest.on("finish", () => resolve(undefined));
            dest.on("error", reject);
          });
          
          logger.info("📥 Downloaded file:", file.name);
        }
      }
    } catch (error) {
      logger.error("❌ Error downloading directory:", error);
      throw error;
    }
  }

  /**
   * Delete a backup from Google Drive
   */
  public async deleteBackup(shop: string, objectId: string, backupIdOrDriveId: string, config: GoogleDriveConfig): Promise<void> {
    try {
      await this.initializeClient(config);
      
      // Normalize the objectId to avoid invalid characters in folder names
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim() || 'Unknown_Game';
      
      // Try by path first
      let backupFolderId = await this.findFolder(`Cloud Save Backup/${shop}-${normalizedObjectId}/${backupIdOrDriveId}`);
      if (!backupFolderId) backupFolderId = backupIdOrDriveId;

      // Permanently delete all children first (files and folders), then the parent
      const purgeRecursive = async (folderId: string) => {
        // Delete files (paginate) with fallback to trash
        let pageTokenFiles: string | undefined = undefined;
        do {
          const filesRes = await this.drive.files.list({
            q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
            fields: "nextPageToken, files(id)",
            pageToken: pageTokenFiles,
            pageSize: 1000,
          });
          for (const f of filesRes.data.files || []) {
            try { await this.drive.files.delete({ fileId: f.id }); }
            catch { await this.drive.files.update({ fileId: f.id, requestBody: { trashed: true } }); }
          }
          pageTokenFiles = filesRes.data.nextPageToken as string | undefined;
        } while (pageTokenFiles);

        // Recurse into subfolders (paginate)
        let pageTokenFolders: string | undefined = undefined;
        do {
          const foldersRes = await this.drive.files.list({
            q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: "nextPageToken, files(id)",
            pageToken: pageTokenFolders,
            pageSize: 1000,
          });
          for (const d of foldersRes.data.files || []) {
            await purgeRecursive(d.id);
            try { await this.drive.files.delete({ fileId: d.id }); }
            catch { await this.drive.files.update({ fileId: d.id, requestBody: { trashed: true } }); }
          }
          pageTokenFolders = foldersRes.data.nextPageToken as string | undefined;
        } while (pageTokenFolders);
      };

      await purgeRecursive(backupFolderId);
      await this.drive.files.delete({ fileId: backupFolderId });
    } catch (error) {
      console.error("Failed to delete backup from Google Drive", error);
      throw error;
    }
  }

  /**
   * List backups for a game from Google Drive
   */
  public async listBackups(shop: string, objectId: string, config: GoogleDriveConfig, selectedFolderId?: string): Promise<any[]> {
    try {
      console.log("🔍 Starting listBackups for:", { shop, objectId, selectedFolderId });
      await this.initializeClient(config);

      // Normalize the objectId to avoid invalid characters in folder names
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim() || 'Unknown_Game';

      let gameFolderId: string | null = null;

      // Try multiple approaches to find game folders
      console.log("🔍 Starting search for game folders...");
      console.log("🔍 selectedFolderId:", selectedFolderId);
      
      // Approach 1: If we have a selected folder, look inside it first
      if (selectedFolderId) {
        console.log("🔍 Approach 1: Searching in selected folder:", selectedFolderId);
        
        const gameFolderQuery = `'${selectedFolderId}' in parents and name='${shop}-${normalizedObjectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Game folder search query:", gameFolderQuery);
        
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1000,
        });
        
        console.log("🔍 Game folder response:", gameFolderResponse.data);
        
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder in selected folder:", gameFolderId);
        } else {
          console.log("🔍 No game folder found in selected folder");
        }
      }
      
      // Approach 2: If no game folder found in selected folder, search anywhere
      if (!gameFolderId) {
        console.log("🔍 Approach 2: Searching for game folders anywhere");
        
        const gameFolderQuery = `name='${shop}-${normalizedObjectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Global search query:", gameFolderQuery);
        
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1000,
        });
        
        console.log("🔍 Global search found game folders:", gameFolderResponse.data.files?.length || 0);
        console.log("🔍 Global search game folders:", gameFolderResponse.data.files);
        
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          // Take the most recent one
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder (most recent):", gameFolderId);
        }
      }
      
      // Approach 3: Try with original objectId for backward compatibility
      if (!gameFolderId) {
        console.log("🔍 Approach 3: Searching with original objectId for backward compatibility");
        
        const gameFolderQuery = `name='${shop}-${objectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Backward compatibility search query:", gameFolderQuery);
        
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1000,
        });
        
        console.log("🔍 Backward compatibility search found game folders:", gameFolderResponse.data.files?.length || 0);
        
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          // Take the most recent one
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder (backward compatibility):", gameFolderId);
        }
      }
      
      if (!gameFolderId) {
        console.log("🔍 No game folder found, returning empty array");
        return [];
      }

      console.log("🔍 Searching for backup folders in game folder:", gameFolderId);
      
      const all: any[] = [];
      let pageToken: string | undefined = undefined;
      
      do {
        const query = `'${gameFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Backup search query:", query);
        
        const response = await this.drive.files.list({
          q: query,
          fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
          orderBy: "createdTime desc",
          pageToken,
          pageSize: 1000,
        });
        
        console.log("🔍 Found backup folders in this page:", response.data.files?.length || 0);
        console.log("🔍 Backup folders:", response.data.files);
        
        all.push(...(response.data.files || []));
        pageToken = response.data.nextPageToken as string | undefined;
      } while (pageToken);

      console.log("🔍 Total backups found:", all.length);
      console.log("🔍 All backups:", all);
      
      return all;
    } catch (error) {
      console.error("❌ Failed to list backups from Google Drive", error);
      throw error;
    }
  }

  /**
   * List folders in Google Drive (recursive)
   */
  public async listFolders(parentId: string = 'root', config: GoogleDriveConfig): Promise<any[]> {
    try {
      await this.initializeClient(config);
      
      // List only folders in the specified parent directory
      const query = `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
      
      const response = await this.drive.files.list({
        q: query,
        fields: "files(id, name, createdTime, modifiedTime, parents)",
        orderBy: "name"
      });
      
      return response.data.files || [];
    } catch (error) {
      console.error("Failed to list Google Drive folders", error);
      throw error;
    }
  }

  /**
   * List root folders in Google Drive
   */
  public async listRootFolders(config: GoogleDriveConfig): Promise<any[]> {
    try {
      await this.initializeClient(config);
      
      // List only folders in root directory
      const query = "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false";
      
      const response = await this.drive.files.list({
        q: query,
        fields: "files(id, name, createdTime, modifiedTime)",
        orderBy: "name"
      });
      
      return response.data.files || [];
    } catch (error) {
      console.error("Failed to list Google Drive folders", error);
      throw error;
    }
  }

  /**
   * Helper function to find a folder by name path
   */
  private async findFolder(folderName: string): Promise<string | null> {
    try {
      // Normalize folder names in the path to avoid invalid characters
      const normalizedFolderName = folderName.replace(/[:]/g, '_'); // Substituir caracteres problemáticos
      const parts = normalizedFolderName.split("/");
      let currentFolderId = "root";

      for (const part of parts) {
        // Normalize each part
        const normalizedPart = part.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .trim() || 'Unknown_Folder';
          
        const query = `'${currentFolderId}' in parents and name='${normalizedPart}' and mimeType='application/vnd.google-apps.folder'`;
        
        const response = await this.drive.files.list({
          q: query,
          fields: "files(id)",
        });

        if (!response.data.files || response.data.files.length === 0) {
          return null;
        }

        currentFolderId = response.data.files[0].id;
      }

      return currentFolderId;
    } catch (error) {
      console.error("❌ Failed to find folder in Google Drive", error);
      return null;
    }
  }
}