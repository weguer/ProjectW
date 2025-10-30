import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { exec } from "child_process";
import * as http from "http";
import * as path$1 from "path";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import path__default from "node:path";
import * as fs from "node:fs";
import fs__default from "node:fs";
import YAML from "yaml";
import * as fs$1 from "fs";
import { v4 } from "uuid";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import Store from "electron-store";
import crypto from "node:crypto";
import os from "node:os";
import axios from "axios";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
class Ludusavi {
  static {
    this._projectRoot = null;
  }
  static {
    this._configPath = null;
  }
  static {
    this._binaryPath = null;
  }
  static {
    this._sessionTimestamp = null;
  }
  // Get project root directory (parent of out folder in dev, or app path in production)
  static getProjectRoot() {
    if (this._projectRoot) return this._projectRoot;
    if (app.isPackaged) {
      this._projectRoot = process.resourcesPath;
    } else {
      this._projectRoot = path.join(__dirname, "..", "..");
    }
    return this._projectRoot;
  }
  // Getters para paths
  static get configPath() {
    if (!this._configPath) {
      this._configPath = path.join(this.getProjectRoot(), "ludusavi");
    }
    return this._configPath;
  }
  static get binaryName() {
    return process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
  }
  static get binaryPath() {
    if (!this._binaryPath) {
      this._binaryPath = path.join(this.configPath, this.binaryName);
    }
    return this._binaryPath;
  }
  static get ludusaviResourcesPath() {
    return path.join(this.getProjectRoot(), "ludusavi");
  }
  /**
   * Get or create session timestamp (created once per app session)
   */
  static getOrCreateSessionTimestamp() {
    if (!this._sessionTimestamp) {
      const now = /* @__PURE__ */ new Date();
      this._sessionTimestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}-${now.getHours().toString().padStart(2, "0")}-${now.getMinutes().toString().padStart(2, "0")}-${now.getSeconds().toString().padStart(2, "0")}`;
    }
    return this._sessionTimestamp;
  }
  /**
   * Reset session timestamp (should be called when app starts)
   */
  static resetSessionTimestamp() {
    this._sessionTimestamp = null;
  }
  /**
   * Initialize Ludusavi - copy config and binary to user data
   */
  static async initialize() {
    await this.copyConfigFileToUserData();
    await this.copyBinaryToUserData();
  }
  /**
   * Get Ludusavi configuration
   */
  static async getConfig() {
    const configFile = path.join(this.configPath, "config.yaml");
    const content = await fs.promises.readFile(configFile, "utf-8");
    return YAML.parse(content);
  }
  /**
   * Copy config file to user data directory
   */
  static async copyConfigFileToUserData() {
    if (!fs.existsSync(this.configPath)) {
      await fs.promises.mkdir(this.configPath, { recursive: true });
      const sourceConfig = path.join(this.ludusaviResourcesPath, "config.yaml");
      const destConfig = path.join(this.configPath, "config.yaml");
      if (fs.existsSync(sourceConfig)) {
        await fs.promises.copyFile(sourceConfig, destConfig);
      } else {
        const defaultConfig = {
          manifest: {
            enable: false,
            secondary: [
              {
                url: "https://cdn.losbroxas.org/manifest.yaml",
                enable: true
              }
            ]
          },
          customGames: []
        };
        await fs.promises.writeFile(destConfig, YAML.stringify(defaultConfig));
      }
    }
  }
  /**
   * Copy Ludusavi binary to user data directory
   */
  static async copyBinaryToUserData() {
    console.log("Looking for binary at:", this.binaryPath);
    console.log("Project root:", this.getProjectRoot());
    console.log("Config path:", this.configPath);
    console.log("app.getAppPath():", app.getAppPath());
    if (!fs.existsSync(this.binaryPath)) {
      const sourceBinary = path.join(this.ludusaviResourcesPath, this.binaryName);
      console.log("Source binary:", sourceBinary);
      if (fs.existsSync(sourceBinary)) {
        await fs.promises.copyFile(sourceBinary, this.binaryPath);
        if (process.platform !== "win32") {
          await fs.promises.chmod(this.binaryPath, 493);
        }
      } else {
        const alternativePaths = [
          path.join(this.getProjectRoot(), "ludusavi", this.binaryName),
          path.join(process.resourcesPath || "", "ludusavi", this.binaryName),
          path.join(__dirname, "..", "..", "ludusavi", this.binaryName)
        ];
        let foundBinary = false;
        for (const altPath of alternativePaths) {
          if (fs.existsSync(altPath)) {
            console.log("Found binary at alternative path:", altPath);
            await fs.promises.copyFile(altPath, this.binaryPath);
            if (process.platform !== "win32") {
              await fs.promises.chmod(this.binaryPath, 493);
            }
            foundBinary = true;
            break;
          }
        }
        if (!foundBinary) {
          console.warn(
            `Ludusavi binary not found at ${sourceBinary}. Please download from https://github.com/mtkennerly/ludusavi/releases and place in ${this.configPath}`
          );
        }
      }
    }
  }
  /**
   * Backup a game using Ludusavi (Hydra approach)
   */
  static async backupGame(shop, objectId, backupPath, winePrefix, preview) {
    return new Promise((resolve, reject) => {
      const configFilePath = path.join(this.configPath, "config.yaml");
      const args = [
        "--config",
        configFilePath,
        "backup",
        objectId,
        "--api",
        "--force"
      ];
      if (preview) args.push("--preview");
      if (backupPath) args.push("--path", backupPath);
      if (winePrefix) args.push("--wine-prefix", winePrefix);
      execFile(
        this.binaryPath,
        args,
        (err, stdout) => {
          if (err) {
            console.warn("Ludusavi command with config failed, trying without config:", err);
            const defaultArgs = ["backup", objectId, "--api", "--force"];
            if (preview) defaultArgs.push("--preview");
            if (backupPath) defaultArgs.push("--path", backupPath);
            if (winePrefix) defaultArgs.push("--wine-prefix", winePrefix);
            execFile(
              this.binaryPath,
              defaultArgs,
              (err2, stdout2) => {
                if (err2) {
                  return reject(err2);
                }
                return resolve(JSON.parse(stdout2));
              }
            );
          } else {
            return resolve(JSON.parse(stdout));
          }
        }
      );
    });
  }
  /**
   * Get backup preview for a game (detect saves without backing up)
   */
  static async getBackupPreview(shop, objectId, winePrefix) {
    const config = await this.getConfig();
    const backupData = await this.backupGame(
      shop,
      objectId,
      null,
      winePrefix,
      true
    );
    const customGame = config.customGames.find(
      (game) => game.name === objectId
    );
    return {
      ...backupData,
      customBackupPath: customGame?.files[0] || null
    };
  }
  /**
   * Find installed games using Ludusavi's backup preview (without game names)
   * This scans ALL games in the manifest and returns which ones have saves
   */
  static async findInstalledGames() {
    const args = ["backup", "--preview", "--api"];
    try {
      const { stdout } = await execFileAsync(this.binaryPath, args);
      const result = JSON.parse(stdout);
      const foundGames = [];
      if (result.games) {
        for (const [gameName, gameData] of Object.entries(result.games)) {
          if (gameData.files && Object.keys(gameData.files).length > 0) {
            foundGames.push(gameName);
          }
        }
      }
      return foundGames;
    } catch (error) {
      console.error("Ludusavi find failed:", error);
      return [];
    }
  }
  /**
   * Get backup preview for ALL games (scan entire system)
   * @returns LudusaviBackup object with all games that have saves
   */
  static async getAllGamesPreview(onProgress) {
    const configFilePath = path.join(this.configPath, "config.yaml");
    const args = ["--config", configFilePath, "backup", "--preview", "--api"];
    console.log("📋 Executando Ludusavi:", args.join(" "));
    console.log("🔧 Binário:", this.binaryPath);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        // Não conecta stdin, apenas stdout/stderr
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let isResolved = false;
      let currentProgress = 10;
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          onProgress?.(currentProgress);
        }
      }, 200);
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.error("❌ Timeout ao executar Ludusavi");
          clearInterval(progressInterval);
          child.kill();
          console.warn("Ludusavi command with config timed out, trying without config");
          this.getAllGamesPreviewFallback(onProgress).then(resolve).catch(reject);
          isResolved = true;
        }
      }, 12e4);
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        onProgress?.(95);
        console.log("✅ Ludusavi completou com code:", code);
        if (stderr) {
          console.warn("⚠️ Stderr:", stderr);
        }
        console.log("📤 Output length:", stdout.length, "bytes");
        if (code !== 0 && code !== null) {
          console.error("❌ Ludusavi falhou com code:", code);
          console.warn("Ludusavi command with config failed, trying without config");
          this.getAllGamesPreviewFallback(onProgress).then(resolve).catch(reject);
          return;
        }
        try {
          const result = JSON.parse(stdout);
          const totalGames = Object.keys(result.games || {}).length;
          console.log("🎮 Total de jogos encontrados:", totalGames);
          resolve(result);
        } catch (parseError) {
          console.error("❌ Erro ao parsear JSON:", parseError.message);
          console.log("📝 Output:", stdout.substring(0, 500));
          console.warn("Ludusavi JSON parse failed, trying without config");
          this.getAllGamesPreviewFallback(onProgress).then(resolve).catch(reject);
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        console.error("❌ Erro ao executar Ludusavi:", error);
        console.warn("Ludusavi command with config error, trying without config");
        this.getAllGamesPreviewFallback(onProgress).then(resolve).catch(reject);
      });
      child.cancel = () => {
        if (!isResolved) {
          console.log("🛑 Scan cancelado pelo usuário");
          clearTimeout(timeout);
          clearInterval(progressInterval);
          child.kill();
          isResolved = true;
          reject(new Error("Scan cancelled by user"));
        }
      };
    });
  }
  /**
   * Fallback method for getAllGamesPreview without config
   */
  static async getAllGamesPreviewFallback(onProgress) {
    const args = ["backup", "--preview", "--api"];
    console.log("📋 Executando Ludusavi fallback (sem config):", args.join(" "));
    console.log("🔧 Binário:", this.binaryPath);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      let stdout = "";
      let stderr = "";
      let isResolved = false;
      let currentProgress = 10;
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          onProgress?.(currentProgress);
        }
      }, 200);
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.error("❌ Timeout ao executar Ludusavi fallback");
          clearInterval(progressInterval);
          child.kill();
          reject(new Error("Ludusavi fallback timeout after 2 minutes"));
          isResolved = true;
        }
      }, 12e4);
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        onProgress?.(95);
        console.log("✅ Ludusavi fallback completou com code:", code);
        if (stderr) {
          console.warn("⚠️ Stderr:", stderr);
        }
        console.log("📤 Output length:", stdout.length, "bytes");
        if (code !== 0 && code !== null) {
          console.error("❌ Ludusavi fallback falhou com code:", code);
          reject(new Error(`Ludusavi fallback exited with code ${code}`));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          const totalGames = Object.keys(result.games || {}).length;
          console.log("🎮 Total de jogos encontrados (fallback):", totalGames);
          resolve(result);
        } catch (parseError) {
          console.error("❌ Erro ao parsear JSON (fallback):", parseError.message);
          console.log("📝 Output:", stdout.substring(0, 500));
          reject(new Error("Failed to parse Ludusavi fallback output"));
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        console.error("❌ Erro ao executar Ludusavi fallback:", error);
        reject(error);
      });
    });
  }
  /**
   * Add a custom game with manual save path
   */
  static async addCustomGame(gameName, savePath) {
    const config = await this.getConfig();
    config.customGames = config.customGames.filter((game) => game.name !== gameName);
    if (savePath) {
      config.customGames.push({
        name: gameName,
        files: [savePath],
        registry: []
      });
    }
    const configFile = path.join(this.configPath, "config.yaml");
    await fs.promises.writeFile(configFile, YAML.stringify(config));
  }
  /**
   * Remove a custom game
   */
  static async removeCustomGame(gameName) {
    const config = await this.getConfig();
    config.customGames = config.customGames.filter((game) => game.name !== gameName);
    const configFile = path.join(this.configPath, "config.yaml");
    await fs.promises.writeFile(configFile, YAML.stringify(config));
  }
  /**
   * Check if Ludusavi binary exists
   */
  static isBinaryAvailable() {
    const exists = fs.existsSync(this.binaryPath);
    console.log(`🔎 Verificando Ludusavi em: ${this.binaryPath}`);
    console.log(`✅ Binary exists: ${exists}`);
    return exists;
  }
  /**
   * Get the path to the Ludusavi binary
   */
  static getBinaryPath() {
    return this.binaryPath;
  }
}
if (app.isPackaged) {
  const envPath = path$1.join(process.resourcesPath, ".env");
  console.log("🔍 [GoogleDriveService] Tentando carregar .env em produção:", envPath);
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error("❌ [GoogleDriveService] Erro ao carregar .env em produção:", result.error);
  } else {
    console.log("✅ [GoogleDriveService] .env carregado com sucesso em produção");
  }
} else {
  console.log("🔍 [GoogleDriveService] Tentando carregar .env em desenvolvimento");
  const result = dotenv.config();
  if (result.error) {
    console.error("❌ [GoogleDriveService] Erro ao carregar .env em desenvolvimento:", result.error);
  } else {
    console.log("✅ [GoogleDriveService] .env carregado com sucesso em desenvolvimento");
  }
}
if (!process.env.GOOGLE_DRIVE_REDIRECT_URIS) {
  console.log("⚠️ [GoogleDriveService] GOOGLE_DRIVE_REDIRECT_URIS não encontrada, definindo valor padrão");
  process.env.GOOGLE_DRIVE_REDIRECT_URIS = "http://localhost:3000/oauth2callback,http://localhost:3001/oauth2callback,http://localhost:3002/oauth2callback,http://localhost:3003/oauth2callback,http://localhost:3004/oauth2callback";
}
console.log("🔍 [GoogleDriveService] GOOGLE_DRIVE_REDIRECT_URIS:", process.env.GOOGLE_DRIVE_REDIRECT_URIS);
const logger = {
  info: (...args) => console.log("[INFO]", ...args),
  error: (...args) => console.error("[ERROR]", ...args)
};
class GoogleDriveService {
  constructor() {
    this.oauth2Client = null;
    this.drive = null;
    this.tokenPath = path$1.join(app.getPath("userData"), "google-token.json");
  }
  /**
   * Initialize OAuth2 client with credentials
   */
  async initializeClient(config) {
    try {
      const customPath = config.userPreferences?.googleDriveCredentialsPath;
      if (!customPath) {
        throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
      }
      const credentialsPath = path$1.isAbsolute(customPath) ? customPath : path$1.join(process.cwd(), customPath);
      if (!fs$1.existsSync(credentialsPath)) {
        throw new Error(`Google Drive credentials file not found at: ${credentialsPath}. Please check the file path in settings.`);
      }
      const credentialsData = fs$1.readFileSync(credentialsPath, "utf8");
      const credentials = JSON.parse(credentialsData);
      const clientConfig = credentials.installed || credentials.web;
      if (!clientConfig || !clientConfig.client_id || !clientConfig.client_secret) {
        throw new Error("Invalid Google Drive credentials file. Missing client_id or client_secret in the JSON structure.");
      }
      const redirectUri = clientConfig.redirect_uris?.[0] || "urn:ietf:wg:oauth:2.0:oob";
      this.oauth2Client = new google.auth.OAuth2(
        clientConfig.client_id,
        clientConfig.client_secret,
        redirectUri
      );
      this.drive = google.drive({ version: "v3", auth: this.oauth2Client });
      if (config.userPreferences?.googleDriveAccessToken && config.userPreferences?.googleDriveRefreshToken) {
        this.oauth2Client.setCredentials({
          access_token: config.userPreferences.googleDriveAccessToken,
          refresh_token: config.userPreferences.googleDriveRefreshToken
        });
      } else {
        const tokenPath = config.tokenPath || path$1.join(process.cwd(), "Credentials", "token.json");
        if (fs$1.existsSync(tokenPath)) {
          const tokenRaw = fs$1.readFileSync(tokenPath, "utf8");
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
  async getAuthUrl(config) {
    await this.initializeClient(config);
    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly"
    ];
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent"
    });
    return authUrl;
  }
  /**
   * Set tokens from authorization code
   */
  async setTokensFromCode(code, config) {
    await this.initializeClient(config);
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    const tokenPath = config.tokenPath || path$1.join(process.cwd(), "Credentials", "token.json");
    const tokenDir = path$1.dirname(tokenPath);
    if (!fs$1.existsSync(tokenDir)) {
      fs$1.mkdirSync(tokenDir, { recursive: true });
    }
    fs$1.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.log("Google Drive authentication successful");
    return {
      access_token: tokens.access_token || "",
      refresh_token: tokens.refresh_token || ""
    };
  }
  /**
   * Load saved tokens from file
   */
  async loadSavedTokens(config) {
    try {
      console.log("🔐 Checking Google Drive authentication...");
      await this.initializeClient(config);
      if (config.userPreferences?.googleDriveAccessToken && config.userPreferences?.googleDriveRefreshToken) {
        console.log("🔐 Found tokens in user preferences");
        try {
          const response = await this.drive.about.get({
            fields: "user"
          });
          console.log("🔐 API call successful, status:", response.status);
          return response.status === 200;
        } catch (error) {
          console.error("❌ Token in preferences is invalid:", error);
          try {
            console.log("🔄 Attempting to refresh token...");
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            console.log("✅ Token refreshed successfully");
            return true;
          } catch (refreshError) {
            console.error("❌ Token refresh failed:", refreshError);
            return false;
          }
        }
      }
      const tokenPath = config.tokenPath || path$1.join(process.cwd(), "Credentials", "token.json");
      console.log("🔐 Checking token file at:", tokenPath);
      if (fs$1.existsSync(tokenPath)) {
        console.log("🔐 Token file exists");
        try {
          const tokenRaw = fs$1.readFileSync(tokenPath, "utf8");
          const tokens = JSON.parse(tokenRaw);
          if (tokens.access_token) {
            console.log("🔐 Found access token in file");
            this.oauth2Client.setCredentials(tokens);
            try {
              const response = await this.drive.about.get({
                fields: "user"
              });
              console.log("🔐 API call successful, status:", response.status);
              return response.status === 200;
            } catch (error) {
              console.error("❌ API call failed:", error);
              try {
                console.log("🔄 Attempting to refresh token...");
                const { credentials } = await this.oauth2Client.refreshAccessToken();
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
  async clearAuth(config) {
    try {
      const tokenPath = config.tokenPath || path$1.join(process.cwd(), "Credentials", "token.json");
      if (fs$1.existsSync(tokenPath)) {
        fs$1.unlinkSync(tokenPath);
      }
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
  async ensureFolderExists(parentId, folderName) {
    const list = await this.drive.files.list({
      q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
      spaces: "drive"
    });
    if (list.data.files && list.data.files.length > 0) {
      return list.data.files[0].id;
    }
    const created = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      },
      fields: "id"
    });
    return created.data.id;
  }
  /**
   * Create a new folder in Google Drive
   */
  async createFolder(folderName, parentId = "root", config) {
    try {
      await this.initializeClient(config);
      const fileMetadata = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      };
      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: "id"
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
  async uploadBackup(shop, objectId, backupPath, backupId, config, customFolderName, onProgress) {
    try {
      logger.info("🚀 UPLOAD BACKUP STARTED - Simplified version");
      await this.initializeClient(config);
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
      const mainFolderName = customFolderName || "CloudSaves";
      const gameFolderName = `${shop}-${normalizedObjectId}`;
      const mainFolderId = await this.ensureFolderExists("root", mainFolderName);
      logger.info("📁 Main folder created/found:", mainFolderName, "ID:", mainFolderId);
      const gameFolderId = await this.ensureFolderExists(mainFolderId, gameFolderName);
      logger.info("📁 Game folder created/found:", gameFolderName, "ID:", gameFolderId);
      const backupFolderId = await this.ensureFolderExists(gameFolderId, backupId);
      logger.info("📁 Backup folder created/found:", backupId, "ID:", backupFolderId);
      logger.info("📤 Starting upload from:", backupPath);
      logger.info("📤 Backup path exists:", fs$1.existsSync(backupPath));
      if (!fs$1.existsSync(backupPath)) {
        throw new Error(`Backup path not found: ${backupPath}`);
      }
      const gameBackupPath = backupPath;
      logger.info("📤 Game backup path:", gameBackupPath);
      logger.info("📤 Game backup path exists:", fs$1.existsSync(gameBackupPath));
      try {
        const contents = await fs$1.promises.readdir(gameBackupPath, { withFileTypes: true });
        logger.info("📤 Backup path contents:", contents.map((c) => ({ name: c.name, isDirectory: c.isDirectory() })));
      } catch (error) {
        logger.error("📤 Error reading backup path contents:", error);
      }
      if (!fs$1.existsSync(gameBackupPath)) {
        throw new Error(`Game backup path not found: ${gameBackupPath}`);
      }
      const backupContents = await fs$1.promises.readdir(gameBackupPath, { withFileTypes: true });
      logger.info("📤 Backup contents:", backupContents.length, "items");
      const countFiles = async (dir) => {
        const entries = await fs$1.promises.readdir(dir, { withFileTypes: true });
        let total = 0;
        for (const e of entries) {
          const p = path$1.join(dir, e.name);
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
  async uploadDirectory(localDir, parentId, notify) {
    const entries = await fs$1.promises.readdir(localDir, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = path$1.join(localDir, entry.name);
      if (entry.isDirectory()) {
        logger.info("📁 Creating folder:", entry.name);
        const folderId = await this.ensureFolderExists(parentId, entry.name);
        await this.uploadDirectory(localPath, folderId, notify);
      } else if (entry.isFile()) {
        logger.info("📄 Uploading file:", entry.name);
        try {
          await this.drive.files.create({
            requestBody: { name: entry.name, parents: [parentId] },
            media: { body: fs$1.createReadStream(localPath) },
            fields: "id"
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
  async downloadBackup(shop, objectId, backupIdOrDriveId, downloadPath, config) {
    try {
      logger.info("📥 GOOGLE DRIVE DOWNLOAD - Using local restore logic");
      await this.initializeClient(config);
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
      const cloudSavesPath = path$1.join(downloadPath, "CloudSaves");
      const gameFolderPath = path$1.join(cloudSavesPath, `${shop}-${normalizedObjectId}`);
      const backupFolderPath = path$1.join(gameFolderPath, backupIdOrDriveId);
      const targetLeafPath = path$1.join(backupFolderPath, `${shop}-${normalizedObjectId}`);
      logger.info("📥 Creating local structure:");
      logger.info("📥 CloudSaves path:", cloudSavesPath);
      logger.info("📥 Game folder path:", gameFolderPath);
      logger.info("📥 Backup folder path:", backupFolderPath);
      logger.info("📥 Target leaf path:", targetLeafPath);
      await fs$1.promises.mkdir(targetLeafPath, { recursive: true });
      let sourceFolderId = null;
      logger.info("📥 Searching for backup folder with ID:", backupIdOrDriveId);
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
        const backupFolderQuery = `name='${backupIdOrDriveId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        logger.info("📥 Backup folder query:", backupFolderQuery);
        const backupFolderResponse = await this.drive.files.list({
          q: backupFolderQuery,
          fields: "files(id, name, parents)"
        });
        if (backupFolderResponse.data.files && backupFolderResponse.data.files.length > 0) {
          sourceFolderId = backupFolderResponse.data.files[0].id;
          logger.info("📥 Found backup folder:", sourceFolderId);
        }
      }
      if (!sourceFolderId) {
        throw new Error(`Backup folder not found: ${backupIdOrDriveId}`);
      }
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
  async downloadDirectory(folderId, localPath) {
    try {
      const files = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType)"
      });
      if (!files.data.files) {
        return;
      }
      for (const file of files.data.files) {
        const filePath = path$1.join(localPath, file.name);
        if (file.mimeType === "application/vnd.google-apps.folder") {
          await fs$1.promises.mkdir(filePath, { recursive: true });
          await this.downloadDirectory(file.id, filePath);
        } else {
          const dest = fs$1.createWriteStream(filePath);
          const response = await this.drive.files.get({
            fileId: file.id,
            alt: "media"
          }, { responseType: "stream" });
          response.data.pipe(dest);
          await new Promise((resolve, reject) => {
            dest.on("finish", () => resolve(void 0));
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
  async deleteBackup(shop, objectId, backupIdOrDriveId, config) {
    try {
      await this.initializeClient(config);
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
      let backupFolderId = await this.findFolder(`Cloud Save Backup/${shop}-${normalizedObjectId}/${backupIdOrDriveId}`);
      if (!backupFolderId) backupFolderId = backupIdOrDriveId;
      const purgeRecursive = async (folderId) => {
        let pageTokenFiles = void 0;
        do {
          const filesRes = await this.drive.files.list({
            q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
            fields: "nextPageToken, files(id)",
            pageToken: pageTokenFiles,
            pageSize: 1e3
          });
          for (const f of filesRes.data.files || []) {
            try {
              await this.drive.files.delete({ fileId: f.id });
            } catch {
              await this.drive.files.update({ fileId: f.id, requestBody: { trashed: true } });
            }
          }
          pageTokenFiles = filesRes.data.nextPageToken;
        } while (pageTokenFiles);
        let pageTokenFolders = void 0;
        do {
          const foldersRes = await this.drive.files.list({
            q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: "nextPageToken, files(id)",
            pageToken: pageTokenFolders,
            pageSize: 1e3
          });
          for (const d of foldersRes.data.files || []) {
            await purgeRecursive(d.id);
            try {
              await this.drive.files.delete({ fileId: d.id });
            } catch {
              await this.drive.files.update({ fileId: d.id, requestBody: { trashed: true } });
            }
          }
          pageTokenFolders = foldersRes.data.nextPageToken;
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
  async listBackups(shop, objectId, config, selectedFolderId) {
    try {
      console.log("🔍 Starting listBackups for:", { shop, objectId, selectedFolderId });
      await this.initializeClient(config);
      const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
      let gameFolderId = null;
      console.log("🔍 Starting search for game folders...");
      console.log("🔍 selectedFolderId:", selectedFolderId);
      if (selectedFolderId) {
        console.log("🔍 Approach 1: Searching in selected folder:", selectedFolderId);
        const gameFolderQuery = `'${selectedFolderId}' in parents and name='${shop}-${normalizedObjectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Game folder search query:", gameFolderQuery);
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1e3
        });
        console.log("🔍 Game folder response:", gameFolderResponse.data);
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder in selected folder:", gameFolderId);
        } else {
          console.log("🔍 No game folder found in selected folder");
        }
      }
      if (!gameFolderId) {
        console.log("🔍 Approach 2: Searching for game folders anywhere");
        const gameFolderQuery = `name='${shop}-${normalizedObjectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Global search query:", gameFolderQuery);
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1e3
        });
        console.log("🔍 Global search found game folders:", gameFolderResponse.data.files?.length || 0);
        console.log("🔍 Global search game folders:", gameFolderResponse.data.files);
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder (most recent):", gameFolderId);
        }
      }
      if (!gameFolderId) {
        console.log("🔍 Approach 3: Searching with original objectId for backward compatibility");
        const gameFolderQuery = `name='${shop}-${objectId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Backward compatibility search query:", gameFolderQuery);
        const gameFolderResponse = await this.drive.files.list({
          q: gameFolderQuery,
          fields: "files(id, name, parents)",
          orderBy: "createdTime desc",
          pageSize: 1e3
        });
        console.log("🔍 Backward compatibility search found game folders:", gameFolderResponse.data.files?.length || 0);
        if (gameFolderResponse.data.files && gameFolderResponse.data.files.length > 0) {
          gameFolderId = gameFolderResponse.data.files[0].id;
          console.log("🔍 Found game folder (backward compatibility):", gameFolderId);
        }
      }
      if (!gameFolderId) {
        console.log("🔍 No game folder found, returning empty array");
        return [];
      }
      console.log("🔍 Searching for backup folders in game folder:", gameFolderId);
      const all = [];
      let pageToken = void 0;
      do {
        const query = `'${gameFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        console.log("🔍 Backup search query:", query);
        const response = await this.drive.files.list({
          q: query,
          fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
          orderBy: "createdTime desc",
          pageToken,
          pageSize: 1e3
        });
        console.log("🔍 Found backup folders in this page:", response.data.files?.length || 0);
        console.log("🔍 Backup folders:", response.data.files);
        all.push(...response.data.files || []);
        pageToken = response.data.nextPageToken;
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
  async listFolders(parentId = "root", config) {
    try {
      await this.initializeClient(config);
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
  async listRootFolders(config) {
    try {
      await this.initializeClient(config);
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
  async findFolder(folderName) {
    try {
      const normalizedFolderName = folderName.replace(/[:]/g, "_");
      const parts = normalizedFolderName.split("/");
      let currentFolderId = "root";
      for (const part of parts) {
        const normalizedPart = part.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Folder";
        const query = `'${currentFolderId}' in parents and name='${normalizedPart}' and mimeType='application/vnd.google-apps.folder'`;
        const response = await this.drive.files.list({
          q: query,
          fields: "files(id)"
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
class LocalSaveManager {
  constructor(config) {
    this.config = config;
  }
  async cleanupTempFolder() {
    const tempRoot = path__default.join(process.cwd(), "temp");
    try {
      if (fs__default.existsSync(tempRoot)) {
        await fs__default.promises.rm(tempRoot, { recursive: true, force: true });
        console.log("🧹 Temp folder cleaned:", tempRoot);
      }
    } catch (error) {
      console.error("❌ Failed to clean temp folder", tempRoot, error);
    }
  }
  /**
   * Normalize game name to be used as a folder name
   * Removes or replaces characters that are invalid in file paths
   */
  normalizeGameName(gameName) {
    return gameName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
  }
  getBackupLabel(automatic = false) {
    const date = (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR");
    return automatic ? `Backup automático de ${date}` : `Backup de ${date}`;
  }
  async bundleBackup(shop, objectId, winePrefix, backupPath) {
    const normalizedObjectId = this.normalizeGameName(objectId);
    const gameBackupPath = path__default.join(backupPath, `${shop}-${normalizedObjectId}`);
    if (fs__default.existsSync(gameBackupPath)) {
      try {
        await fs__default.promises.rm(gameBackupPath, { recursive: true });
      } catch (error) {
        console.error("Failed to remove backup path", { gameBackupPath, error });
      }
    }
    await this.runLocalLudusaviBackup(shop, objectId, gameBackupPath, winePrefix);
    return gameBackupPath;
  }
  async runLocalLudusaviBackup(shop, objectId, backupPath, winePrefix) {
    return new Promise((resolve, reject) => {
      const resourcesRoot = app.isPackaged ? process.resourcesPath : path__default.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path__default.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path__default.join(ludusaviRoot, binaryName);
      const configPath = ludusaviRoot;
      const configFilePath = path__default.join(configPath, "config.yaml");
      const args = [
        "--config",
        configFilePath,
        "backup",
        objectId,
        "--api",
        "--force"
      ];
      if (winePrefix) {
        args.push("--wine-prefix", winePrefix);
      }
      if (backupPath) {
        args.push("--path", backupPath);
      }
      console.log(`Running Ludusavi backup: ${ludusaviPath} ${args.join(" ")}`);
      const { spawn: spawn2 } = require2("child_process");
      const ludusaviProcess = spawn2(ludusaviPath, args);
      let stdout = "";
      let stderr = "";
      ludusaviProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      ludusaviProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      ludusaviProcess.on("close", (code) => {
        console.log(`Ludusavi backup stdout: ${stdout}`);
        if (stderr) {
          console.error(`Ludusavi backup stderr: ${stderr}`);
        }
        if (code === 0) {
          resolve();
        } else {
          console.warn("Ludusavi backup with config failed, trying without config");
          this.runLocalLudusaviBackupFallback(objectId, backupPath, winePrefix).then(resolve).catch(reject);
        }
      });
      ludusaviProcess.on("error", (error) => {
        console.error(`Ludusavi backup error: ${error.message}`);
        console.warn("Ludusavi backup error, trying without config");
        this.runLocalLudusaviBackupFallback(objectId, backupPath, winePrefix).then(resolve).catch(reject);
      });
    });
  }
  /**
   * Fallback method for Ludusavi backup without config
   */
  async runLocalLudusaviBackupFallback(objectId, backupPath, winePrefix) {
    return new Promise((resolve, reject) => {
      const resourcesRoot = app.isPackaged ? process.resourcesPath : path__default.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path__default.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path__default.join(ludusaviRoot, binaryName);
      const args = [
        "backup",
        objectId,
        "--api",
        "--force"
      ];
      if (winePrefix) {
        args.push("--wine-prefix", winePrefix);
      }
      if (backupPath) {
        args.push("--path", backupPath);
      }
      console.log(`Running Ludusavi backup fallback (without config): ${ludusaviPath} ${args.join(" ")}`);
      const { spawn: spawn2 } = require2("child_process");
      const ludusaviProcess = spawn2(ludusaviPath, args);
      let stdout = "";
      let stderr = "";
      ludusaviProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      ludusaviProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      ludusaviProcess.on("close", (code) => {
        console.log(`Ludusavi backup fallback stdout: ${stdout}`);
        if (stderr) {
          console.error(`Ludusavi backup fallback stderr: ${stderr}`);
        }
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ludusavi backup fallback failed with code ${code}. stderr: ${stderr}`));
        }
      });
      ludusaviProcess.on("error", (error) => {
        console.error(`Ludusavi backup fallback error: ${error.message}`);
        reject(error);
      });
    });
  }
  async runLocalLudusaviRestore(shop, objectId, backupPath, winePrefix) {
    return new Promise((resolve, reject) => {
      const resourcesRoot = app.isPackaged ? process.resourcesPath : path__default.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path__default.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path__default.join(ludusaviRoot, binaryName);
      const configPath = ludusaviRoot;
      const absoluteConfigPath = path__default.isAbsolute(configPath) ? configPath : path__default.resolve(process.cwd(), configPath);
      console.log("🔄 Checking if Ludusavi exists at:", ludusaviPath);
      if (!fs__default.existsSync(ludusaviPath)) {
        console.error("❌ Ludusavi executable not found at:", ludusaviPath);
        reject(new Error(`Ludusavi executable not found at: ${ludusaviPath}`));
        return;
      }
      console.log("✅ Ludusavi executable found");
      console.log("🔄 Checking if backup path exists:", backupPath);
      if (!fs__default.existsSync(backupPath)) {
        console.error("❌ Backup path not found:", backupPath);
        reject(new Error(`Backup path not found: ${backupPath}`));
        return;
      }
      console.log("✅ Backup path exists");
      const configFilePath = path__default.join(absoluteConfigPath, "config.yaml");
      const args = [
        "--config",
        configFilePath,
        "restore",
        objectId,
        "--path",
        backupPath,
        "--force"
      ];
      if (winePrefix) {
        args.push("--wine-prefix", winePrefix);
      }
      console.log("🔄 Running Ludusavi restore:");
      console.log("🔄 Ludusavi path:", ludusaviPath);
      console.log("🔄 Config path (original):", configPath);
      console.log("🔄 Config path (absolute):", absoluteConfigPath);
      console.log("🔄 Backup path:", backupPath);
      console.log("🔄 Object ID:", objectId);
      console.log("🔄 Args:", args.join(" "));
      const { spawn: spawn2 } = require2("child_process");
      const ludusaviProcess = spawn2(ludusaviPath, args);
      let stdout = "";
      let stderr = "";
      ludusaviProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      ludusaviProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      ludusaviProcess.on("close", (code) => {
        console.log("🔄 Ludusavi restore completed with code:", code);
        console.log("🔄 Ludusavi restore stdout:", stdout);
        if (stderr) {
          console.error("🔄 Ludusavi restore stderr:", stderr);
        }
        if (code === 0) {
          console.log("✅ Ludusavi restore completed successfully");
          resolve();
        } else {
          console.warn("Ludusavi restore with config failed, trying without config");
          this.runLocalLudusaviRestoreFallback(objectId, backupPath, winePrefix).then(resolve).catch(reject);
        }
      });
      ludusaviProcess.on("error", (error) => {
        console.error(`Ludusavi restore error: ${error.message}`);
        console.warn("Ludusavi restore error, trying without config");
        this.runLocalLudusaviRestoreFallback(objectId, backupPath, winePrefix).then(resolve).catch(reject);
      });
    });
  }
  /**
   * Fallback method for Ludusavi restore without config
   */
  async runLocalLudusaviRestoreFallback(objectId, backupPath, winePrefix) {
    return new Promise((resolve, reject) => {
      const resourcesRoot = app.isPackaged ? process.resourcesPath : path__default.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path__default.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path__default.join(ludusaviRoot, binaryName);
      console.log("🔄 Checking if Ludusavi exists at (fallback):", ludusaviPath);
      if (!fs__default.existsSync(ludusaviPath)) {
        console.error("❌ Ludusavi executable not found at (fallback):", ludusaviPath);
        reject(new Error(`Ludusavi executable not found at: ${ludusaviPath}`));
        return;
      }
      console.log("✅ Ludusavi executable found (fallback)");
      console.log("🔄 Checking if backup path exists (fallback):", backupPath);
      if (!fs__default.existsSync(backupPath)) {
        console.error("❌ Backup path not found (fallback):", backupPath);
        reject(new Error(`Backup path not found: ${backupPath}`));
        return;
      }
      console.log("✅ Backup path exists (fallback)");
      const args = [
        "restore",
        objectId,
        "--path",
        backupPath,
        "--force"
      ];
      if (winePrefix) {
        args.push("--wine-prefix", winePrefix);
      }
      console.log("🔄 Running Ludusavi restore fallback (without config):");
      console.log("🔄 Ludusavi path:", ludusaviPath);
      console.log("🔄 Backup path:", backupPath);
      console.log("🔄 Object ID:", objectId);
      console.log("🔄 Args:", args.join(" "));
      const { spawn: spawn2 } = require2("child_process");
      const ludusaviProcess = spawn2(ludusaviPath, args);
      let stdout = "";
      let stderr = "";
      ludusaviProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      ludusaviProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      ludusaviProcess.on("close", (code) => {
        console.log("🔄 Ludusavi restore fallback completed with code:", code);
        console.log("🔄 Ludusavi restore fallback stdout:", stdout);
        if (stderr) {
          console.error("🔄 Ludusavi restore fallback stderr:", stderr);
        }
        if (code === 0) {
          console.log("✅ Ludusavi restore fallback completed successfully");
          resolve();
        } else {
          console.error("❌ Ludusavi restore fallback failed with code:", code);
          reject(new Error(`Ludusavi restore fallback failed with code ${code}. stderr: ${stderr}`));
        }
      });
      ludusaviProcess.on("error", (error) => {
        console.error(`Ludusavi restore fallback error: ${error.message}`);
        reject(error);
      });
    });
  }
  async createLocalBackup(objectId, shop, downloadOptionTitle, label, achievements) {
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupId = crypto.randomUUID();
    const backupPath = path__default.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
    fs__default.mkdirSync(backupPath, { recursive: true });
    const bundleLocation = await this.bundleBackup(
      shop,
      objectId,
      // Use original objectId for Ludusavi commands
      null,
      // winePrefix - can be passed as parameter if needed
      backupPath
    );
    if (achievements && achievements.length > 0) {
      await fs__default.promises.writeFile(
        path__default.join(backupPath, "achievements.json"),
        JSON.stringify(achievements)
      );
    }
    const backupSize = await this.getDirectorySize(bundleLocation);
    const backupLabel = label ?? this.getBackupLabel(false);
    const newBackup = {
      id: backupId,
      label: backupLabel && backupLabel !== "null" && backupLabel !== "undefined" ? backupLabel : this.getBackupLabel(false),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      downloadOptionTitle,
      artifactLengthInBytes: backupSize,
      hostname: "local"
    };
    const metadataPath = path__default.join(backupPath, "metadata.json");
    await fs__default.promises.writeFile(metadataPath, JSON.stringify(newBackup, null, 2));
    await this.cleanupTempFolder();
    return newBackup;
  }
  async createEphemeralBackup(objectId, shop, _downloadOptionTitle, _label) {
    const tempRoot = await fs__default.promises.mkdtemp(path__default.join(os.tmpdir(), "cloud-save-ephemeral-"));
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupId = crypto.randomUUID();
    const backupPath = path__default.join(tempRoot, `${shop}-${normalizedObjectId}`, backupId);
    fs__default.mkdirSync(backupPath, { recursive: true });
    const bundleLocation = await this.bundleBackup(
      shop,
      objectId,
      // Use original objectId for Ludusavi commands
      null,
      backupPath
    );
    return { backupId, backupPath: bundleLocation };
  }
  async restoreLocalBackup(shop, objectId, backupId, winePrefix, customLocalSavesPath) {
    const normalizedObjectId = this.normalizeGameName(objectId);
    let backupPath;
    let gameBackupPath;
    if (customLocalSavesPath) {
      backupPath = customLocalSavesPath;
      gameBackupPath = path__default.join(backupPath, `${shop}-${normalizedObjectId}`);
      if (!fs__default.existsSync(gameBackupPath)) {
        gameBackupPath = path__default.join(backupPath, `${shop}-${objectId}`);
      }
      const backupIdPath = path__default.join(backupPath, backupId);
      if (fs__default.existsSync(backupIdPath)) {
        const gameBackupPathInBackupId = path__default.join(backupIdPath, `${shop}-${normalizedObjectId}`);
        if (fs__default.existsSync(gameBackupPathInBackupId)) {
          gameBackupPath = gameBackupPathInBackupId;
        } else {
          const gameBackupPathInBackupIdOriginal = path__default.join(backupIdPath, `${shop}-${objectId}`);
          if (fs__default.existsSync(gameBackupPathInBackupIdOriginal)) {
            gameBackupPath = gameBackupPathInBackupIdOriginal;
          }
        }
      }
      const cloudSavesPath = path__default.join(backupPath, "CloudSaves");
      if (fs__default.existsSync(cloudSavesPath)) {
        const gameFolderInCloudSaves = path__default.join(cloudSavesPath, `${shop}-${normalizedObjectId}`);
        if (fs__default.existsSync(gameFolderInCloudSaves)) {
          const backupFolderInGame = path__default.join(gameFolderInCloudSaves, backupId);
          if (fs__default.existsSync(backupFolderInGame)) {
            const gameBackupPathInCloudStructure = path__default.join(backupFolderInGame, `${shop}-${normalizedObjectId}`);
            if (fs__default.existsSync(gameBackupPathInCloudStructure)) {
              gameBackupPath = gameBackupPathInCloudStructure;
            } else {
              const gameBackupPathOriginal = path__default.join(backupFolderInGame, `${shop}-${objectId}`);
              if (fs__default.existsSync(gameBackupPathOriginal)) {
                gameBackupPath = gameBackupPathOriginal;
              }
            }
          } else {
            if (fs__default.existsSync(gameFolderInCloudSaves)) {
              const gameBackupPathInCloudStructure = path__default.join(gameFolderInCloudSaves, `${shop}-${normalizedObjectId}`);
              if (fs__default.existsSync(gameBackupPathInCloudStructure)) {
                gameBackupPath = gameBackupPathInCloudStructure;
              } else {
                const gameBackupPathOriginal = path__default.join(gameFolderInCloudSaves, `${shop}-${objectId}`);
                if (fs__default.existsSync(gameBackupPathOriginal)) {
                  gameBackupPath = gameBackupPathOriginal;
                }
              }
            }
          }
        }
      }
    } else {
      const localSavesPath = this.config.localSavesPath;
      backupPath = path__default.join(localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
      gameBackupPath = path__default.join(backupPath, `${shop}-${normalizedObjectId}`);
    }
    console.log("🔄 RestoreLocalBackup - backupPath:", backupPath);
    console.log("🔄 RestoreLocalBackup - gameBackupPath:", gameBackupPath);
    console.log("🔄 RestoreLocalBackup - customLocalSavesPath:", customLocalSavesPath);
    console.log("🔄 Checking if backup directory exists:", backupPath);
    console.log("🔄 Backup directory exists:", fs__default.existsSync(backupPath));
    if (!fs__default.existsSync(backupPath)) {
      console.error("❌ Backup directory not found:", backupPath);
      throw new Error(`Backup directory not found: ${backupPath}`);
    }
    console.log("🔄 RestoreLocalBackup - gameBackupPath exists:", fs__default.existsSync(gameBackupPath));
    if (fs__default.existsSync(gameBackupPath)) {
      console.log("✅ Ludusavi backup directory found, starting restore...");
      console.log("🔄 RestoreLocalBackup - Contents of gameBackupPath:");
      try {
        const gameContents = await fs__default.promises.readdir(gameBackupPath);
        console.log("📁 Game backup contents:", gameContents);
      } catch (error) {
        console.error("❌ Error reading gameBackupPath contents:", error);
      }
      await this.runLocalLudusaviRestore(shop, objectId, gameBackupPath, winePrefix ?? null);
    } else {
      console.error("❌ Ludusavi backup directory not found:", gameBackupPath);
      try {
        const contents = await fs__default.promises.readdir(backupPath);
        console.log("📁 Contents of backupPath:", contents);
        console.log("📁 backupPath exists:", fs__default.existsSync(backupPath));
      } catch (error) {
        console.error("❌ Error reading backupPath contents:", error);
      }
      throw new Error(`Ludusavi backup directory not found: ${gameBackupPath}`);
    }
    await this.cleanupTempFolder();
    const achievementsPath = path__default.join(backupPath, "achievements.json");
    if (fs__default.existsSync(achievementsPath)) {
      const unlockedAchievements = JSON.parse(await fs__default.promises.readFile(achievementsPath, "utf-8"));
      return unlockedAchievements;
    }
    return [];
  }
  async deleteLocalBackup(shop, objectId, backupId) {
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupToDeletePath = path__default.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
    if (fs__default.existsSync(backupToDeletePath)) {
      await fs__default.promises.rm(backupToDeletePath, { recursive: true, force: true });
    }
  }
  async getLocalBackups(shop, objectId) {
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupPath = path__default.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`);
    console.log("getLocalBackups: Iniciando busca de backups para:", { shop, objectId });
    console.log("getLocalBackups: Caminho dos backups:", backupPath);
    if (!fs__default.existsSync(backupPath)) {
      console.log("getLocalBackups: Caminho de backups não encontrado");
      return [];
    }
    const backupDirs = fs__default.readdirSync(backupPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
    console.log("getLocalBackups: Diretórios encontrados:", backupDirs);
    const backups = [];
    for (const backupId of backupDirs) {
      const backupDirPath = path__default.join(backupPath, backupId);
      console.log("getLocalBackups: Verificando backupPath:", backupDirPath);
      if (!fs__default.existsSync(backupDirPath)) {
        console.log("getLocalBackups: backupPath não encontrado");
        continue;
      }
      const cloudOnlyMarkerPath = path__default.join(backupDirPath, ".cloud-only");
      if (fs__default.existsSync(cloudOnlyMarkerPath)) {
        console.log("getLocalBackups: Backup marcado como apenas nuvem, ignorando:", backupId);
        continue;
      }
      const metadataPath = path__default.join(backupDirPath, "metadata.json");
      console.log("getLocalBackups: Verificando metadataPath:", metadataPath);
      if (!fs__default.existsSync(metadataPath)) {
        console.log("getLocalBackups: metadata.json não encontrado, criando metadata");
        const gameBackupPath = path__default.join(backupDirPath, `${shop}-${normalizedObjectId}`);
        console.log("getLocalBackups: Verificando gameBackupPath:", gameBackupPath);
        if (fs__default.existsSync(gameBackupPath)) {
          console.log("getLocalBackups: gameBackupPath encontrado, criando metadata");
          const stats = fs__default.statSync(gameBackupPath);
          const backupDate = new Date(stats.birthtime);
          const label = `Backup de ${backupDate.toLocaleDateString("pt-BR")} às ${backupDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
          let backupSize = 0;
          try {
            backupSize = await this.getDirectorySize(gameBackupPath);
          } catch (sizeError) {
            console.error("getLocalBackups: Erro ao calcular tamanho do backup:", sizeError);
            backupSize = 0;
          }
          const metadata = {
            id: backupId,
            label,
            createdAt: stats.birthtime.toISOString(),
            downloadOptionTitle: null,
            artifactLengthInBytes: backupSize,
            hostname: "local"
          };
          fs__default.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } else {
          console.log("getLocalBackups: gameBackupPath não encontrado");
          continue;
        }
      }
      try {
        const metadataRaw = fs__default.readFileSync(metadataPath, "utf8");
        const metadata = JSON.parse(metadataRaw);
        let label = metadata.label;
        if (!label || label === "null" || label === "Backup sem nome" || label === "undefined") {
          const backupDate = new Date(metadata.createdAt);
          label = `Backup de ${backupDate.toLocaleDateString("pt-BR")} às ${backupDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
        }
        backups.push({
          id: metadata.id,
          label,
          createdAt: metadata.createdAt,
          downloadOptionTitle: metadata.downloadOptionTitle,
          artifactLengthInBytes: metadata.artifactLengthInBytes,
          hostname: metadata.hostname
        });
      } catch (error) {
        console.error("getLocalBackups: Erro ao ler metadata.json:", error);
      }
    }
    console.log("getLocalBackups: Backups encontrados:", backups.length);
    console.log("getLocalBackups: Backups detalhados:", JSON.stringify(backups, null, 2));
    return backups;
  }
  async getDirectorySize(dirPath) {
    let totalSize = 0;
    const files = await fs__default.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = path__default.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += await this.getDirectorySize(filePath);
      } else {
        const stats = await fs__default.promises.stat(filePath);
        totalSize += stats.size;
      }
    }
    return totalSize;
  }
}
class BackupManager {
  constructor() {
    const defaultBackupPath = "";
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
          ludusaviPath: "",
          autoBackup: false,
          compressionEnabled: true
        }
      }
    });
    this.googleDrive = new GoogleDriveService();
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    this.localSaveManager = new LocalSaveManager(localSaveConfig);
    this.ensureBackupDirectory();
    this.syncBackupCounts().catch(console.error);
  }
  /**
   * Update game cover URL
   */
  updateGameCover(gameId, coverUrl) {
    const games = this.store.get("games");
    const game = games.find((g) => g.id === gameId);
    if (game) {
      game.coverUrl = coverUrl;
      game.updatedAt = /* @__PURE__ */ new Date();
      this.store.set("games", games);
      console.log(`✅ Cover URL atualizada para o jogo ${game.name}: ${coverUrl}`);
    } else {
      console.warn(`⚠️ Jogo não encontrado para atualização: ${gameId}`);
    }
  }
  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    const backupPath = this.store.get("config").backupPath;
    if (!fs$1.existsSync(backupPath)) {
      fs$1.mkdirSync(backupPath, { recursive: true });
    }
  }
  /**
   * Get all games
   */
  getGames() {
    return this.store.get("games");
  }
  /**
   * Add a new game
   */
  addGame(name, customSavePath, coverUrl, gameId, platform, displayName) {
    const games = this.store.get("games");
    const existing = games.find(
      (g) => g.name === name || gameId && g.gameId === gameId
    );
    if (existing) {
      throw new Error(`Game "${name}" already exists`);
    }
    const game = {
      id: v4(),
      name,
      displayName: displayName || name,
      gameId,
      platform,
      customSavePath,
      coverUrl,
      backupCount: 0,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    games.push(game);
    this.store.set("games", games);
    if (customSavePath) {
      Ludusavi.addCustomGame(name, customSavePath).catch(console.error);
    }
    return game;
  }
  /**
   * Remove a game
   */
  removeGame(gameId) {
    const games = this.store.get("games");
    const game = games.find((g) => g.id === gameId);
    if (game?.customSavePath) {
      Ludusavi.removeCustomGame(game.name).catch(console.error);
    }
    this.store.set("games", games.filter((g) => g.id !== gameId));
    const backups = this.store.get("backups");
    this.store.set("backups", backups.filter((b) => b.gameId !== gameId));
  }
  /**
   * Get backups for a game
   */
  getBackupsForGame(gameId) {
    const backups = this.store.get("backups");
    return backups.filter((b) => b.gameId === gameId);
  }
  /**
   * Get backup preview (detect saves without backing up)
   */
  async getBackupPreview(gameName) {
    return await Ludusavi.getBackupPreview("steam", gameName);
  }
  /**
   * Create a local backup using Hydra's approach
   */
  async createLocalBackup(gameId, label, onProgress) {
    const games = this.store.get("games");
    const game = games.find((g) => g.id === gameId);
    if (!game) {
      throw new Error("Game not found");
    }
    onProgress?.({
      gameId,
      status: "detecting",
      progress: 0,
      message: "Detecting save files..."
    });
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    const localSaveManager = new LocalSaveManager(localSaveConfig);
    const shop = game.platform || "steam";
    const objectId = game.gameId || game.name;
    onProgress?.({
      gameId,
      status: "backing-up",
      progress: 30,
      message: "Creating backup..."
    });
    const backup = await localSaveManager.createLocalBackup(
      objectId,
      shop,
      null,
      // downloadOptionTitle
      label
    );
    onProgress?.({
      gameId,
      status: "complete",
      progress: 100,
      message: "Backup completed successfully"
    });
    game.lastBackup = /* @__PURE__ */ new Date();
    game.backupCount++;
    game.updatedAt = /* @__PURE__ */ new Date();
    this.store.set("games", games);
    return backup;
  }
  /**
   * Upload backup to Google Drive using Hydra's approach
   */
  async uploadToGoogleDrive(backupId, shop, objectId, onProgress, customFolderName) {
    const normalizedObjectId = objectId.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game";
    const backupPath = path$1.join(this.store.get("config").backupPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
    if (!fs$1.existsSync(backupPath)) {
      throw new Error("Backup not found");
    }
    if (!this.store.get("config").googleDrive.enabled) {
      throw new Error("Google Drive not enabled");
    }
    const googleDriveConfig = {
      userPreferences: {
        googleDriveCredentialsPath: this.store.get("config").googleDrive.credentialsPath,
        googleDriveAccessToken: this.store.get("config").googleDrive.accessToken,
        googleDriveRefreshToken: this.store.get("config").googleDrive.refreshToken
      }
    };
    const fileId = await this.googleDrive.uploadBackup(
      shop,
      objectId,
      backupPath,
      backupId,
      googleDriveConfig,
      customFolderName,
      // Usar o nome da pasta personalizada se fornecido
      (current, total) => {
        if (onProgress) {
          onProgress(current / total * 100);
        }
      }
    );
    console.log(`Backup uploaded with file ID: ${fileId}`);
  }
  /**
   * Create an ephemeral backup and upload directly to Google Drive without saving locally
   */
  async createEphemeralBackupAndUploadToGoogleDrive(gameId, label, onProgress, customFolderName) {
    const games = this.store.get("games");
    const game = games.find((g) => g.id === gameId);
    if (!game) {
      throw new Error("Game not found");
    }
    if (!this.store.get("config").googleDrive.enabled) {
      throw new Error("Google Drive not enabled");
    }
    const shop = game.platform || "steam";
    const objectId = game.gameId || game.name;
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    const localSaveManager = new LocalSaveManager(localSaveConfig);
    const ephemeralBackup = await localSaveManager.createEphemeralBackup(
      objectId,
      shop,
      null,
      // downloadOptionTitle
      label
    );
    try {
      const googleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: this.store.get("config").googleDrive.credentialsPath,
          googleDriveAccessToken: this.store.get("config").accessToken,
          googleDriveRefreshToken: this.store.get("config").refreshToken
        }
      };
      const fileId = await this.googleDrive.uploadBackup(
        shop,
        objectId,
        ephemeralBackup.backupPath,
        ephemeralBackup.backupId,
        googleDriveConfig,
        customFolderName,
        (current, total) => {
          if (onProgress) {
            onProgress(current / total * 100);
          }
        }
      );
      console.log(`Ephemeral backup uploaded with file ID: ${fileId}`);
    } finally {
      try {
        await fs$1.promises.rm(path$1.dirname(ephemeralBackup.backupPath), { recursive: true, force: true });
        console.log("Ephemeral backup cleaned up successfully");
      } catch (error) {
        console.error("Failed to clean up ephemeral backup:", error);
      }
    }
  }
  /**
   * Restore a backup using Hydra's approach
   */
  async restoreBackup(backupId, shop, objectId, onProgress) {
    onProgress?.({
      gameId: "",
      // We don't have gameId in this context
      status: "backing-up",
      progress: 0,
      message: "Preparing restore..."
    });
    const isGoogleDriveBackup = backupId.startsWith("gdrive-");
    let tempBackupPath = null;
    let googleDriveFileId = null;
    if (isGoogleDriveBackup) {
      googleDriveFileId = backupId.replace("gdrive-", "");
      onProgress?.({
        gameId: "",
        status: "backing-up",
        progress: 20,
        message: "Downloading backup from Google Drive..."
      });
      try {
        const googleDriveConfig = {
          userPreferences: {
            googleDriveCredentialsPath: this.store.get("config").googleDrive.credentialsPath,
            googleDriveAccessToken: this.store.get("config").googleDrive.accessToken,
            googleDriveRefreshToken: this.store.get("config").googleDrive.refreshToken
          }
        };
        const tempDownloadPath = path$1.join(this.store.get("config").backupPath, "temp-restore");
        await fs$1.promises.mkdir(tempDownloadPath, { recursive: true });
        await this.googleDrive.downloadBackup(
          shop,
          objectId,
          googleDriveFileId,
          tempDownloadPath,
          googleDriveConfig
        );
        tempBackupPath = tempDownloadPath;
        console.log("📥 Caminho temporário do backup:", tempBackupPath);
      } catch (error) {
        console.error(`❌ Erro ao baixar backup do Google Drive: ${googleDriveFileId}`, error);
        throw error;
      }
    }
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    const localSaveManager = new LocalSaveManager(localSaveConfig);
    onProgress?.({
      gameId: "",
      status: "backing-up",
      progress: 50,
      message: "Restoring files..."
    });
    if (isGoogleDriveBackup && tempBackupPath && googleDriveFileId) {
      await localSaveManager.restoreLocalBackup(
        shop,
        objectId,
        googleDriveFileId,
        // Usar o ID real do Google Drive como backupId
        null,
        // winePrefix
        tempBackupPath
        // customLocalSavesPath - o caminho temporário onde o backup foi extraído
      );
    } else {
      await localSaveManager.restoreLocalBackup(
        shop,
        objectId,
        backupId
      );
    }
    if (isGoogleDriveBackup) {
      try {
        const tempDownloadPath = path$1.join(this.store.get("config").backupPath, "temp-restore");
        await fs$1.promises.rm(tempDownloadPath, { recursive: true, force: true });
      } catch (error) {
        console.error("❌ Erro ao limpar diretório temporário:", error);
      }
    }
    onProgress?.({
      gameId: "",
      status: "complete",
      progress: 100,
      message: "Restore completed successfully"
    });
  }
  /**
   * Delete a backup
   */
  async deleteBackup(backupId, shop, objectId) {
    console.log(`🔍 deleteBackup chamado para backupId: ${backupId}, shop: ${shop}, objectId: ${objectId}`);
    const isGoogleDriveBackup = backupId.startsWith("gdrive-");
    console.log(`🔍 É backup do Google Drive: ${isGoogleDriveBackup}`);
    if (isGoogleDriveBackup) {
      const googleDriveFileId = backupId.replace("gdrive-", "");
      console.log(`🔍 ID do Google Drive: ${googleDriveFileId}`);
      try {
        const googleDriveConfig = {
          userPreferences: {
            googleDriveCredentialsPath: this.store.get("config").googleDrive.credentialsPath,
            googleDriveAccessToken: this.store.get("config").googleDrive.accessToken,
            googleDriveRefreshToken: this.store.get("config").googleDrive.refreshToken
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
      const localSaveConfig = {
        localSavesPath: this.store.get("config").backupPath,
        ludusaviPath: this.store.get("config").ludusaviPath
      };
      const localSaveManager = new LocalSaveManager(localSaveConfig);
      await localSaveManager.deleteLocalBackup(shop, objectId, backupId);
    }
    const backups = this.store.get("backups");
    this.store.set("backups", backups.filter((b) => b.id !== backupId));
    const games = this.store.get("games");
    const game = games.find((g) => {
      const gameShop = g.platform || "steam";
      const gameObjectId = g.gameId || g.name;
      return gameShop === shop && gameObjectId === objectId;
    });
    if (game) {
      const actualBackups = await this.getLocalBackups(shop, objectId);
      game.backupCount = actualBackups.length;
      game.updatedAt = /* @__PURE__ */ new Date();
      this.store.set("games", games);
    }
    console.log(`✅ deleteBackup concluído para backupId: ${backupId}`);
  }
  /**
   * Mark a backup as cloud-only (not to be listed in local backups)
   */
  async markBackupAsCloudOnly(backupId, shop, objectId) {
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    const localSaveManager = new LocalSaveManager(localSaveConfig);
    const normalizedObjectId = localSaveManager["normalizeGameName"](objectId);
    const backupPath = path$1.join(this.store.get("config").backupPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
    const markerPath = path$1.join(backupPath, ".cloud-only");
    await fs$1.promises.writeFile(markerPath, "This backup exists only in the cloud");
  }
  /**
   * Get configuration
   */
  getConfig() {
    return this.store.get("config");
  }
  /**
   * Update configuration
   */
  updateConfig(config) {
    const currentConfig = this.store.get("config");
    this.store.set("config", { ...currentConfig, ...config });
    this.ensureBackupDirectory();
  }
  /**
   * Set Google Drive default folder
   */
  setGoogleDriveDefaultFolder(folderId, folderName) {
    const config = this.store.get("config");
    config.googleDrive.defaultFolderId = folderId;
    config.googleDrive.defaultFolderName = folderName;
    this.store.set("config", config);
  }
  /**
   * Get Google Drive default folder
   */
  getGoogleDriveDefaultFolder() {
    const config = this.store.get("config");
    if (config.googleDrive.defaultFolderId && config.googleDrive.defaultFolderName) {
      return {
        id: config.googleDrive.defaultFolderId,
        name: config.googleDrive.defaultFolderName
      };
    }
    return null;
  }
  /**
   * Clear Google Drive default folder
   */
  clearGoogleDriveDefaultFolder() {
    const config = this.store.get("config");
    config.googleDrive.defaultFolderId = void 0;
    config.googleDrive.defaultFolderName = void 0;
    this.store.set("config", config);
  }
  /**
   * Get Google Drive service
   */
  getGoogleDriveService() {
    return this.googleDrive;
  }
  /**
   * Get local backups for a game using Hydra's approach
   */
  async getLocalBackups(shop, objectId) {
    const localSaveConfig = {
      localSavesPath: this.store.get("config").backupPath,
      ludusaviPath: this.store.get("config").ludusaviPath
    };
    const localSaveManager = new LocalSaveManager(localSaveConfig);
    return await localSaveManager.getLocalBackups(shop, objectId);
  }
  /**
   * Get Google Drive backups for a specific game
   */
  async getGameGoogleDriveBackups(shop, objectId) {
    try {
      console.log("🔍 getGameGoogleDriveBackups: Iniciando coleta de backups do Google Drive para jogo específico");
      console.log("🔍 getGameGoogleDriveBackups: Parâmetros:", { shop, objectId });
      const config = this.getConfig();
      if (!config.googleDrive.enabled) {
        console.log("🔍 getGameGoogleDriveBackups: Google Drive não habilitado");
        return [];
      }
      const googleDriveService = this.getGoogleDriveService();
      const googleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: config.googleDrive.credentialsPath,
          googleDriveAccessToken: config.googleDrive.accessToken,
          googleDriveRefreshToken: config.googleDrive.refreshToken
        }
      };
      const isAuthenticated = await googleDriveService.loadSavedTokens(googleDriveConfig);
      console.log("🔍 getGameGoogleDriveBackups: Autenticado no Google Drive:", isAuthenticated);
      if (!isAuthenticated) {
        console.log("🔍 getGameGoogleDriveBackups: Não autenticado no Google Drive");
        return [];
      }
      const selectedFolderId = config.googleDrive.defaultFolderId || void 0;
      const backups = await googleDriveService.listBackups(
        shop,
        objectId,
        googleDriveConfig,
        selectedFolderId
      );
      console.log("🔍 getGameGoogleDriveBackups: Backups encontrados:", backups.length);
      console.log("🔍 getGameGoogleDriveBackups: Backups detalhados:", backups);
      const convertedBackups = backups.map((backup) => ({
        id: `gdrive-${backup.id}`,
        label: this.formatBackupLabel(backup.name, backup.createdTime || backup.modifiedTime),
        createdAt: new Date(backup.createdTime || backup.modifiedTime || /* @__PURE__ */ new Date()),
        sizeBytes: 0,
        // Tamanho não disponível diretamente
        cloudFileId: backup.id,
        isCloudBackup: true
      }));
      console.log("🔍 getGameGoogleDriveBackups: Backups convertidos:", convertedBackups);
      return convertedBackups;
    } catch (error) {
      console.error("Failed to get Google Drive backups for game:", error);
      return [];
    }
  }
  /**
   * Format backup label to be more user-friendly
   */
  formatBackupLabel(backupId, backupDate) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(backupId)) {
      const date = new Date(backupDate);
      return `Backup de ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return backupId;
  }
  /**
   * Get backups from Google Drive default folder
   */
  async getGoogleDriveBackups() {
    try {
      console.log("🔍 getGoogleDriveBackups: Iniciando coleta de backups do Google Drive");
      const config = this.getConfig();
      console.log("🔍 getGoogleDriveBackups: Configuração do Google Drive:", config.googleDrive);
      if (!config.googleDrive.enabled || !config.googleDrive.defaultFolderId) {
        console.log("🔍 getGoogleDriveBackups: Google Drive não habilitado ou sem pasta padrão");
        return [];
      }
      const games = this.getGames();
      console.log("🔍 getGoogleDriveBackups: Total de jogos encontrados:", games.length);
      const allBackups = [];
      const googleDriveService = this.getGoogleDriveService();
      const googleDriveConfig = {
        userPreferences: {
          googleDriveCredentialsPath: config.googleDrive.credentialsPath,
          googleDriveAccessToken: config.googleDrive.accessToken,
          googleDriveRefreshToken: config.googleDrive.refreshToken
        }
      };
      const isAuthenticated = await googleDriveService.loadSavedTokens(googleDriveConfig);
      console.log("🔍 getGoogleDriveBackups: Autenticado no Google Drive:", isAuthenticated);
      if (!isAuthenticated) {
        console.log("🔍 getGoogleDriveBackups: Não autenticado no Google Drive");
        return [];
      }
      for (const game of games) {
        try {
          console.log("🔍 getGoogleDriveBackups: Processando jogo:", game.name);
          const shop = game.platform || "steam";
          const objectId = game.gameId || game.name;
          const backups = await googleDriveService.listBackups(
            shop,
            objectId,
            googleDriveConfig,
            config.googleDrive.defaultFolderId
          );
          console.log("🔍 getGoogleDriveBackups: Backups encontrados para", game.name, ":", backups.length);
          console.log("🔍 getGoogleDriveBackups: Backups detalhados:", backups);
          const convertedBackups = backups.map((backup) => ({
            id: `gdrive-${backup.id}`,
            label: this.formatBackupLabel(backup.name, backup.createdTime || backup.modifiedTime),
            createdAt: new Date(backup.createdTime || backup.modifiedTime || /* @__PURE__ */ new Date()),
            sizeBytes: 0,
            // Tamanho não disponível diretamente
            cloudFileId: backup.id,
            isCloudBackup: true
          }));
          if (convertedBackups.length > 0) {
            console.log("🔍 getGoogleDriveBackups: Adicionando", convertedBackups.length, "backups para", game.name);
            allBackups.push({
              game,
              backups: convertedBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            });
          } else {
            console.log("🔍 getGoogleDriveBackups: Nenhum backup encontrado para", game.name);
          }
        } catch (error) {
          console.error(`Failed to load Google Drive backups for game ${game.name}:`, error);
        }
      }
      console.log("🔍 getGoogleDriveBackups: Total de jogos com backups:", allBackups.length);
      console.log("🔍 getGoogleDriveBackups: Dados completos:", JSON.stringify(allBackups, null, 2));
      return allBackups;
    } catch (error) {
      console.error("Failed to get Google Drive backups:", error);
      return [];
    }
  }
  /**
   * Get all local backups from all games
   */
  async getAllLocalBackups() {
    console.log("🔍 getAllLocalBackups: Iniciando coleta de todos os backups");
    const games = this.getGames();
    console.log("🔍 getAllLocalBackups: Total de jogos encontrados:", games.length);
    const allBackups = [];
    for (const game of games) {
      try {
        console.log("🔍 getAllLocalBackups: Processando jogo:", game.name);
        const shop = game.platform || "steam";
        const objectId = game.gameId || game.name;
        console.log("🔍 getAllLocalBackups: Parâmetros para getLocalBackups:", { shop, objectId });
        const backups = await this.getLocalBackups(shop, objectId);
        console.log("🔍 getAllLocalBackups: Backups encontrados para", game.name, ":", backups.length);
        if (backups.length > 0) {
          console.log("🔍 getAllLocalBackups: Adicionando", backups.length, "backups para", game.name);
          allBackups.push({
            game,
            backups: backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          });
        } else {
          console.log("🔍 getAllLocalBackups: Nenhum backup encontrado para", game.name);
        }
      } catch (error) {
        console.error(`Failed to load backups for game ${game.name}:`, error);
      }
    }
    console.log("🔍 getAllLocalBackups: Total de jogos com backups:", allBackups.length);
    console.log("🔍 getAllLocalBackups: Dados completos:", JSON.stringify(allBackups, null, 2));
    return allBackups;
  }
  /**
   * Get all backups (local and Google Drive)
   */
  async getAllBackups() {
    console.log("🔍 getAllBackups: Iniciando coleta de todos os backups");
    const localBackups = await this.getAllLocalBackups();
    console.log("🔍 getAllBackups: Backups locais encontrados:", localBackups.length);
    const googleDriveBackups = await this.getGoogleDriveBackups();
    console.log("🔍 getAllBackups: Backups do Google Drive encontrados:", googleDriveBackups.length);
    const allBackupsMap = /* @__PURE__ */ new Map();
    for (const { game, backups } of localBackups) {
      const key = game.id;
      if (!allBackupsMap.has(key)) {
        allBackupsMap.set(key, { game, backups: [] });
      }
      const existing = allBackupsMap.get(key);
      existing.backups.push(...backups.map((b) => ({ ...b, isLocalBackup: true })));
    }
    for (const { game, backups } of googleDriveBackups) {
      const key = game.id;
      if (!allBackupsMap.has(key)) {
        allBackupsMap.set(key, { game, backups: [] });
      }
      const existing = allBackupsMap.get(key);
      existing.backups.push(...backups);
    }
    const result = Array.from(allBackupsMap.values()).map(({ game, backups }) => ({
      game,
      backups: backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }));
    console.log("🔍 getAllBackups: Total de jogos com backups:", result.length);
    return result;
  }
  /**
   * Synchronize backup counts for all games
   */
  async syncBackupCounts() {
    console.log("🔍 syncBackupCounts: Iniciando sincronização de contagem de backups");
    const games = this.store.get("games");
    let updated = false;
    for (const game of games) {
      try {
        const shop = game.platform || "steam";
        const objectId = game.gameId || game.name;
        console.log("🔍 syncBackupCounts: Verificando jogo:", game.name);
        const localBackups = await this.getLocalBackups(shop, objectId);
        console.log("🔍 syncBackupCounts: Backups locais encontrados para", game.name, ":", localBackups.length);
        let googleDriveBackupsCount = 0;
        try {
          const googleDriveBackups = await this.getGameGoogleDriveBackups(shop, objectId);
          googleDriveBackupsCount = googleDriveBackups.length;
          console.log("🔍 syncBackupCounts: Backups do Google Drive encontrados para", game.name, ":", googleDriveBackupsCount);
        } catch (error) {
          console.error("🔍 syncBackupCounts: Erro ao obter backups do Google Drive para", game.name, ":", error);
        }
        const totalBackupsCount = localBackups.length + googleDriveBackupsCount;
        console.log("🔍 syncBackupCounts: Total de backups para", game.name, ":", totalBackupsCount);
        if (game.backupCount !== totalBackupsCount) {
          console.log("🔍 syncBackupCounts: Atualizando backupCount de", game.backupCount, "para", totalBackupsCount, "para", game.name);
          game.backupCount = totalBackupsCount;
          game.updatedAt = /* @__PURE__ */ new Date();
          updated = true;
        }
      } catch (error) {
        console.error(`Failed to sync backup count for game ${game.name}:`, error);
      }
    }
    if (updated) {
      console.log("🔍 syncBackupCounts: Salvando jogos atualizados");
      this.store.set("games", games);
    }
    console.log("🔍 syncBackupCounts: Sincronização concluída");
  }
  /**
   * Create local backups for all games
   */
  async createAllGamesLocalBackup(onProgress) {
    const games = this.getGames();
    const totalGames = games.length;
    console.log(`🔍 Iniciando backup de todos os jogos. Total: ${totalGames}`);
    for (let i = 0; i < totalGames; i++) {
      const game = games[i];
      const progressPercent = Math.round(i / totalGames * 100);
      try {
        console.log(`🔍 Processando jogo ${i + 1}/${totalGames}: ${game.name}`);
        onProgress?.({
          gameId: game.id,
          status: "detecting",
          progress: progressPercent,
          message: `Processando ${i + 1}/${totalGames}: ${game.name}`
        });
        await this.createLocalBackup(
          game.id,
          `Backup de ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")} - ${game.name}`,
          onProgress
        );
        console.log(`✅ Backup concluído para: ${game.name}`);
      } catch (error) {
        console.error(`❌ Erro ao fazer backup do jogo ${game.name}:`, error);
      }
    }
    onProgress?.({
      gameId: "",
      status: "complete",
      progress: 100,
      message: "Backup de todos os jogos concluído!"
    });
    console.log("✅ Backup de todos os jogos concluído");
  }
  /**
   * Create ephemeral backups for all games and upload directly to Google Drive
   */
  async createAllGamesEphemeralBackupAndUploadToGoogleDrive(onProgress, customFolderName) {
    const games = this.getGames();
    const totalGames = games.length;
    console.log(`🔍 Iniciando backup de todos os jogos para Google Drive. Total: ${totalGames}`);
    for (let i = 0; i < totalGames; i++) {
      const game = games[i];
      const progressPercent = Math.round(i / totalGames * 100);
      try {
        console.log(`🔍 Processando jogo ${i + 1}/${totalGames}: ${game.name}`);
        if (onProgress) {
          onProgress(i, game.name, progressPercent);
        }
        await this.createEphemeralBackupAndUploadToGoogleDrive(
          game.id,
          `Backup de ${(/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR")} - ${game.name}`,
          (percent) => {
            if (onProgress) {
              onProgress(i, game.name, Math.round(i / totalGames * 100 + percent / totalGames));
            }
          },
          customFolderName
        );
        console.log(`✅ Backup concluído para: ${game.name}`);
      } catch (error) {
        console.error(`❌ Erro ao fazer backup do jogo ${game.name}:`, error);
      }
    }
    console.log("✅ Backup de todos os jogos para Google Drive concluído");
  }
}
const STEAMGRIDDB_API_KEY = "36e16a74d0bebdce424abc69d7a304c8";
const STEAMGRIDDB_BASE_URL = "https://www.steamgriddb.com/api/v2";
class GameScanner {
  static {
    this.currentScanProcess = null;
  }
  /**
   * Update all existing games with new icons instead of covers
   */
  static async updateAllGamesWithIcons(backupManager2) {
    console.log("🔄 Iniciando atualização de ícones para todos os jogos...");
    const games = backupManager2.getGames();
    console.log(`🎮 Encontrados ${games.length} jogos para atualizar`);
    for (const game of games) {
      try {
        console.log(`🔄 Atualizando jogo: ${game.name}`);
        if (game.gameId && /^\d+$/.test(game.gameId)) {
          console.log(`🔍 Buscando novo ícone para Steam ID: ${game.gameId}`);
          const gameInfo = await this.getGameInfo(game.gameId);
          if (gameInfo.coverUrl && gameInfo.coverUrl !== game.coverUrl) {
            console.log(`✅ Novo ícone encontrado para ${game.name}`);
            const updatedGames = backupManager2.getGames();
            const gameToUpdate = updatedGames.find((g) => g.id === game.id);
            if (gameToUpdate) {
              gameToUpdate.coverUrl = gameInfo.coverUrl;
              gameToUpdate.updatedAt = /* @__PURE__ */ new Date();
              backupManager2.store.set("games", updatedGames);
            }
          } else {
            console.log(`ℹ️ Nenhuma atualização necessária para ${game.name}`);
          }
        } else {
          console.log(`⏭️ Pulando jogo sem Steam ID: ${game.name}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao atualizar jogo ${game.name}:`, error);
      }
    }
    console.log("✅ Atualização de ícones concluída");
  }
  /**
   * Scan for installed games using Ludusavi's backup preview command
   */
  static async scanInstalledGames(onProgress) {
    try {
      console.log("🔍 Iniciando escaneamento de jogos instalados...");
      onProgress?.(10);
      console.log("📞 Chamando Ludusavi.getAllGamesPreview()...");
      const backupPreview = await Ludusavi.getAllGamesPreview((progress) => {
        onProgress?.(progress);
      });
      console.log("📥 Resposta recebida do Ludusavi");
      onProgress?.(90);
      if (!backupPreview) {
        console.log("⚠️ Nenhum resultado do Ludusavi");
        return [];
      }
      if (!backupPreview.games) {
        console.log("⚠️ Nenhum jogo na resposta do Ludusavi");
        console.log("📊 Overall stats:", backupPreview.overall);
        return [];
      }
      const gameIds = Object.keys(backupPreview.games);
      console.log(`📦 Ludusavi encontrou ${gameIds.length} jogos com saves`);
      console.log("🎮 Lista de IDs:", gameIds.slice(0, 10).join(", "), gameIds.length > 10 ? "..." : "");
      onProgress?.(92);
      const scannedGames = [];
      const gamesToProcess = gameIds.slice(0, 150);
      console.log(`🎮 Processando ${gamesToProcess.length} jogos...`);
      let processed = 0;
      const totalGames = gamesToProcess.length;
      for (const gameId of gamesToProcess) {
        try {
          const gameData = backupPreview.games[gameId];
          const fileCount = Object.keys(gameData.files || {}).length;
          if (fileCount === 0) {
            console.log(`⏭️ Pulando ${gameId} (sem arquivos)`);
            continue;
          }
          processed++;
          const currentProgress = 92 + Math.floor(processed / totalGames * 7);
          onProgress?.(currentProgress);
          console.log(`[${processed}/${gamesToProcess.length}] Processando: ${gameId}`);
          const gameInfo = await this.getGameInfo(gameId);
          scannedGames.push({
            name: gameInfo.displayName || gameInfo.name,
            displayName: gameInfo.displayName,
            gameId,
            platform: gameInfo.platform,
            coverUrl: gameInfo.coverUrl,
            foundSaves: true,
            savesCount: fileCount
          });
          console.log(`✅ ${gameInfo.displayName || gameId} (${fileCount} arquivos)`);
        } catch (error) {
          console.error(`⚠️ Erro ao processar ${gameId}:`, error);
          continue;
        }
      }
      onProgress?.(99);
      console.log(`✨ Escaneamento concluído: ${scannedGames.length} jogos processados`);
      onProgress?.(100);
      return scannedGames;
    } catch (error) {
      console.error("❌ Falha ao escanear jogos:", error);
      console.error("❌ Stack trace:", error.stack);
      console.error("❌ Mensagem:", error.message);
      throw error;
    }
  }
  /**
   * Cancel ongoing scan
   */
  static cancelScan() {
    console.log("🛑 Tentando cancelar scan...");
  }
  /**
   * Get list of games from Ludusavi manifest
   */
  static async getManifestGames() {
    return [
      "The Witcher 3",
      "Cyberpunk 2077",
      "Stardew Valley",
      "Terraria",
      "Minecraft",
      "Dark Souls III",
      "Elden Ring",
      "Skyrim",
      "Fallout 4",
      "GTA V",
      "Red Dead Redemption 2",
      "Hollow Knight",
      "Celeste",
      "Undertale",
      "Hades",
      "Dead Cells",
      "Binding of Isaac",
      "Don't Starve Together",
      "Subnautica",
      "No Man's Sky",
      "Monster Hunter World",
      "Final Fantasy XIV",
      "Divinity Original Sin 2",
      "Baldur's Gate 3",
      "Portal 2",
      "Half-Life 2",
      "Counter-Strike Global Offensive",
      "Dota 2",
      "League of Legends",
      "Valorant",
      "Apex Legends",
      "Fortnite",
      "Rocket League",
      "Among Us",
      "Fall Guys",
      "Valheim",
      "Project Zomboid",
      "RimWorld",
      "Factorio",
      "Satisfactory",
      "Deep Rock Galactic",
      "Left 4 Dead 2",
      "Payday 2",
      "Warframe",
      "Destiny 2",
      "Path of Exile",
      "Diablo III",
      "Borderlands 3",
      "Resident Evil Village"
    ];
  }
  /**
   * Get game information (name, platform, cover) from game ID
   * Suporta Steam ID, GOG ID ou nome direto
   */
  static async getGameInfo(gameId) {
    if (/^\d+$/.test(gameId)) {
      try {
        console.log(`🔍 Buscando informações do Steam para ID: ${gameId}`);
        const steamInfo = await this.getSteamGameInfo(gameId);
        if (steamInfo) {
          console.log(`✅ Encontrado: ${steamInfo.name}`);
          return {
            name: gameId,
            displayName: steamInfo.name,
            platform: "steam",
            coverUrl: steamInfo.coverUrl
          };
        }
      } catch (error) {
        console.warn(`⚠️ Não foi possível obter dados para Steam ID ${gameId}`);
      }
      return {
        name: gameId,
        platform: "steam",
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/header.jpg`
      };
    }
    const searchResult = await this.searchGameByName(gameId);
    if (searchResult) {
      return searchResult;
    }
    return {
      name: gameId,
      displayName: gameId,
      platform: "unknown",
      coverUrl: `https://via.placeholder.com/460x215/1e1e1e/4CAF50?text=${encodeURIComponent(gameId)}`
    };
  }
  /**
   * Busca informações do jogo na Steam API e ícone do SteamGridDB
   */
  static async getSteamGameInfo(appId) {
    try {
      const response = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=brazilian`,
        { timeout: 5e3 }
      );
      let gameName = `Steam Game ${appId}`;
      if (response.data?.[appId]?.success && response.data[appId].data?.name) {
        gameName = response.data[appId].data.name;
      }
      const coverUrl = await this.getSteamGridDBIcon(appId, gameName);
      return {
        name: gameName,
        coverUrl: coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
      };
    } catch (error) {
      console.error(`Erro ao buscar na Steam API para ${appId}:`, error);
      return {
        name: `Steam Game ${appId}`,
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
      };
    }
  }
  /**
   * Busca ícones do jogo no SteamGridDB
   */
  static async getSteamGridDBIcon(steamId, gameName) {
    try {
      console.log(`🎨 Buscando ícone no SteamGridDB para Steam ID: ${steamId}`);
      const response = await axios.get(
        `${STEAMGRIDDB_BASE_URL}/icons/steam/${steamId}`,
        {
          headers: {
            "Authorization": `Bearer ${STEAMGRIDDB_API_KEY}`
          },
          params: {
            types: "static",
            // Apenas imagens estáticas
            nsfw: "false",
            humor: "false"
          },
          timeout: 5e3
        }
      );
      if (response.data?.success && response.data.data?.length > 0) {
        const icon = response.data.data[0];
        console.log(`✅ Ícone encontrado no SteamGridDB: ${icon.url}`);
        return icon.url;
      }
      console.log(`⚠️ Nenhum ícone encontrado no SteamGridDB para ${steamId}`);
      return null;
    } catch (error) {
      console.error(`❌ Erro ao buscar ícone no SteamGridDB:`, error.message);
      return null;
    }
  }
  /**
   * Busca jogo por nome usando Steam API e SteamGridDB
   */
  static async searchGameByName(gameName) {
    try {
      console.log(`🔍 Buscando jogo por nome: ${gameName}`);
      const steamGridDBResult = await this.searchSteamGridDBByName(gameName);
      if (steamGridDBResult) {
        console.log(`✅ Encontrado no SteamGridDB: ${steamGridDBResult.displayName}`);
        return steamGridDBResult;
      }
      const searchQuery = encodeURIComponent(gameName);
      const response = await axios.get(
        `https://store.steampowered.com/api/storesearch/?term=${searchQuery}&cc=br&l=brazilian`,
        { timeout: 5e3 }
      );
      if (response.data?.items?.length > 0) {
        const firstResult = response.data.items[0];
        console.log(`✅ Encontrado na Steam: ${firstResult.name}`);
        const coverUrl = await this.getSteamGridDBIcon(firstResult.id.toString(), firstResult.name);
        return {
          name: gameName,
          displayName: firstResult.name,
          platform: "steam",
          coverUrl: coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${firstResult.id}/header.jpg`
        };
      }
      return null;
    } catch (error) {
      console.error(`Erro ao buscar jogo ${gameName}:`, error);
      return null;
    }
  }
  /**
   * Busca jogo por nome no SteamGridDB
   */
  static async searchSteamGridDBByName(gameName) {
    try {
      console.log(`🔍 Buscando no SteamGridDB: ${gameName}`);
      const searchResponse = await axios.get(
        `${STEAMGRIDDB_BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`,
        {
          headers: {
            "Authorization": `Bearer ${STEAMGRIDDB_API_KEY}`
          },
          timeout: 5e3
        }
      );
      if (searchResponse.data?.success && searchResponse.data.data?.length > 0) {
        const firstGame = searchResponse.data.data[0];
        console.log(`🎮 Jogo encontrado: ${firstGame.name} (ID: ${firstGame.id})`);
        const iconsResponse = await axios.get(
          `${STEAMGRIDDB_BASE_URL}/icons/game/${firstGame.id}`,
          {
            headers: {
              "Authorization": `Bearer ${STEAMGRIDDB_API_KEY}`
            },
            params: {
              types: "static",
              nsfw: "false",
              humor: "false"
            },
            timeout: 5e3
          }
        );
        let coverUrl;
        if (iconsResponse.data?.success && iconsResponse.data.data?.length > 0) {
          coverUrl = iconsResponse.data.data[0].url;
          console.log(`🎨 Ícone encontrado: ${coverUrl}`);
        }
        return {
          name: gameName,
          displayName: firstGame.name,
          platform: "steam",
          // SteamGridDB retorna principalmente jogos Steam
          coverUrl
        };
      }
      return null;
    } catch (error) {
      console.error(`❌ Erro ao buscar no SteamGridDB:`, error.message);
      return null;
    }
  }
}
if (app.isPackaged) {
  const envPath = path$1.join(process.resourcesPath, ".env");
  console.log("🔍 Tentando carregar .env em produção:", envPath);
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error("❌ Erro ao carregar .env em produção:", result.error);
  } else {
    console.log("✅ .env carregado com sucesso em produção");
  }
} else {
  console.log("🔍 Tentando carregar .env em desenvolvimento");
  const result = dotenv.config();
  if (result.error) {
    console.error("❌ Erro ao carregar .env em desenvolvimento:", result.error);
  } else {
    console.log("✅ .env carregado com sucesso em desenvolvimento");
  }
}
if (!process.env.GOOGLE_DRIVE_REDIRECT_URIS) {
  console.log("⚠️ GOOGLE_DRIVE_REDIRECT_URIS não encontrada, definindo valor padrão");
  process.env.GOOGLE_DRIVE_REDIRECT_URIS = "http://localhost:3000/oauth2callback,http://localhost:3001/oauth2callback,http://localhost:3002/oauth2callback,http://localhost:3003/oauth2callback,http://localhost:3004/oauth2callback";
}
console.log("🔍 GOOGLE_DRIVE_REDIRECT_URIS:", process.env.GOOGLE_DRIVE_REDIRECT_URIS);
const backupManager = new BackupManager();
function createWindow() {
  let iconPath;
  if (app.isPackaged) {
    iconPath = join(process.resourcesPath, "icon.ico");
  } else {
    iconPath = join(__dirname, "../../public/icon.ico");
  }
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    // Disable default frame for custom title bar
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      // Mudado para .mjs
      sandbox: false,
      contextIsolation: true,
      // Garante que contextBridge funcione
      nodeIntegration: false
      // Segurança
    },
    // Disable resize overlays in production
    resizable: app.isPackaged ? true : true,
    maximizable: app.isPackaged ? true : true
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (is.dev) {
      mainWindow.webContents.openDevTools();
    }
  });
  if (app.isPackaged) {
    mainWindow.on("resize", () => {
      if (mainWindow.isMaximized()) ;
    });
    mainWindow.on("maximize", () => {
    });
    mainWindow.on("unmaximize", () => {
    });
  }
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.projectw");
  await Ludusavi.initialize();
  Ludusavi.resetSessionTimestamp();
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  registerIpcHandlers();
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URIS?.split(",")[0];
  console.log("🔍 Redirect URI do .env:", redirectUri);
  if (redirectUri) {
    try {
      const port = new URL(redirectUri).port;
      console.log("🔍 Porta do servidor OAuth:", port);
      server.listen(port, () => {
        console.log(`✅ Servidor OAuth callback rodando na porta ${port}`);
      });
    } catch (error) {
      console.error("❌ Could not start OAuth callback server. Invalid redirect URI in .env file.", error);
    }
  } else {
    console.log("⚠️ Nenhuma redirect URI encontrada no .env");
  }
  createWindow();
  app.on("activate", function() {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  server.close();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
function getDirectorySize(dirPath) {
  let size = 0;
  const files = fs$1.readdirSync(dirPath);
  for (const file of files) {
    const filePath = join(dirPath, file);
    const stats = fs$1.statSync(filePath);
    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }
  return size;
}
async function getNormalizedLudusaviGameFolderName(gameName) {
  return Promise.resolve(
    gameName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim() || "Unknown_Game"
    // Ensure we have a valid name
  );
}
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/oauth2callback")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get("code");
    if (code) {
      BrowserWindow.getAllWindows()[0]?.webContents.send("gdrive-code", code);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Erro: Código de autorização não encontrado.</h1>");
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});
function registerIpcHandlers() {
  ipcMain.handle("get-games", () => backupManager.getGames());
  ipcMain.handle("add-game", async (_, name, customPath) => {
    return backupManager.addGame(name, customPath);
  });
  ipcMain.handle("update-game-cover", async (_, gameId, coverUrl) => {
    backupManager.updateGameCover(gameId, coverUrl);
    return { success: true };
  });
  ipcMain.handle("update-all-icons", async () => {
    try {
      await GameScanner.updateAllGamesWithIcons(backupManager);
      return { success: true };
    } catch (error) {
      console.error("❌ Erro ao atualizar ícones:", error);
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle("scan-games", async (event) => {
    return await GameScanner.scanInstalledGames((progress) => {
      event.sender.send("scan-progress", progress);
    });
  });
  ipcMain.handle("cancel-scan", async () => {
    GameScanner.cancelScan();
  });
  ipcMain.handle("add-scanned-games", async (_, games) => {
    const addedGames = [];
    for (const game of games) {
      try {
        const added = backupManager.addGame(
          game.gameId,
          // name (usa gameId como identificador único)
          void 0,
          // customSavePath
          game.coverUrl,
          // coverUrl
          game.gameId,
          // gameId (Steam ID, GOG ID, etc.)
          game.platform,
          // platform
          game.displayName || game.name
          // displayName (nome amigável)
        );
        addedGames.push(added);
      } catch (error) {
        console.warn(`Jogo já existe: ${game.name}`);
      }
    }
    return addedGames;
  });
  ipcMain.handle("remove-game", async (_, gameId) => {
    backupManager.removeGame(gameId);
  });
  ipcMain.handle("get-backups", (_, gameId) => {
    return backupManager.getBackupsForGame(gameId);
  });
  ipcMain.handle("get-local-backups", async (_, shop, objectId) => {
    return await backupManager.getLocalBackups(shop, objectId);
  });
  ipcMain.handle("get-all-local-backups", async () => {
    console.log("🔍 IPC: getAllLocalBackups chamado");
    const result = await backupManager.getAllLocalBackups();
    console.log("🔍 IPC: getAllLocalBackups resultado:", JSON.stringify(result, null, 2));
    return result;
  });
  ipcMain.handle("get-all-backups", async () => {
    console.log("🔍 IPC: getAllBackups chamado");
    const result = await backupManager.getAllBackups();
    console.log("🔍 IPC: getAllBackups resultado:", JSON.stringify(result, null, 2));
    return result;
  });
  ipcMain.handle("get-ludusavi-backups", async (_, gameName) => {
    const config = await backupManager.getConfig();
    const backupPath = config.backupPath;
    console.log("Root backup path:", backupPath);
    const ludusaviGameFolderName = await getNormalizedLudusaviGameFolderName(gameName);
    console.log("Ludusavi normalized game folder name:", ludusaviGameFolderName);
    const gameBackupPath = join(backupPath, ludusaviGameFolderName);
    console.log("Game backup path:", gameBackupPath);
    if (!fs$1.existsSync(gameBackupPath)) {
      console.log("Game backup path does not exist.");
      return [];
    }
    const backupFolders = fs$1.readdirSync(gameBackupPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
    console.log("Found backup folders:", backupFolders);
    const backups = backupFolders.map((folderName) => {
      const fullPath = join(gameBackupPath, folderName);
      const stats = fs$1.statSync(fullPath);
      const createdAt = new Date(folderName);
      return {
        id: folderName,
        label: folderName,
        createdAt: isNaN(createdAt.getTime()) ? stats.mtime : createdAt,
        sizeBytes: getDirectorySize(fullPath),
        localPath: fullPath
      };
    });
    return backups;
  });
  ipcMain.handle("get-backup-preview", async (_, gameName) => {
    return await backupManager.getBackupPreview(gameName);
  });
  ipcMain.handle("create-backup", async (_, gameId, label) => {
    return new Promise((resolve2, reject) => {
      backupManager.createLocalBackup(gameId, label, (progress) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("backup-progress", progress);
      }).then(resolve2).catch(reject);
    });
  });
  ipcMain.handle("create-ludusavi-backup", async (event, gameName, backupType) => {
    const config = backupManager.getConfig();
    console.log("🔧 Recebido pedido de backup individual:", { gameName, backupType, backupPath: config.backupPath });
    return new Promise((resolve2, reject) => {
      backupManager.createLocalBackup(gameName, void 0, (progress) => {
        event.sender.send("backup-progress-simple", progress);
      }).then(resolve2).catch((error) => {
        console.error("❌ Erro no backup individual:", error);
        reject(error);
      });
    });
  });
  ipcMain.handle("create-all-games-backup", async (event) => {
    const config = backupManager.getConfig();
    console.log("🔧 Recebido pedido de backup geral:", { backupPath: config.backupPath });
    return new Promise((resolve2, reject) => {
      backupManager.createAllGamesLocalBackup((progress) => {
        event.sender.send("backup-progress", progress);
      }).then(() => {
        resolve2({ message: "Backup de todos os jogos concluído com sucesso!" });
      }).catch((error) => {
        console.error("❌ Erro no backup geral:", error);
        reject(error);
      });
    });
  });
  ipcMain.handle("create-all-games-backup-gdrive", async (event, customFolderName) => {
    console.log("🔧 Recebido pedido de backup geral para Google Drive");
    return new Promise((resolve2, reject) => {
      backupManager.createAllGamesEphemeralBackupAndUploadToGoogleDrive(
        (gameIndex, gameName, percent) => {
          event.sender.send("backup-progress", {
            gameId: "",
            status: "backing-up",
            progress: percent,
            message: `Processando ${gameIndex + 1}: ${gameName} (${percent}%)`
          });
        },
        customFolderName
      ).then(() => {
        resolve2({ message: "Backup de todos os jogos para Google Drive concluído com sucesso!" });
      }).catch((error) => {
        console.error("❌ Erro no backup geral para Google Drive:", error);
        reject(error);
      });
    });
  });
  ipcMain.handle("cancel-backup", async () => {
    console.log("Backup cancellation requested");
  });
  ipcMain.handle("restore-backup", async (_, backupId, shop, objectId) => {
    return new Promise((resolve2, reject) => {
      backupManager.restoreBackup(backupId, shop, objectId, (progress) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("restore-progress", progress);
      }).then(resolve2).catch(reject);
    });
  });
  ipcMain.handle("delete-backup", async (_, backupId, shop, objectId) => {
    await backupManager.deleteBackup(backupId, shop, objectId);
  });
  ipcMain.handle("mark-backup-as-cloud-only", async (_, backupId, shop, objectId) => {
    await backupManager.markBackupAsCloudOnly(backupId, shop, objectId);
  });
  ipcMain.handle("gdrive-init", async (_, clientId, clientSecret) => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Caminho do arquivo de credenciais do Google Drive não configurado");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    await gdrive.initializeClient(config);
    return gdrive.getAuthUrl(config);
  });
  ipcMain.handle("gdrive-auth", async (_, code) => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    await gdrive.setTokensFromCode(code, config);
  });
  ipcMain.handle("gdrive-check-auth", async () => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    return await gdrive.loadSavedTokens(config);
  });
  ipcMain.handle("gdrive-logout", async () => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    await gdrive.clearAuth(config);
  });
  ipcMain.handle("gdrive-list-folders", async (_, parentId) => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    return await gdrive.listFolders(parentId || "root", config);
  });
  ipcMain.handle("gdrive-create-folder", async (_, folderName, parentId) => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    return await gdrive.createFolder(folderName, parentId || "root", config);
  });
  ipcMain.handle("set-google-drive-default-folder", (_, folderId, folderName) => {
    backupManager.setGoogleDriveDefaultFolder(folderId, folderName);
  });
  ipcMain.handle("clear-google-drive-default-folder", () => {
    backupManager.clearGoogleDriveDefaultFolder();
  });
  ipcMain.handle("get-google-drive-default-folder", () => {
    return backupManager.getGoogleDriveDefaultFolder();
  });
  ipcMain.handle("gdrive-upload", async (_, backupId, shop, objectId, customFolderName) => {
    return new Promise((resolve2, reject) => {
      backupManager.uploadToGoogleDrive(backupId, shop, objectId, (progress) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("upload-progress", { backupId, progress });
      }, customFolderName).then(resolve2).catch(reject);
    });
  });
  ipcMain.handle("gdrive-upload-ephemeral", async (_, gameId, label, customFolderName) => {
    return new Promise((resolve2, reject) => {
      backupManager.createEphemeralBackupAndUploadToGoogleDrive(gameId, label, (progress) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send("upload-progress", { backupId: "ephemeral", progress });
      }, customFolderName).then(resolve2).catch(reject);
    });
  });
  ipcMain.handle("gdrive-list", async () => {
    const gdrive = backupManager.getGoogleDriveService();
    const appConfig = backupManager.getConfig();
    const credentialsPath = appConfig.googleDrive.credentialsPath;
    if (!credentialsPath) {
      throw new Error("Google Drive credentials path not configured. Please set the credentials file path in settings.");
    }
    const config = {
      userPreferences: {
        googleDriveCredentialsPath: credentialsPath
      }
    };
    return await gdrive.listBackups("steam", "game-id", config);
  });
  ipcMain.handle("get-google-drive-backups", async (_, shop, objectId) => {
    try {
      console.log("🔍 IPC: getGoogleDriveBackups chamado para:", { shop, objectId });
      const backups = await backupManager.getGameGoogleDriveBackups(shop, objectId);
      console.log("🔍 IPC: getGoogleDriveBackups resultado:", backups);
      return backups;
    } catch (error) {
      console.error("Erro ao obter backups do Google Drive:", error);
      return [];
    }
  });
  ipcMain.handle("sync-backup-counts", async () => {
    try {
      console.log("🔍 IPC: syncBackupCounts chamado");
      await backupManager.syncBackupCounts();
      console.log("🔍 IPC: syncBackupCounts concluído");
    } catch (error) {
      console.error("Erro ao sincronizar contagens de backup:", error);
      throw error;
    }
  });
  ipcMain.handle("get-config", () => backupManager.getConfig());
  ipcMain.handle("update-config", (_, config) => {
    backupManager.updateConfig(config);
  });
  ipcMain.handle("is-packaged", () => app.isPackaged);
  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    return result.filePaths[0];
  });
  ipcMain.handle("select-credentials-with-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "JSON", extensions: ["json"] }
      ]
    });
    if (result.canceled) {
      return null;
    }
    const filePath = result.filePaths[0];
    const content = fs$1.readFileSync(filePath, "utf-8");
    return {
      credentials: JSON.parse(content),
      path: filePath
    };
  });
  ipcMain.handle("select-credentials-path", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "JSON", extensions: ["json"] }
      ]
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle("open-external-url", (_, url) => {
    shell.openExternal(url);
  });
  ipcMain.handle("check-ludusavi", () => Ludusavi.isBinaryAvailable());
  ipcMain.handle("get-ludusavi-path", () => Ludusavi.getBinaryPath());
  ipcMain.handle("get-ludusavi-game-folder-name", async (_, gameName) => {
    return await getNormalizedLudusaviGameFolderName(gameName);
  });
  ipcMain.handle("ludusavi-restore", async (_, gameName, backupPath) => {
    const ludusaviPath = Ludusavi.getBinaryPath();
    const configPath = Ludusavi.getBinaryPath().replace(/ludusavi(\.exe)?$/, "");
    let command = `"${ludusaviPath}" --config "${configPath}" restore "${gameName}" --path "${backupPath}" --force`;
    return new Promise((resolve2, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error with config: ${error}`);
          console.warn("Ludusavi restore with config failed, trying without config");
          const fallbackCommand = `"${ludusaviPath}" restore "${gameName}" --path "${backupPath}" --force`;
          exec(fallbackCommand, (error2, stdout2, stderr2) => {
            if (error2) {
              console.error(`exec error without config: ${error2}`);
              return reject(error2);
            }
            console.log(`stdout without config: ${stdout2}`);
            console.error(`stderr without config: ${stderr2}`);
            resolve2(stdout2);
          });
        } else {
          console.log(`stdout with config: ${stdout}`);
          console.error(`stderr with config: ${stderr}`);
          resolve2(stdout);
        }
      });
    });
  });
  ipcMain.handle("minimize-window", () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.minimize();
    }
  });
  ipcMain.handle("maximize-window", () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      if (focusedWindow.isMaximized()) {
        focusedWindow.unmaximize();
      } else {
        focusedWindow.maximize();
      }
    }
  });
  ipcMain.handle("close-window", () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.close();
    }
  });
}
