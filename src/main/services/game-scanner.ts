/**
 * Game Scanner Service
 * Scans for installed games and fetches their covers from SteamGridDB
 */

import { Ludusavi } from './ludusavi'
import axios from 'axios'

// SteamGridDB API Configuration
// Get your free API key at: https://www.steamgriddb.com/profile/preferences/api
const STEAMGRIDDB_API_KEY = '36e16a74d0bebdce424abc69d7a304c8' // Free tier key
const STEAMGRIDDB_BASE_URL = 'https://www.steamgriddb.com/api/v2'

export interface ScannedGame {
  name: string          // Nome para exibição (pode ser ID ou nome amigável)
  displayName?: string  // Nome amigável obtido da API
  gameId: string        // ID original do Ludusavi (Steam ID, GOG ID ou nome)
  platform?: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown'
  coverUrl?: string
  foundSaves: boolean
  savesCount: number
}

export class GameScanner {
  private static currentScanProcess: any = null

  /**
   * Update all existing games with new icons instead of covers
   */
  public static async updateAllGamesWithIcons(backupManager: any): Promise<void> {
    console.log('🔄 Iniciando atualização de ícones para todos os jogos...');
    
    // Get all games from backup manager
    const games = backupManager.getGames();
    console.log(`🎮 Encontrados ${games.length} jogos para atualizar`);
    
    for (const game of games) {
      try {
        console.log(`🔄 Atualizando jogo: ${game.name}`);
        
        // Only update games that have Steam IDs (numeric)
        if (game.gameId && /^\d+$/.test(game.gameId)) {
          console.log(`🔍 Buscando novo ícone para Steam ID: ${game.gameId}`);
          
          // Get new icon URL
          const gameInfo = await this.getGameInfo(game.gameId);
          
          if (gameInfo.coverUrl && gameInfo.coverUrl !== game.coverUrl) {
            console.log(`✅ Novo ícone encontrado para ${game.name}`);
            
            // Update game in backup manager
            const updatedGames = backupManager.getGames();
            const gameToUpdate = updatedGames.find((g: any) => g.id === game.id);
            if (gameToUpdate) {
              gameToUpdate.coverUrl = gameInfo.coverUrl;
              gameToUpdate.updatedAt = new Date();
              backupManager.store.set('games', updatedGames);
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
    
    console.log('✅ Atualização de ícones concluída');
  }

  /**
   * Scan for installed games using Ludusavi's backup preview command
   */
  public static async scanInstalledGames(
    onProgress?: (progress: number) => void
  ): Promise<ScannedGame[]> {
    try {
      console.log('🔍 Iniciando escaneamento de jogos instalados...')
      onProgress?.(10)
      
      // Use Ludusavi's backup --preview to scan all games at once
      console.log('📞 Chamando Ludusavi.getAllGamesPreview()...')
      const backupPreview = await Ludusavi.getAllGamesPreview((progress) => {
        // Progresso do Ludusavi: 10% -> 90%
        onProgress?.(progress)
      })
      console.log('📥 Resposta recebida do Ludusavi')
      onProgress?.(90)
      
      if (!backupPreview) {
        console.log('⚠️ Nenhum resultado do Ludusavi')
        return []
      }
      
      if (!backupPreview.games) {
        console.log('⚠️ Nenhum jogo na resposta do Ludusavi')
        console.log('📊 Overall stats:', backupPreview.overall)
        return []
      }
      
      const gameIds = Object.keys(backupPreview.games)
      console.log(`📦 Ludusavi encontrou ${gameIds.length} jogos com saves`)
      console.log('🎮 Lista de IDs:', gameIds.slice(0, 10).join(', '), gameIds.length > 10 ? '...' : '')
      onProgress?.(92)
      
      const scannedGames: ScannedGame[] = []

      // Limit to 150 games to avoid UI overload (increased from 50)
      const gamesToProcess = gameIds.slice(0, 150)
      console.log(`🎮 Processando ${gamesToProcess.length} jogos...`)

      // Process each game
      let processed = 0
      const totalGames = gamesToProcess.length
      
      for (const gameId of gamesToProcess) {
        try {
          const gameData = backupPreview.games[gameId]
          const fileCount = Object.keys(gameData.files || {}).length
          
          if (fileCount === 0) {
            console.log(`⏭️ Pulando ${gameId} (sem arquivos)`)
            continue
          }
          
          processed++
          // Progress from 92% to 99%
          const currentProgress = 92 + Math.floor((processed / totalGames) * 7)
          onProgress?.(currentProgress)
          
          console.log(`[${processed}/${gamesToProcess.length}] Processando: ${gameId}`)
          
          // Detecta a plataforma e obtém nome amigável
          const gameInfo = await this.getGameInfo(gameId)
          
          scannedGames.push({
            name: gameInfo.displayName || gameInfo.name,
            displayName: gameInfo.displayName,
            gameId: gameId,
            platform: gameInfo.platform,
            coverUrl: gameInfo.coverUrl,
            foundSaves: true,
            savesCount: fileCount
          })
          
          console.log(`✅ ${gameInfo.displayName || gameId} (${fileCount} arquivos)`)
        } catch (error) {
          console.error(`⚠️ Erro ao processar ${gameId}:`, error)
          continue
        }
      }

      onProgress?.(99)
      console.log(`✨ Escaneamento concluído: ${scannedGames.length} jogos processados`)
      onProgress?.(100)
      return scannedGames
    } catch (error: any) {
      console.error('❌ Falha ao escanear jogos:', error)
      console.error('❌ Stack trace:', error.stack)
      console.error('❌ Mensagem:', error.message)
      throw error
    }
  }

  /**
   * Cancel ongoing scan
   */
  public static cancelScan(): void {
    console.log('🛑 Tentando cancelar scan...')
    // Implementação será feita via IPC
  }

  /**
   * Get list of games from Ludusavi manifest
   */
  private static async getManifestGames(): Promise<string[]> {
    // Popular games that are likely to be installed
    return [
      'The Witcher 3',
      'Cyberpunk 2077',
      'Stardew Valley',
      'Terraria',
      'Minecraft',
      'Dark Souls III',
      'Elden Ring',
      'Skyrim',
      'Fallout 4',
      'GTA V',
      'Red Dead Redemption 2',
      'Hollow Knight',
      'Celeste',
      'Undertale',
      'Hades',
      'Dead Cells',
      'Binding of Isaac',
      'Don\'t Starve Together',
      'Subnautica',
      'No Man\'s Sky',
      'Monster Hunter World',
      'Final Fantasy XIV',
      'Divinity Original Sin 2',
      'Baldur\'s Gate 3',
      'Portal 2',
      'Half-Life 2',
      'Counter-Strike Global Offensive',
      'Dota 2',
      'League of Legends',
      'Valorant',
      'Apex Legends',
      'Fortnite',
      'Rocket League',
      'Among Us',
      'Fall Guys',
      'Valheim',
      'Project Zomboid',
      'RimWorld',
      'Factorio',
      'Satisfactory',
      'Deep Rock Galactic',
      'Left 4 Dead 2',
      'Payday 2',
      'Warframe',
      'Destiny 2',
      'Path of Exile',
      'Diablo III',
      'Borderlands 3',
      'Resident Evil Village'
    ]
  }

  /**
   * Get game information (name, platform, cover) from game ID
   * Suporta Steam ID, GOG ID ou nome direto
   */
  private static async getGameInfo(gameId: string): Promise<{
    name: string
    displayName?: string
    platform: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown'
    coverUrl?: string
  }> {
    // Detecta se é Steam ID (apenas números)
    if (/^\d+$/.test(gameId)) {
      try {
        console.log(`🔍 Buscando informações do Steam para ID: ${gameId}`)
        
        // Tenta múltiplas fontes para obter informações
        const steamInfo = await this.getSteamGameInfo(gameId)
        
        if (steamInfo) {
          console.log(`✅ Encontrado: ${steamInfo.name}`)
          return {
            name: gameId,
            displayName: steamInfo.name,
            platform: 'steam',
            coverUrl: steamInfo.coverUrl
          }
        }
      } catch (error) {
        console.warn(`⚠️ Não foi possível obter dados para Steam ID ${gameId}`)
      }
      
      // Se falhar, retorna com Steam ID mas sem nome
      return {
        name: gameId,
        platform: 'steam',
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${gameId}/header.jpg`
      }
    }
    
    // Se não é ID numérico, assume que é o nome do jogo
    // Tenta buscar informações mesmo assim
    const searchResult = await this.searchGameByName(gameId)
    
    if (searchResult) {
      return searchResult
    }
    
    return {
      name: gameId,
      displayName: gameId,
      platform: 'unknown',
      coverUrl: `https://via.placeholder.com/460x215/1e1e1e/4CAF50?text=${encodeURIComponent(gameId)}`
    }
  }

  /**
   * Busca informações do jogo na Steam API e ícone do SteamGridDB
   */
  private static async getSteamGameInfo(appId: string): Promise<{
    name: string
    coverUrl: string
  } | null> {
    try {
      // Primeira tentativa: Steam Store API para nome do jogo
      const response = await axios.get(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=brazilian`,
        { timeout: 5000 }
      )
      
      let gameName = `Steam Game ${appId}`
      
      if (response.data?.[appId]?.success && response.data[appId].data?.name) {
        gameName = response.data[appId].data.name
      }
      
      // Busca ícone no SteamGridDB
      const coverUrl = await this.getSteamGridDBIcon(appId, gameName)
      
      return {
        name: gameName,
        coverUrl: coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
      }
    } catch (error) {
      console.error(`Erro ao buscar na Steam API para ${appId}:`, error)
      // Fallback para Steam CDN
      return {
        name: `Steam Game ${appId}`,
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
      }
    }
  }

  /**
   * Busca ícones do jogo no SteamGridDB
   */
  private static async getSteamGridDBIcon(
    steamId: string,
    gameName?: string
  ): Promise<string | null> {
    try {
      console.log(`🎨 Buscando ícone no SteamGridDB para Steam ID: ${steamId}`)
      
      // Busca ícones para o jogo pelo Steam ID
      const response = await axios.get(
        `${STEAMGRIDDB_BASE_URL}/icons/steam/${steamId}`,
        {
          headers: {
            'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`
          },
          params: {
            types: 'static', // Apenas imagens estáticas
            nsfw: 'false',
            humor: 'false'
          },
          timeout: 5000
        }
      )
      
      if (response.data?.success && response.data.data?.length > 0) {
        // Retorna o primeiro ícone encontrado
        const icon = response.data.data[0]
        console.log(`✅ Ícone encontrado no SteamGridDB: ${icon.url}`)
        return icon.url
      }
      
      console.log(`⚠️ Nenhum ícone encontrado no SteamGridDB para ${steamId}`)
      return null
    } catch (error: any) {
      console.error(`❌ Erro ao buscar ícone no SteamGridDB:`, error.message)
      return null
    }
  }
  /**
   * Busca jogo por nome usando Steam API e SteamGridDB
   */
  private static async searchGameByName(gameName: string): Promise<{
    name: string
    displayName: string
    platform: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown'
    coverUrl?: string
  } | null> {
    try {
      console.log(`🔍 Buscando jogo por nome: ${gameName}`)
      
      // Primeiro, busca o jogo pelo nome no SteamGridDB
      const steamGridDBResult = await this.searchSteamGridDBByName(gameName)
      
      if (steamGridDBResult) {
        console.log(`✅ Encontrado no SteamGridDB: ${steamGridDBResult.displayName}`)
        return steamGridDBResult
      }
      
      // Fallback: Tenta buscar na Steam Search API
      const searchQuery = encodeURIComponent(gameName)
      const response = await axios.get(
        `https://store.steampowered.com/api/storesearch/?term=${searchQuery}&cc=br&l=brazilian`,
        { timeout: 5000 }
      )
      
      if (response.data?.items?.length > 0) {
        const firstResult = response.data.items[0]
        console.log(`✅ Encontrado na Steam: ${firstResult.name}`)
        
        // Tenta buscar ícone no SteamGridDB
        const coverUrl = await this.getSteamGridDBIcon(firstResult.id.toString(), firstResult.name)
        
        return {
          name: gameName,
          displayName: firstResult.name,
          platform: 'steam',
          coverUrl: coverUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${firstResult.id}/header.jpg`
        }
      }
      
      return null
    } catch (error) {
      console.error(`Erro ao buscar jogo ${gameName}:`, error)
      return null
    }
  }

  /**
   * Busca jogo por nome no SteamGridDB
   */
  private static async searchSteamGridDBByName(gameName: string): Promise<{
    name: string
    displayName: string
    platform: 'steam' | 'gog' | 'epic' | 'custom' | 'unknown'
    coverUrl?: string
  } | null> {
    try {
      console.log(`🔍 Buscando no SteamGridDB: ${gameName}`)
      
      // Busca o jogo pelo nome
      const searchResponse = await axios.get(
        `${STEAMGRIDDB_BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`,
        {
          headers: {
            'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`
          },
          timeout: 5000
        }
      )
      
      if (searchResponse.data?.success && searchResponse.data.data?.length > 0) {
        const firstGame = searchResponse.data.data[0]
        console.log(`🎮 Jogo encontrado: ${firstGame.name} (ID: ${firstGame.id})`)
        
        // Busca o ícone do jogo
        const iconsResponse = await axios.get(
          `${STEAMGRIDDB_BASE_URL}/icons/game/${firstGame.id}`,
          {
            headers: {
              'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`
            },
            params: {
              types: 'static',
              nsfw: 'false',
              humor: 'false'
            },
            timeout: 5000
          }
        )
        
        let coverUrl: string | undefined
        if (iconsResponse.data?.success && iconsResponse.data.data?.length > 0) {
          coverUrl = iconsResponse.data.data[0].url
          console.log(`🎨 Ícone encontrado: ${coverUrl}`)
        }
        
        return {
          name: gameName,
          displayName: firstGame.name,
          platform: 'steam', // SteamGridDB retorna principalmente jogos Steam
          coverUrl
        }
      }
      
      return null
    } catch (error: any) {
      console.error(`❌ Erro ao buscar no SteamGridDB:`, error.message)
      return null
    }
  }
}
