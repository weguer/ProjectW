import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import type { GameShop, LocalSaveBackup, UnlockedAchievement, LocalSaveManagerConfig } from "@types";
import { app } from "electron";
import { Ludusavi } from "./ludusavi";

export class LocalSaveManager {
  private config: LocalSaveManagerConfig;

  constructor(config: LocalSaveManagerConfig) {
    this.config = config;
  }

  private async cleanupTempFolder(): Promise<void> {
    const tempRoot = path.join(process.cwd(), "temp");
    try {
      if (fs.existsSync(tempRoot)) {
        await fs.promises.rm(tempRoot, { recursive: true, force: true });
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
  private normalizeGameName(gameName: string): string {
    return gameName
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .trim() || 'Unknown_Game'; // Ensure we have a valid name
  }

  public getBackupLabel(automatic: boolean = false): string {
    const date = new Date().toLocaleDateString("pt-BR");
    return automatic ? `Backup automático de ${date}` : `Backup de ${date}`;
  }

  private async bundleBackup(
    shop: GameShop,
    objectId: string,
    winePrefix: string | null,
    backupPath: string
  ): Promise<string> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    const gameBackupPath = path.join(backupPath, `${shop}-${normalizedObjectId}`);

    // Remove existing backup
    if (fs.existsSync(gameBackupPath)) {
      try {
        await fs.promises.rm(gameBackupPath, { recursive: true });
      } catch (error) {
        console.error("Failed to remove backup path", { gameBackupPath, error });
      }
    }

    // Use local Ludusavi for backup
    await this.runLocalLudusaviBackup(shop, objectId, gameBackupPath, winePrefix);

    // Return the directory path instead of tar file
    return gameBackupPath;
  }

  private async runLocalLudusaviBackup(
    shop: GameShop,
    objectId: string,
    backupPath: string,
    winePrefix: string | null
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const resourcesRoot = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path.join(ludusaviRoot, binaryName);
      const configPath = ludusaviRoot;

      const configFilePath = path.join(configPath, 'config.yaml');
      const args = [
        "--config", configFilePath,
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

      const { spawn } = require("child_process");
      const ludusaviProcess = spawn(ludusaviPath, args);

      let stdout = "";
      let stderr = "";

      ludusaviProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      ludusaviProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      ludusaviProcess.on("close", (code: number) => {
        console.log(`Ludusavi backup stdout: ${stdout}`);
        if (stderr) {
          console.error(`Ludusavi backup stderr: ${stderr}`);
        }

        if (code === 0) {
          resolve();
        } else {
          // Fallback to default ludusavi command without config
          console.warn('Ludusavi backup with config failed, trying without config');
          this.runLocalLudusaviBackupFallback(objectId, backupPath, winePrefix)
            .then(resolve)
            .catch(reject);
        }
      });

      ludusaviProcess.on("error", (error: Error) => {
        console.error(`Ludusavi backup error: ${error.message}`);
        // Fallback to default ludusavi command without config
        console.warn('Ludusavi backup error, trying without config');
        this.runLocalLudusaviBackupFallback(objectId, backupPath, winePrefix)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Fallback method for Ludusavi backup without config
   */
  private async runLocalLudusaviBackupFallback(
    objectId: string,
    backupPath: string,
    winePrefix: string | null
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const resourcesRoot = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path.join(ludusaviRoot, binaryName);

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

      const { spawn } = require("child_process");
      const ludusaviProcess = spawn(ludusaviPath, args);

      let stdout = "";
      let stderr = "";

      ludusaviProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      ludusaviProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      ludusaviProcess.on("close", (code: number) => {
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

      ludusaviProcess.on("error", (error: Error) => {
        console.error(`Ludusavi backup fallback error: ${error.message}`);
        reject(error);
      });
    });
  }

  private async runLocalLudusaviRestore(
    shop: GameShop,
    objectId: string,
    backupPath: string,
    winePrefix: string | null
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const resourcesRoot = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path.join(ludusaviRoot, binaryName);
      const configPath = ludusaviRoot;
      
      // Ensure configPath is absolute
      const absoluteConfigPath = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);

      // Check if Ludusavi executable exists
      console.log("🔄 Checking if Ludusavi exists at:", ludusaviPath);
      if (!fs.existsSync(ludusaviPath)) {
        console.error("❌ Ludusavi executable not found at:", ludusaviPath);
        reject(new Error(`Ludusavi executable not found at: ${ludusaviPath}`));
        return;
      }
      console.log("✅ Ludusavi executable found");

      // Check if backup path exists
      console.log("🔄 Checking if backup path exists:", backupPath);
      if (!fs.existsSync(backupPath)) {
        console.error("❌ Backup path not found:", backupPath);
        reject(new Error(`Backup path not found: ${backupPath}`));
        return;
      }
      console.log("✅ Backup path exists");

      const configFilePath = path.join(absoluteConfigPath, 'config.yaml');
      const args = [
        "--config", configFilePath,
        "restore",
        objectId,
        "--path", backupPath,
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

      const { spawn } = require("child_process");
      const ludusaviProcess = spawn(ludusaviPath, args);

      let stdout = "";
      let stderr = "";

      ludusaviProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      ludusaviProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      ludusaviProcess.on("close", (code: number) => {
        console.log("🔄 Ludusavi restore completed with code:", code);
        console.log("🔄 Ludusavi restore stdout:", stdout);
        if (stderr) {
          console.error("🔄 Ludusavi restore stderr:", stderr);
        }
        
        if (code === 0) {
          console.log("✅ Ludusavi restore completed successfully");
          resolve();
        } else {
          // Fallback to default ludusavi command without config
          console.warn('Ludusavi restore with config failed, trying without config');
          this.runLocalLudusaviRestoreFallback(objectId, backupPath, winePrefix)
            .then(resolve)
            .catch(reject);
        }
      });

      ludusaviProcess.on("error", (error: Error) => {
        console.error(`Ludusavi restore error: ${error.message}`);
        // Fallback to default ludusavi command without config
        console.warn('Ludusavi restore error, trying without config');
        this.runLocalLudusaviRestoreFallback(objectId, backupPath, winePrefix)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Fallback method for Ludusavi restore without config
   */
  private async runLocalLudusaviRestoreFallback(
    objectId: string,
    backupPath: string,
    winePrefix: string | null
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const resourcesRoot = app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "..");
      const ludusaviRoot = this.config.ludusaviConfigPath || path.join(resourcesRoot, "ludusavi");
      const binaryName = process.platform === "win32" ? "ludusavi.exe" : "ludusavi";
      const ludusaviPath = this.config.ludusaviPath || path.join(ludusaviRoot, binaryName);

      // Check if Ludusavi executable exists
      console.log("🔄 Checking if Ludusavi exists at (fallback):", ludusaviPath);
      if (!fs.existsSync(ludusaviPath)) {
        console.error("❌ Ludusavi executable not found at (fallback):", ludusaviPath);
        reject(new Error(`Ludusavi executable not found at: ${ludusaviPath}`));
        return;
      }
      console.log("✅ Ludusavi executable found (fallback)");

      // Check if backup path exists
      console.log("🔄 Checking if backup path exists (fallback):", backupPath);
      if (!fs.existsSync(backupPath)) {
        console.error("❌ Backup path not found (fallback):", backupPath);
        reject(new Error(`Backup path not found: ${backupPath}`));
        return;
      }
      console.log("✅ Backup path exists (fallback)");

      const args = [
        "restore",
        objectId,
        "--path", backupPath,
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

      const { spawn } = require("child_process");
      const ludusaviProcess = spawn(ludusaviPath, args);

      let stdout = "";
      let stderr = "";

      ludusaviProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      ludusaviProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      ludusaviProcess.on("close", (code: number) => {
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

      ludusaviProcess.on("error", (error: Error) => {
        console.error(`Ludusavi restore fallback error: ${error.message}`);
        reject(error);
      });
    });
  }

  public async createLocalBackup(
    objectId: string,
    shop: GameShop,
    downloadOptionTitle: string | null,
    label?: string,
    achievements?: UnlockedAchievement[]
  ): Promise<LocalSaveBackup> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupId = crypto.randomUUID();
    const backupPath = path.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
    fs.mkdirSync(backupPath, { recursive: true });

    const bundleLocation = await this.bundleBackup(
      shop,
      objectId, // Use original objectId for Ludusavi commands
      null, // winePrefix - can be passed as parameter if needed
      backupPath
    );

    // Save achievements if provided
    if (achievements && achievements.length > 0) {
      await fs.promises.writeFile(
        path.join(backupPath, "achievements.json"),
        JSON.stringify(achievements)
      );
    }

    // Calculate total size of the backup directory
    const backupSize = await this.getDirectorySize(bundleLocation);

    // Garantir que o label seja sempre preenchido corretamente
    const backupLabel = label ?? this.getBackupLabel(false);
    
    const newBackup: LocalSaveBackup = {
      id: backupId,
      label: backupLabel && backupLabel !== "null" && backupLabel !== "undefined" ? backupLabel : this.getBackupLabel(false),
      createdAt: new Date().toISOString(),
      downloadOptionTitle,
      artifactLengthInBytes: backupSize,
      hostname: "local",
    };

    // Salvar o metadata.json no diretório do backup
    const metadataPath = path.join(backupPath, "metadata.json");
    await fs.promises.writeFile(metadataPath, JSON.stringify(newBackup, null, 2));

    // Best-effort cleanup of ./temp after backup concludes
    await this.cleanupTempFolder();

    return newBackup;
  }

  public async createEphemeralBackup(
    objectId: string,
    shop: GameShop,
    _downloadOptionTitle: string | null,
    _label?: string
  ): Promise<{ backupId: string; backupPath: string }> {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cloud-save-ephemeral-"));
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupId = crypto.randomUUID();
    const backupPath = path.join(tempRoot, `${shop}-${normalizedObjectId}`, backupId);
    fs.mkdirSync(backupPath, { recursive: true });

    const bundleLocation = await this.bundleBackup(
      shop,
      objectId, // Use original objectId for Ludusavi commands
      null,
      backupPath
    );

    // Return the exact directory that contains game files: <temp>/<shop-objectId>/<backupId>/<shop-objectId>
    // This is the directory that contains the actual game save files
    return { backupId, backupPath: bundleLocation };
  }

  public async restoreLocalBackup(
    shop: GameShop, 
    objectId: string, 
    backupId: string,
    winePrefix?: string | null,
    customLocalSavesPath?: string
  ): Promise<UnlockedAchievement[]> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    
    // Determine the backup path based on whether it's a custom path (Google Drive) or local
    let backupPath: string;
    let gameBackupPath: string;
    
    if (customLocalSavesPath) {
      // For Google Drive backups, the backup is extracted directly to customLocalSavesPath
      backupPath = customLocalSavesPath;
      // Look for the game folder directly in the extracted path
      gameBackupPath = path.join(backupPath, `${shop}-${normalizedObjectId}`);
      
      // If normalized name doesn't exist, try with original name for backward compatibility
      if (!fs.existsSync(gameBackupPath)) {
        gameBackupPath = path.join(backupPath, `${shop}-${objectId}`);
      }
      
      // For Google Drive backups, also check if the backupId subdirectory exists
      const backupIdPath = path.join(backupPath, backupId);
      if (fs.existsSync(backupIdPath)) {
        // If backupId subdirectory exists, look for the game folder inside it
        const gameBackupPathInBackupId = path.join(backupIdPath, `${shop}-${normalizedObjectId}`);
        if (fs.existsSync(gameBackupPathInBackupId)) {
          gameBackupPath = gameBackupPathInBackupId;
        } else {
          // Try with original name for backward compatibility
          const gameBackupPathInBackupIdOriginal = path.join(backupIdPath, `${shop}-${objectId}`);
          if (fs.existsSync(gameBackupPathInBackupIdOriginal)) {
            gameBackupPath = gameBackupPathInBackupIdOriginal;
          }
        }
      }
      
      // Additional check for CloudSaves structure created by Google Drive download
      const cloudSavesPath = path.join(backupPath, "CloudSaves");
      if (fs.existsSync(cloudSavesPath)) {
        const gameFolderInCloudSaves = path.join(cloudSavesPath, `${shop}-${normalizedObjectId}`);
        if (fs.existsSync(gameFolderInCloudSaves)) {
          // Look for backupId folder inside game folder
          const backupFolderInGame = path.join(gameFolderInCloudSaves, backupId);
          if (fs.existsSync(backupFolderInGame)) {
            // Look for game folder inside backup folder
            const gameBackupPathInCloudStructure = path.join(backupFolderInGame, `${shop}-${normalizedObjectId}`);
            if (fs.existsSync(gameBackupPathInCloudStructure)) {
              gameBackupPath = gameBackupPathInCloudStructure;
            } else {
              // Try with original name for backward compatibility
              const gameBackupPathOriginal = path.join(backupFolderInGame, `${shop}-${objectId}`);
              if (fs.existsSync(gameBackupPathOriginal)) {
                gameBackupPath = gameBackupPathOriginal;
              }
            }
          } else {
            // If backupId folder doesn't exist, try to find game folder directly in game folder
            if (fs.existsSync(gameFolderInCloudSaves)) {
              const gameBackupPathInCloudStructure = path.join(gameFolderInCloudSaves, `${shop}-${normalizedObjectId}`);
              if (fs.existsSync(gameBackupPathInCloudStructure)) {
                gameBackupPath = gameBackupPathInCloudStructure;
              } else {
                // Try with original name for backward compatibility
                const gameBackupPathOriginal = path.join(gameFolderInCloudSaves, `${shop}-${objectId}`);
                if (fs.existsSync(gameBackupPathOriginal)) {
                  gameBackupPath = gameBackupPathOriginal;
                }
              }
            }
          }
        }
      }
    } else {
      // For local backups, use the standard path structure
      const localSavesPath = this.config.localSavesPath;
      backupPath = path.join(localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);
      // For local backups, the game folder is inside the backup directory
      gameBackupPath = path.join(backupPath, `${shop}-${normalizedObjectId}`);
    }
    
    console.log("🔄 RestoreLocalBackup - backupPath:", backupPath);
    console.log("🔄 RestoreLocalBackup - gameBackupPath:", gameBackupPath);
    console.log("🔄 RestoreLocalBackup - customLocalSavesPath:", customLocalSavesPath);

    // Check if backup directory exists
    console.log("🔄 Checking if backup directory exists:", backupPath);
    console.log("🔄 Backup directory exists:", fs.existsSync(backupPath));
    
    if (!fs.existsSync(backupPath)) {
      console.error("❌ Backup directory not found:", backupPath);
      throw new Error(`Backup directory not found: ${backupPath}`);
    }

    // Check if there's a Ludusavi backup directory
    console.log("🔄 RestoreLocalBackup - gameBackupPath exists:", fs.existsSync(gameBackupPath));
    
    if (fs.existsSync(gameBackupPath)) {
      console.log("✅ Ludusavi backup directory found, starting restore...");
      console.log("🔄 RestoreLocalBackup - Contents of gameBackupPath:");
      try {
        const gameContents = await fs.promises.readdir(gameBackupPath);
        console.log("📁 Game backup contents:", gameContents);
      } catch (error) {
        console.error("❌ Error reading gameBackupPath contents:", error);
      }
      
      await this.runLocalLudusaviRestore(shop, objectId, gameBackupPath, winePrefix ?? null);
    } else {
      console.error("❌ Ludusavi backup directory not found:", gameBackupPath);
      // List contents of backupPath for debugging
      try {
        const contents = await fs.promises.readdir(backupPath);
        console.log("📁 Contents of backupPath:", contents);
        
        // Also check if backupPath exists
        console.log("📁 backupPath exists:", fs.existsSync(backupPath));
      } catch (error) {
        console.error("❌ Error reading backupPath contents:", error);
      }
      throw new Error(`Ludusavi backup directory not found: ${gameBackupPath}`);
    }

    // Best-effort cleanup of ./temp after restore concludes
    await this.cleanupTempFolder();

    // Load achievements if they exist
    const achievementsPath = path.join(backupPath, "achievements.json");
    if (fs.existsSync(achievementsPath)) {
      const unlockedAchievements: UnlockedAchievement[] = JSON.parse(await fs.promises.readFile(achievementsPath, "utf-8"));
      return unlockedAchievements;
    }

    return [];
  }

  public async deleteLocalBackup(shop: GameShop, objectId: string, backupId: string): Promise<void> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupToDeletePath = path.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`, backupId);

    if (fs.existsSync(backupToDeletePath)) {
      await fs.promises.rm(backupToDeletePath, { recursive: true, force: true });
    }
  }

  public async getLocalBackups(shop: GameShop, objectId: string): Promise<LocalSaveBackup[]> {
    // Normalize the objectId to avoid invalid characters in folder names
    const normalizedObjectId = this.normalizeGameName(objectId);
    const backupPath = path.join(this.config.localSavesPath, "CloudSaves", `${shop}-${normalizedObjectId}`);
    
    console.log('getLocalBackups: Iniciando busca de backups para:', { shop, objectId });
    console.log('getLocalBackups: Caminho dos backups:', backupPath);
    
    if (!fs.existsSync(backupPath)) {
      console.log('getLocalBackups: Caminho de backups não encontrado');
      return [];
    }

    const backupDirs = fs.readdirSync(backupPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    console.log('getLocalBackups: Diretórios encontrados:', backupDirs);

    const backups: LocalSaveBackup[] = [];
    for (const backupId of backupDirs) {
      const backupDirPath = path.join(backupPath, backupId);
      console.log('getLocalBackups: Verificando backupPath:', backupDirPath);
      
      if (!fs.existsSync(backupDirPath)) {
        console.log('getLocalBackups: backupPath não encontrado');
        continue;
      }

      // Verificar se o backup está marcado como "apenas nuvem"
      const cloudOnlyMarkerPath = path.join(backupDirPath, ".cloud-only");
      if (fs.existsSync(cloudOnlyMarkerPath)) {
        console.log('getLocalBackups: Backup marcado como apenas nuvem, ignorando:', backupId);
        continue;
      }

      const metadataPath = path.join(backupDirPath, "metadata.json");
      console.log('getLocalBackups: Verificando metadataPath:', metadataPath);
      
      // Verificar se o metadata.json existe
      if (!fs.existsSync(metadataPath)) {
        console.log('getLocalBackups: metadata.json não encontrado, criando metadata');
        // Se não existir, criar metadata a partir da estrutura de diretórios
        const gameBackupPath = path.join(backupDirPath, `${shop}-${normalizedObjectId}`);
        console.log('getLocalBackups: Verificando gameBackupPath:', gameBackupPath);
        
        if (fs.existsSync(gameBackupPath)) {
          console.log('getLocalBackups: gameBackupPath encontrado, criando metadata');
          // Criar metadata.json com informações básicas
          const stats = fs.statSync(gameBackupPath);
          
          // Criar um label amigável com base na data do backup
          const backupDate = new Date(stats.birthtime);
          const label = `Backup de ${backupDate.toLocaleDateString('pt-BR')} às ${backupDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
          
          // Calcular o tamanho do diretório com tratamento de erro
          let backupSize = 0;
          try {
            backupSize = await this.getDirectorySize(gameBackupPath);
          } catch (sizeError) {
            console.error('getLocalBackups: Erro ao calcular tamanho do backup:', sizeError);
            backupSize = 0;
          }
          
          const metadata = {
            id: backupId,
            label: label,
            createdAt: stats.birthtime.toISOString(),
            downloadOptionTitle: null,
            artifactLengthInBytes: backupSize,
            hostname: "local"
          };
          
          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } else {
          console.log('getLocalBackups: gameBackupPath não encontrado');
          continue;
        }
      }

      try {
        const metadataRaw = fs.readFileSync(metadataPath, "utf8");
        const metadata = JSON.parse(metadataRaw);
        
        // Garantir que o label seja preenchido mesmo que o metadata.json exista mas não tenha label
        let label = metadata.label;
        if (!label || label === "null" || label === "Backup sem nome" || label === "undefined") {
          const backupDate = new Date(metadata.createdAt);
          label = `Backup de ${backupDate.toLocaleDateString('pt-BR')} às ${backupDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        backups.push({
          id: metadata.id,
          label: label,
          createdAt: metadata.createdAt,
          downloadOptionTitle: metadata.downloadOptionTitle,
          artifactLengthInBytes: metadata.artifactLengthInBytes,
          hostname: metadata.hostname
        });
      } catch (error) {
        console.error('getLocalBackups: Erro ao ler metadata.json:', error);
      }
    }
    
    console.log('getLocalBackups: Backups encontrados:', backups.length);
    console.log('getLocalBackups: Backups detalhados:', JSON.stringify(backups, null, 2));
    
    return backups;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        totalSize += await this.getDirectorySize(filePath);
      } else {
        const stats = await fs.promises.stat(filePath);
        totalSize += stats.size;
      }
    }
    
    return totalSize;
  }
}