/**
 * Ludusavi Service
 * Wraps the Ludusavi CLI binary for game save detection and backup
 * Adapted to follow Hydra's approach
 */

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'
import * as fs from 'node:fs'
import YAML from 'yaml'
import type { LudusaviBackup, LudusaviConfig, GameShop } from '@types'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

export class Ludusavi {
  // Cache para evitar múltiplas chamadas
  private static _projectRoot: string | null = null
  private static _configPath: string | null = null
  private static _binaryPath: string | null = null
  private static _sessionTimestamp: string | null = null

  // Get project root directory (parent of out folder in dev, or app path in production)
  private static getProjectRoot(): string {
    if (this._projectRoot) return this._projectRoot
    
    if (app.isPackaged) {
      this._projectRoot = process.resourcesPath
    } else {
      // In development, the project root is the parent of the current directory
      // We need to go up from src/main to the project root
      this._projectRoot = path.join(__dirname, '..', '..')
    }
    return this._projectRoot
  }

  // Getters para paths
  private static get configPath(): string {
    if (!this._configPath) {
      this._configPath = path.join(this.getProjectRoot(), 'ludusavi')
    }
    return this._configPath
  }

  private static get binaryName(): string {
    return process.platform === 'win32' ? 'ludusavi.exe' : 'ludusavi'
  }

  private static get binaryPath(): string {
    if (!this._binaryPath) {
      this._binaryPath = path.join(this.configPath, this.binaryName)
    }
    return this._binaryPath
  }

  private static get ludusaviResourcesPath(): string {
    // In development, ludusavi folder is in the project root
    // In production, it's in resources
    return path.join(this.getProjectRoot(), 'ludusavi')
  }

  /**
   * Get or create session timestamp (created once per app session)
   */
  private static getOrCreateSessionTimestamp(): string {
    if (!this._sessionTimestamp) {
      const now = new Date()
      this._sessionTimestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`
    }
    return this._sessionTimestamp
  }

  /**
   * Reset session timestamp (should be called when app starts)
   */
  public static resetSessionTimestamp(): void {
    this._sessionTimestamp = null
  }

  /**
   * Initialize Ludusavi - copy config and binary to user data
   */
  public static async initialize(): Promise<void> {
    await this.copyConfigFileToUserData()
    await this.copyBinaryToUserData()
  }

  /**
   * Get Ludusavi configuration
   */
  public static async getConfig(): Promise<LudusaviConfig> {
    const configFile = path.join(this.configPath, 'config.yaml')
    const content = await fs.promises.readFile(configFile, 'utf-8')
    return YAML.parse(content) as LudusaviConfig
  }

  /**
   * Copy config file to user data directory
   */
  private static async copyConfigFileToUserData(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      await fs.promises.mkdir(this.configPath, { recursive: true })

      const sourceConfig = path.join(this.ludusaviResourcesPath, 'config.yaml')
      const destConfig = path.join(this.configPath, 'config.yaml')

      if (fs.existsSync(sourceConfig)) {
        await fs.promises.copyFile(sourceConfig, destConfig)
      } else {
        // Create default config if source doesn't exist
        const defaultConfig: LudusaviConfig = {
          manifest: {
            enable: false,
            secondary: [
              {
                url: 'https://cdn.losbroxas.org/manifest.yaml',
                enable: true
              }
            ]
          },
          customGames: []
        }
        await fs.promises.writeFile(destConfig, YAML.stringify(defaultConfig))
      }
    }
  }

  /**
   * Copy Ludusavi binary to user data directory
   */
  private static async copyBinaryToUserData(): Promise<void> {
    console.log('Looking for binary at:', this.binaryPath)
    console.log('Project root:', this.getProjectRoot())
    console.log('Config path:', this.configPath)
    console.log('app.getAppPath():', app.getAppPath())
    
    if (!fs.existsSync(this.binaryPath)) {
      const sourceBinary = path.join(this.ludusaviResourcesPath, this.binaryName)
      console.log('Source binary:', sourceBinary)

      if (fs.existsSync(sourceBinary)) {
        await fs.promises.copyFile(sourceBinary, this.binaryPath)

        // Make executable on Unix systems
        if (process.platform !== 'win32') {
          await fs.promises.chmod(this.binaryPath, 0o755)
        }
      } else {
        // Verificar se o binário existe em outros locais possíveis
        const alternativePaths = [
          path.join(this.getProjectRoot(), 'ludusavi', this.binaryName),
          path.join(process.resourcesPath || '', 'ludusavi', this.binaryName),
          path.join(__dirname, '..', '..', 'ludusavi', this.binaryName)
        ];
        
        let foundBinary = false;
        for (const altPath of alternativePaths) {
          if (fs.existsSync(altPath)) {
            console.log('Found binary at alternative path:', altPath);
            await fs.promises.copyFile(altPath, this.binaryPath);
            
            // Make executable on Unix systems
            if (process.platform !== 'win32') {
              await fs.promises.chmod(this.binaryPath, 0o755)
            }
            
            foundBinary = true;
            break;
          }
        }
        
        if (!foundBinary) {
          console.warn(
            `Ludusavi binary not found at ${sourceBinary}. ` +
              `Please download from https://github.com/mtkennerly/ludusavi/releases ` +
              `and place in ${this.configPath}`
          )
        }
      }
    }
  }

  /**
   * Backup a game using Ludusavi (Hydra approach)
   */
  public static async backupGame(
    shop: GameShop,
    objectId: string,
    backupPath?: string | null,
    winePrefix?: string | null,
    preview?: boolean
  ): Promise<LudusaviBackup> {
    return new Promise((resolve, reject) => {
      const configFilePath = path.join(this.configPath, 'config.yaml');
      const args = [
        "--config",
        configFilePath,
        "backup",
        objectId,
        "--api",
        "--force",
      ];

      if (preview) args.push("--preview");
      if (backupPath) args.push("--path", backupPath);
      if (winePrefix) args.push("--wine-prefix", winePrefix);

      execFile(
        this.binaryPath,
        args,
        (err: any, stdout: string) => {
          if (err) {
            // Fallback to default ludusavi command without config
            console.warn('Ludusavi command with config failed, trying without config:', err);
            const defaultArgs = ["backup", objectId, "--api", "--force"];
            if (preview) defaultArgs.push("--preview");
            if (backupPath) defaultArgs.push("--path", backupPath);
            if (winePrefix) defaultArgs.push("--wine-prefix", winePrefix);
            
            execFile(
              this.binaryPath,
              defaultArgs,
              (err2: any, stdout2: string) => {
                if (err2) {
                  return reject(err2);
                }
                return resolve(JSON.parse(stdout2) as LudusaviBackup);
              }
            );
          } else {
            return resolve(JSON.parse(stdout) as LudusaviBackup);
          }
        }
      );
    });
  }

  /**
   * Get backup preview for a game (detect saves without backing up)
   */
  public static async getBackupPreview(
    shop: GameShop,
    objectId: string,
    winePrefix?: string | null
  ): Promise<LudusaviBackup | null> {
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
      customBackupPath: customGame?.files[0] || null,
    } as LudusaviBackup;
  }

  /**
   * Find installed games using Ludusavi's backup preview (without game names)
   * This scans ALL games in the manifest and returns which ones have saves
   */
  public static async findInstalledGames(): Promise<string[]> {
    const args = ['backup', '--preview', '--api']

    try {
      const { stdout } = await execFileAsync(this.binaryPath, args)
      const result = JSON.parse(stdout) as LudusaviBackup
      
      // Return games that have files detected
      const foundGames: string[] = []
      if (result.games) {
        for (const [gameName, gameData] of Object.entries(result.games)) {
          if (gameData.files && Object.keys(gameData.files).length > 0) {
            foundGames.push(gameName)
          }
        }
      }
      
      return foundGames
    } catch (error: any) {
      console.error('Ludusavi find failed:', error)
      return []
    }
  }

  /**
   * Get backup preview for ALL games (scan entire system)
   * @returns LudusaviBackup object with all games that have saves
   */
  public static async getAllGamesPreview(
    onProgress?: (progress: number) => void
  ): Promise<LudusaviBackup> {
    const configFilePath = path.join(this.configPath, 'config.yaml');
    const args = ['--config', configFilePath, 'backup', '--preview', '--api'];

    console.log('📋 Executando Ludusavi:', args.join(' '))
    console.log('🔧 Binário:', this.binaryPath)

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'], // Não conecta stdin, apenas stdout/stderr
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;
      let currentProgress = 10;

      // Simula progresso enquanto escaneia (10% -> 90%)
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          onProgress?.(currentProgress);
        }
      }, 200); // Atualiza a cada 200ms

      // Timeout de segurança (2 minutos)
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.error('❌ Timeout ao executar Ludusavi');
          clearInterval(progressInterval);
          child.kill();
          // Fallback to default ludusavi command without config
          console.warn('Ludusavi command with config timed out, trying without config');
          this.getAllGamesPreviewFallback(onProgress)
            .then(resolve)
            .catch(reject);
          isResolved = true;
        }
      }, 120000);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        
        onProgress?.(95);
        console.log('✅ Ludusavi completou com code:', code);

        if (stderr) {
          console.warn('⚠️ Stderr:', stderr);
        }

        console.log('📤 Output length:', stdout.length, 'bytes');

        if (code !== 0 && code !== null) {
          console.error('❌ Ludusavi falhou com code:', code);
          // Fallback to default ludusavi command without config
          console.warn('Ludusavi command with config failed, trying without config');
          this.getAllGamesPreviewFallback(onProgress)
            .then(resolve)
            .catch(reject);
          return;
        }

        try {
          const result = JSON.parse(stdout) as LudusaviBackup;
          const totalGames = Object.keys(result.games || {}).length;
          console.log('🎮 Total de jogos encontrados:', totalGames);
          resolve(result);
        } catch (parseError: any) {
          console.error('❌ Erro ao parsear JSON:', parseError.message);
          console.log('📝 Output:', stdout.substring(0, 500));
          // Fallback to default ludusavi command without config
          console.warn('Ludusavi JSON parse failed, trying without config');
          this.getAllGamesPreviewFallback(onProgress)
            .then(resolve)
            .catch(reject);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        
        console.error('❌ Erro ao executar Ludusavi:', error);
        // Fallback to default ludusavi command without config
        console.warn('Ludusavi command with config error, trying without config');
        this.getAllGamesPreviewFallback(onProgress)
          .then(resolve)
          .catch(reject);
      });
      
      // Expor método para cancelar
      ;(child as any).cancel = () => {
        if (!isResolved) {
          console.log('🛑 Scan cancelado pelo usuário');
          clearTimeout(timeout);
          clearInterval(progressInterval);
          child.kill();
          isResolved = true;
          reject(new Error('Scan cancelled by user'));
        }
      }
    });
  }

  /**
   * Fallback method for getAllGamesPreview without config
   */
  private static async getAllGamesPreviewFallback(
    onProgress?: (progress: number) => void
  ): Promise<LudusaviBackup> {
    const args = ['backup', '--preview', '--api'];

    console.log('📋 Executando Ludusavi fallback (sem config):', args.join(' '))
    console.log('🔧 Binário:', this.binaryPath)

    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;
      let currentProgress = 10;

      // Simula progresso enquanto escaneia (10% -> 90%)
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += 2;
          onProgress?.(currentProgress);
        }
      }, 200);

      // Timeout de segurança (2 minutos)
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.error('❌ Timeout ao executar Ludusavi fallback');
          clearInterval(progressInterval);
          child.kill();
          reject(new Error('Ludusavi fallback timeout after 2 minutes'));
          isResolved = true;
        }
      }, 120000);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        
        onProgress?.(95);
        console.log('✅ Ludusavi fallback completou com code:', code);

        if (stderr) {
          console.warn('⚠️ Stderr:', stderr);
        }

        console.log('📤 Output length:', stdout.length, 'bytes');

        if (code !== 0 && code !== null) {
          console.error('❌ Ludusavi fallback falhou com code:', code);
          reject(new Error(`Ludusavi fallback exited with code ${code}`));
          return;
        }

        try {
          const result = JSON.parse(stdout) as LudusaviBackup;
          const totalGames = Object.keys(result.games || {}).length;
          console.log('🎮 Total de jogos encontrados (fallback):', totalGames);
          resolve(result);
        } catch (parseError: any) {
          console.error('❌ Erro ao parsear JSON (fallback):', parseError.message);
          console.log('📝 Output:', stdout.substring(0, 500));
          reject(new Error('Failed to parse Ludusavi fallback output'));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        if (isResolved) return;
        isResolved = true;
        
        console.error('❌ Erro ao executar Ludusavi fallback:', error);
        reject(error);
      });
    });
  }

  /**
   * Add a custom game with manual save path
   */
  public static async addCustomGame(gameName: string, savePath: string | null): Promise<void> {
    const config = await this.getConfig()

    // Remove existing game with same name
    config.customGames = config.customGames.filter((game) => game.name !== gameName)

    // Add new game
    if (savePath) {
      config.customGames.push({
        name: gameName,
        files: [savePath],
        registry: []
      })
    }

    // Save config
    const configFile = path.join(this.configPath, 'config.yaml')
    await fs.promises.writeFile(configFile, YAML.stringify(config))
  }

  /**
   * Remove a custom game
   */
  public static async removeCustomGame(gameName: string): Promise<void> {
    const config = await this.getConfig()
    config.customGames = config.customGames.filter((game) => game.name !== gameName)

    const configFile = path.join(this.configPath, 'config.yaml')
    await fs.promises.writeFile(configFile, YAML.stringify(config))
  }

  /**
   * Check if Ludusavi binary exists
   */
  public static isBinaryAvailable(): boolean {
    const exists = fs.existsSync(this.binaryPath)
    console.log(`🔎 Verificando Ludusavi em: ${this.binaryPath}`)
    console.log(`✅ Binary exists: ${exists}`)
    return exists
  }

  /**
   * Get the path to the Ludusavi binary
   */
  public static getBinaryPath(): string {
    return this.binaryPath
  }
}