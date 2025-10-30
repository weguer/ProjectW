import { useState, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import './App.css'
import { Notifications } from './components/Notifications'
import CustomTitleBar from './components/CustomTitleBar'

// Declare API types
declare global {
  interface Window {
    api: any
  }
}

// Declare global functions
declare const prompt: (message: string) => string | null
declare const confirm: (message: string) => boolean

function App() {
  const [games, setGames] = useState<any[]>([])
  const [selectedGame, setSelectedGame] = useState<any>(null)
  const [backups, setBackups] = useState<any[]>([])
  const [ludusaviAvailable, setLudusaviAvailable] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scannedGames, setScannedGames] = useState<any[]>([])
  const [showScanResults, setShowScanResults] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [showBackupAllModal, setShowBackupAllModal] = useState(false)
  const [backupProgress, setBackupProgress] = useState(0)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [backupPath, setBackupPath] = useState('Selecione uma Pasta')
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, type: 'success' | 'error' | 'info' | 'warning' }>>([])
  const [currentBackupProcess, setCurrentBackupProcess] = useState<{cancel: () => void} | null>(null)
  const [isDriveAuthenticated, setIsDriveAuthenticated] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState(0)
  const [isRestoring, setIsRestoring] = useState(false)
  const [allBackups, setAllBackups] = useState<Array<{game: any, backups: any[]}>>([])
  const [loadingAllBackups, setLoadingAllBackups] = useState(false)
  const [showGoogleDriveFolderModal, setShowGoogleDriveFolderModal] = useState(false)
  const [googleDriveFolders, setGoogleDriveFolders] = useState<any[]>([])
  const [selectedGoogleDriveFolder, setSelectedGoogleDriveFolder] = useState<any>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [loadingFolders, setLoadingFolders] = useState(false)
  const [currentGoogleDrivePath, setCurrentGoogleDrivePath] = useState<Array<{id: string, name: string}>>([{id: 'root', name: 'Google Drive'}])
  const [googleDriveDefaultFolder, setGoogleDriveDefaultFolder] = useState<{id: string, name: string} | null>(null)
  const [isUpdatingIcons, setIsUpdatingIcons] = useState(false)
  const [gameToRemove, setGameToRemove] = useState<{id: string, name: string} | null>(null)
  const [showRemoveGameModal, setShowRemoveGameModal] = useState(false)
  const [backupToDelete, setBackupToDelete] = useState<{backupId: string, game: any} | null>(null)
  const [showDeleteBackupModal, setShowDeleteBackupModal] = useState(false)
  const [selectedScannedGames, setSelectedScannedGames] = useState<Set<string>>(new Set())
  const [showAboutModal, setShowAboutModal] = useState(false)
  const [isPackaged, setIsPackaged] = useState(false) // Novo estado para verificar modo de produção
  const [isLightTheme, setIsLightTheme] = useState(false) // Estado para controle do tema

  useEffect(() => {
    loadGames()
    checkLudusavi()
    loadConfig()
    checkDriveAuth()
    loadAllBackups()
    checkIfPackaged() // Verificar se está em modo de produção
    
    // Verificar o tema salvo no localStorage ou usar o tema escuro como padrão
    const savedTheme = localStorage.getItem('theme')
    const shouldUseLightTheme = savedTheme ? savedTheme === 'light' : false
    setIsLightTheme(shouldUseLightTheme)
    
    // Aplicar o tema ao body
    if (shouldUseLightTheme) {
      document.body.classList.add('light-theme')
    } else {
      document.body.classList.remove('light-theme')
    }
    
    // Listen for scan progress
    const cleanupScan = (window as any).api.onScanProgress((progress: number) => {
      setScanProgress(progress)
    })
    
    // Listen for backup progress  
    const cleanupBackup = (window as any).api.onBackupProgressSimple((progress: number) => {
      setBackupProgress(progress)
    })

    const cleanupGdrive = (window as any).api.onGdriveCode((code: string) => {
      if (code) {
        handleGdriveCode(code);
      }
    })
    
    return () => {
      cleanupScan()
      cleanupBackup()
      cleanupGdrive()
    }
  }, [])

  const checkIfPackaged = async () => {
    try {
      const packaged = await (window as any).api.isPackaged()
      setIsPackaged(packaged)
    } catch (error) {
      console.error('Erro ao verificar modo de produção:', error)
      setIsPackaged(false)
    }
  }

  const loadConfig = async () => {
    try {
      console.log('Carregando configuração...');
      const config = await (window as any).api.getConfig()
      console.log('Configuração carregada:', config);
      // Sempre mostrar "Backups" no campo de entrada, mas manter o caminho real
      setBackupPath('Backups')
      setBackupPath(config.backupPath || 'Selecione uma Pasta')
    } catch (error) {
      console.error('Erro ao carregar config:', error)
    }
  }

  const checkDriveAuth = async () => {
    try {
      console.log('Verificando autenticação do Google Drive...');
      // First check if Google Drive is enabled in config
      const config = await (window as any).api.getConfig()
      console.log('Configuração do Google Drive:', config.googleDrive);
      if (config.googleDrive.enabled) {
        const authenticated = await (window as any).api.gdriveCheckAuth()
        console.log('Autenticado no Google Drive:', authenticated);
        setIsDriveAuthenticated(authenticated)
        
        // Carregar pasta padrão do Google Drive se existir
        if (config.googleDrive.defaultFolderId && config.googleDrive.defaultFolderName) {
          console.log('Pasta padrão do Google Drive encontrada:', {
            id: config.googleDrive.defaultFolderId,
            name: config.googleDrive.defaultFolderName
          });
          setGoogleDriveDefaultFolder({
            id: config.googleDrive.defaultFolderId,
            name: config.googleDrive.defaultFolderName
          })
        } else {
          console.log('Nenhuma pasta padrão do Google Drive definida');
          setGoogleDriveDefaultFolder(null)
        }
      } else {
        console.log('Google Drive não está habilitado na configuração');
        setIsDriveAuthenticated(false)
        setGoogleDriveDefaultFolder(null)
      }
    } catch (error) {
      console.error('Failed to check Google Drive authentication', error)
      setIsDriveAuthenticated(false)
      setGoogleDriveDefaultFolder(null)
    }
  }

  const checkLudusavi = async () => {
    console.log('🔍 Verificando disponibilidade do Ludusavi...')
    try {
      const available = await (window as any).api.checkLudusavi()
      console.log('✅ Ludusavi disponível:', available)
      setLudusaviAvailable(available)
    } catch (error) {
      console.error('❌ Erro ao verificar Ludusavi:', error)
      setLudusaviAvailable(false)
    }
  }

  const loadGames = async () => {
    try {
      const gamesList = await (window as any).api.getGames()
      console.log('🔍 Jogos carregados:', gamesList);
      setGames(gamesList)
    } catch (error) {
      console.error('Erro ao carregar jogos:', error)
    }
  }

  const loadBackups = async (game: any) => {
    console.log('Carregando backups para o jogo:', game);
    try {
      // Obter backups locais
      const shop = game.platform || 'steam'
      const objectId = game.gameId || game.name
      console.log('Parâmetros para getLocalBackups:', { shop, objectId });
      const localBackups = await (window as any).api.getLocalBackups(shop, objectId)
      console.log('Backups locais carregados:', localBackups);
      
      // Converter backups locais para o formato esperado
      const convertedLocalBackups = localBackups.map((backup: any) => ({
        ...backup,
        isLocalBackup: true
      }));
      
      // Obter backups do Google Drive
      console.log('Carregando backups do Google Drive para o jogo:', game);
      const googleDriveBackups = await (window as any).api.getGoogleDriveBackups(shop, objectId)
      console.log('Backups do Google Drive carregados:', googleDriveBackups);
      
      // Combinar todos os backups
      const allBackups = [...convertedLocalBackups, ...googleDriveBackups];
      
      // Ordenar por data (mais recente primeiro)
      const sortedBackups = allBackups.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      console.log('Todos os backups combinados e ordenados:', sortedBackups);
      setBackups(sortedBackups)
    } catch (error) {
      console.error('Erro ao carregar backups:', error)
      setBackups([])
    }
  }

  const loadAllBackups = async () => {
    setLoadingAllBackups(true)
    try {
      console.log('Carregando todos os backups...');
      // Usar o novo método que inclui backups do Google Drive
      const allBackupsData: Array<{game: any, backups: any[]}> = await (window as any).api.getAllBackups()
      console.log('Backups carregados:', allBackupsData);
      console.log('Total de jogos com backups:', allBackupsData.length);
      
      // Adicionar logs para verificar o conteúdo dos backups
      allBackupsData.forEach(({ game, backups }) => {
        console.log(`Jogo: ${game.name}, Backups:`, backups.length);
        backups.forEach((backup: any, index: number) => {
          console.log(`  Backup ${index + 1}:`, backup);
        });
      });
      
      setAllBackups(allBackupsData)
      
      // Atualizar a lista de jogos também para refletir as contagens atualizadas
      await loadGames();
    } catch (error) {
      console.error('Erro ao carregar todos os backups:', error)
      setAllBackups([])
    } finally {
      setLoadingAllBackups(false)
    }
  }

  const handleAddGame = async () => {
    const name = prompt('Digite o nome do jogo:')
    if (!name) return

    const useCustomPath = confirm('Usar caminho customizado para os saves?')
    let customPath

    if (useCustomPath) {
      customPath = await (window as any).api.selectFolder()
    }

    try {
      await (window as any).api.addGame(name, customPath)
      await loadGames()
      await loadAllBackups()
      showSuccess('Jogo adicionado com sucesso!')
    } catch (error: any) {
      showError('Erro: ' + error.message)
    }
  }

  const handleScanGames = async () => {
    setScanning(true)
    setScanProgress(0)
    
    try {
      const found = await (window as any).api.scanGames()
      
      setScannedGames(found)
      // Inicializa o estado de seleção com todos os jogos desmarcados
      setSelectedScannedGames(new Set())
      setShowScanResults(true)
    } catch (error: any) {
      if (error.message.includes('cancelled')) {
        console.log('🛑 Scan cancelado')
      } else {
        showError('Erro ao escanear jogos: ' + error.message)
      }
    } finally {
      setTimeout(() => {
        setScanning(false)
        setScanProgress(0)
      }, 500)
    }
  }

  const handleCancelScan = async () => {
    await (window as any).api.cancelScan()
    setScanning(false)
    setScanProgress(0)
  }

  const handleAddScannedGames = async (gamesToAdd: any[]) => {
    try {
      await (window as any).api.addScannedGames(gamesToAdd)
      await loadGames()
      await loadAllBackups()
      setShowScanResults(false)
      setScannedGames([])
      setSelectedScannedGames(new Set())
      showSuccess(`${gamesToAdd.length} jogo(s) adicionado(s) com sucesso!`)
    } catch (error: any) {
      showError('Erro ao adicionar jogos: ' + error.message)
    }
  }

  const handleCreateBackup = async () => {
    setShowBackupModal(true)
  }

  const handleBackupLocal = async () => {
    if (!selectedGame) return

    setIsBackingUp(true)
    setBackupProgress(0)
    setShowBackupModal(false)

    try {
      // Adicionar listener para progresso do backup
      const cleanupBackup = (window as any).api.onBackupProgressSimple((progress: number) => {
        setBackupProgress(progress);
      });

      // Usar o novo método do BackupManager
      const backup = await (window as any).api.createBackup(selectedGame.id, `Backup de ${new Date().toLocaleDateString('pt-BR')}`)
      await loadBackups(selectedGame)
      await loadGames()
      await loadAllBackups()
      
      // Remover listener
      cleanupBackup();
      
      addNotification('Backup local criado com sucesso!', 'success')
    } catch (error: any) {
      if (error.message.includes('cancelled') || error.message.includes('cancelado')) {
        addNotification('Backup cancelado pelo usuário', 'info')
      } else {
        addNotification('Erro ao criar backup: ' + error.message, 'error')
      }
    } finally {
      setIsBackingUp(false)
      setBackupProgress(0)
      setCurrentBackupProcess(null)
    }
  }

  const handleBackupGoogleDrive = async () => {
    console.log('handleBackupGoogleDrive chamado');
    console.log('Jogo selecionado:', selectedGame);
    console.log('Pasta selecionada:', selectedGoogleDriveFolder);
    console.log('Pasta padrão:', googleDriveDefaultFolder);
    
    // Sempre abrir o modal de seleção de pasta do Google Drive
    console.log('Abrindo modal de seleção de pasta do Google Drive');
    
    // Carregar pastas do Google Drive
    await loadGoogleDriveFolders();
    
    // Pré-selecionar a pasta padrão se ela existir
    if (googleDriveDefaultFolder) {
      console.log('Pré-selecionando pasta padrão:', googleDriveDefaultFolder);
      setSelectedGoogleDriveFolder(googleDriveDefaultFolder);
    }
    
    // Mostrar o modal
    setShowGoogleDriveFolderModal(true);
  }

  const handleBackupAllGames = async () => {
    setShowBackupAllModal(true)
  }

  const handleBackupAllLocal = async () => {
    setShowBackupAllModal(false)
    setIsBackingUp(true)
    setBackupProgress(0)

    try {
      // Adicionar listener para progresso do backup
      const cleanupBackup = (window as any).api.onBackupProgress((progress: any) => {
        if (progress && typeof progress.progress === 'number') {
          setBackupProgress(progress.progress);
        }
      });

      // Para backup de todos os jogos, vamos usar a nova abordagem
      await (window as any).api.createAllGamesBackup()
      await loadGames()
      await loadAllBackups()
      
      // Remover listener
      cleanupBackup();
      
      showSuccess('Backup de todos os jogos criado com sucesso!')
    } catch (error: any) {
      if (error.message.includes('cancelled') || error.message.includes('cancelado')) {
        showInfo('Backup cancelado pelo usuário')
      } else {
        showError('Erro ao criar backup geral: ' + error.message)
      }
    } finally {
      setIsBackingUp(false)
      setBackupProgress(0)
      setCurrentBackupProcess(null)
    }
  }

  const handleBackupAllGoogleDrive = async () => {
    console.log('handleBackupAllGoogleDrive chamado');
    console.log('Pasta selecionada:', selectedGoogleDriveFolder);
    
    // Sempre abrir o modal de seleção de pasta do Google Drive
    console.log('Abrindo modal de seleção de pasta do Google Drive para backup geral');
    
    // Carregar pastas do Google Drive
    await loadGoogleDriveFolders();
    
    // Pré-selecionar a pasta padrão se ela existir
    if (googleDriveDefaultFolder) {
      console.log('Pré-selecionando pasta padrão para backup geral:', googleDriveDefaultFolder);
      setSelectedGoogleDriveFolder(googleDriveDefaultFolder);
    }
    
    // Mostrar o modal
    setShowBackupAllModal(false);
    setShowGoogleDriveFolderModal(true);
  }

  const handleCancelBackup = async () => {
    try {
      await (window as any).api.cancelBackup()
      setIsBackingUp(false)
      setBackupProgress(0)
      setCurrentBackupProcess(null)
      addNotification('Backup cancelado pelo usuário', 'info')
    } catch (error: any) {
      addNotification('Erro ao cancelar backup: ' + error.message, 'error')
    }
  }

  const handleRestoreBackup = async (backup: any, game: any) => {
    if (!game || !backup) return;
    
    setIsRestoring(true);
    setRestoreProgress(0);
    setCurrentBackupProcess(null);
    
    try {
      showInfo('Restaurando backup...');
      
      // Usar o novo método do BackupManager
      const shop = game.platform || 'steam';
      const objectId = game.gameId || game.name;
      
      // Adicionar listener para progresso da restauração
      const cleanupRestore = (window as any).api.onRestoreProgress((progress: any) => {
        if (progress && typeof progress.progress === 'number') {
          setRestoreProgress(progress.progress);
        }
      });
      
      // Criar um controlador de cancelamento
      const controller = { cancel: () => {} }; // Placeholder para compatibilidade
      setCurrentBackupProcess(controller);
      
      // Chamar a API de restauração com suporte a cancelamento
      await (window as any).api.restoreBackup(backup.id, shop, objectId);
      
      // Remover listener
      cleanupRestore();
      
      showSuccess('Backup restaurado com sucesso!');
    } catch (error: any) {
      if (error.message.includes('cancelled') || error.message.includes('cancelado')) {
        showInfo('Restauração cancelada pelo usuário');
      } else {
        showError('Erro ao restaurar backup: ' + error.message);
      }
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setCurrentBackupProcess(null);
    }
  };

  const handleDeleteBackup = async (backupId: string, game: any) => {
    if (!game) return;
    
    // Em vez de usar confirm do navegador, vamos mostrar nosso modal de confirmação
    setBackupToDelete({ backupId, game });
    setShowDeleteBackupModal(true);
  };

  const confirmDeleteBackup = async () => {
    if (!backupToDelete) return;
    
    const { backupId, game } = backupToDelete;
    
    // Mostrar mensagem de "Excluindo..." durante a exclusão
    const isGoogleDriveBackup = backupId.startsWith('gdrive-');
    const notificationId = uuid();
    if (isGoogleDriveBackup) {
      setNotifications(prev => [...prev, {id: notificationId, message: 'Excluindo backup do Google Drive...', type: 'info'}]);
    }
    
    try {
      const shop = game.platform || 'steam';
      const objectId = game.gameId || game.name;
      
      await (window as any).api.deleteBackup(backupId, shop, objectId);
      await loadAllBackups();
      if (selectedGame && selectedGame.id === game.id) {
        await loadBackups(selectedGame);
      }
      
      // Sincronizar contagens de backup após a exclusão
      await (window as any).api.syncBackupCounts();
      await loadGames(); // Recarregar os jogos para atualizar as contagens
      
      // Remover a mensagem de "Excluindo..." e mostrar sucesso
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      showSuccess('Backup deletado com sucesso!');
    } catch (error: any) {
      // Remover a mensagem de "Excluindo..." e mostrar erro
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      showError('Erro ao deletar backup: ' + error.message);
    } finally {
      // Fechar o modal de confirmação
      setShowDeleteBackupModal(false);
      setBackupToDelete(null);
    }
  };

  const cancelDeleteBackup = () => {
    setShowDeleteBackupModal(false);
    setBackupToDelete(null);
  };

  const addNotification = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    const id = uuid()
    setNotifications(prev => [...prev, {id, message, type}])
    
    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  // Métodos específicos para diferentes tipos de notificações
  const showSuccess = (message: string) => addNotification(message, 'success')
  const showError = (message: string) => addNotification(message, 'error')
  const showInfo = (message: string) => addNotification(message, 'info')
  const showWarning = (message: string) => addNotification(message, 'warning')

  const handleSelectGame = (game: any) => {
    setSelectedGame(game)
    loadBackups(game)
  }

  const handleSelectBackupFolder = async () => {
    const folder = await (window as any).api.selectFolder()
    if (folder) {
      setBackupPath(folder)
    }
  }

  const handleSaveSettings = async () => {
    try {
      // Usar o caminho real em vez do que é exibido no campo de entrada
      await (window as any).api.updateConfig({ backupPath })
      setShowSettings(false)
      showSuccess('Configurações salvas com sucesso!')
    } catch (error: any) {
      showError('Erro ao salvar configurações: ' + error.message)
    }
  }

  const handleGoogleDriveAuth = async () => {
    try {
      // Selecionar o arquivo de credenciais
      const result = await (window as any).api.selectCredentials()
      if (!result) {
        showInfo('Autenticação cancelada.')
        return
      }

      const { credentials, path } = result;

      // Salvar o caminho do arquivo de credenciais na configuração
      const config = await (window as any).api.getConfig()
      config.googleDrive.credentialsPath = path
      await (window as any).api.updateConfig(config)

      const { client_id, client_secret } = credentials.installed || credentials.web
      const authUrl = await (window as any).api.gdriveInit(client_id, client_secret)
      
      await (window as any).api.openExternalUrl(authUrl)
    } catch (error: any) {
      showError('Erro na autenticação com Google Drive: ' + error.message)
    }
  }

  const handleGdriveCode = async (code: string) => {
    try {
      await (window as any).api.gdriveAuth(code)
      setIsDriveAuthenticated(true)
      showSuccess('Autenticado com o Google Drive com sucesso!')
      
      // Save the authentication status in config
      const config = await (window as any).api.getConfig()
      config.googleDrive.enabled = true
      await (window as any).api.updateConfig(config)
    } catch (error: any) {
      showError('Erro na autenticação com Google Drive: ' + error.message)
    }
  }

  const handleGoogleDriveLogout = async () => {
    try {
      await (window as any).api.gdriveLogout()
      setIsDriveAuthenticated(false)
      showSuccess('Desconectado do Google Drive com sucesso!')
      
      // Update config to disable Google Drive
      const config = await (window as any).api.getConfig()
      config.googleDrive.enabled = false
      await (window as any).api.updateConfig(config)
    } catch (error: any) {
      showError('Erro ao desconectar do Google Drive: ' + error.message)
    }
  }

  const loadGoogleDriveFolders = async (parentId?: string) => {
    if (!isDriveAuthenticated) {
      console.log('Google Drive não autenticado');
      return;
    }
    
    setLoadingFolders(true);
    try {
      console.log('Carregando pastas do Google Drive, parentId:', parentId || 'root');
      const folders = await (window as any).api.gdriveListFolders(parentId);
      console.log('Pastas carregadas:', folders);
      setGoogleDriveFolders(folders);
    } catch (error: any) {
      console.error('Erro ao carregar pastas do Google Drive:', error);
      showError('Erro ao carregar pastas do Google Drive: ' + error.message);
    } finally {
      setLoadingFolders(false);
    }
  }

  const navigateToFolder = async (folder: any) => {
    console.log('Navegando para pasta:', folder);
    // Atualizar o caminho atual
    const newPath = [...currentGoogleDrivePath, {id: folder.id, name: folder.name}]
    setCurrentGoogleDrivePath(newPath)
    console.log('Novo caminho:', newPath);
    
    // Carregar pastas da nova localização
    await loadGoogleDriveFolders(folder.id)
    
    // Desmarcar qualquer pasta selecionada ao navegar
    setSelectedGoogleDriveFolder(null)
  }

  const navigateToParentFolder = async () => {
    console.log('Navegando para pasta pai, caminho atual:', currentGoogleDrivePath);
    if (currentGoogleDrivePath.length <= 1) {
      console.log('Já estamos na raiz do Google Drive');
      return;
    }
    
    // Remover o último item do caminho
    const newPath = currentGoogleDrivePath.slice(0, -1)
    setCurrentGoogleDrivePath(newPath)
    console.log('Novo caminho após navegar para pai:', newPath);
    
    // Carregar pastas do novo local
    const parentId = newPath.length > 1 ? newPath[newPath.length - 1].id : 'root'
    console.log('Carregando pastas do parentId:', parentId);
    await loadGoogleDriveFolders(parentId);
    
    // Desmarcar qualquer pasta selecionada ao navegar
    setSelectedGoogleDriveFolder(null)
  }

  const handleCreateGoogleDriveFolder = async () => {
    if (!newFolderName.trim()) {
      showError('Por favor, informe um nome para a pasta')
      return
    }
    
    try {
      const parentId = currentGoogleDrivePath[currentGoogleDrivePath.length - 1].id
      console.log('Criando pasta com nome:', newFolderName, 'no parentId:', parentId);
      const folderId = await (window as any).api.gdriveCreateFolder(newFolderName, parentId)
      console.log('Pasta criada com ID:', folderId);
      showSuccess('Pasta criada com sucesso!')
      setNewFolderName('')
      // Recarregar a lista de pastas
      await loadGoogleDriveFolders(parentId)
      // Desmarcar qualquer pasta selecionada após criar uma nova
      setSelectedGoogleDriveFolder(null)
    } catch (error: any) {
      console.error('Erro ao criar pasta no Google Drive:', error);
      showError('Erro ao criar pasta no Google Drive: ' + error.message)
    }
  }

  const handleSelectGoogleDriveFolder = (folder: any) => {
    console.log('Pasta selecionada:', folder);
    // Se a mesma pasta já estiver selecionada, desmarcar
    if (selectedGoogleDriveFolder && selectedGoogleDriveFolder.id === folder.id) {
      setSelectedGoogleDriveFolder(null);
    } else {
      // Selecionar a nova pasta
      setSelectedGoogleDriveFolder(folder);
    }
  }

  const handleSetGoogleDriveDefaultFolder = async () => {
    if (!selectedGoogleDriveFolder) {
      showError('Por favor, selecione uma pasta do Google Drive primeiro');
      return;
    }
    
    try {
      await (window as any).api.setGoogleDriveDefaultFolder(
        selectedGoogleDriveFolder.id, 
        selectedGoogleDriveFolder.name
      );
      
      setGoogleDriveDefaultFolder({
        id: selectedGoogleDriveFolder.id,
        name: selectedGoogleDriveFolder.name
      });
      
      showSuccess(`Pasta "${selectedGoogleDriveFolder.name}" definida como padrão do Google Drive!`);
      
      // Fechar o modal
      setShowGoogleDriveFolderModal(false);
      setSelectedGoogleDriveFolder(null);
      setCurrentGoogleDrivePath([{id: 'root', name: 'Google Drive'}]);
    } catch (error: any) {
      console.error('Erro ao definir pasta padrão do Google Drive:', error);
      showError('Erro ao definir pasta padrão: ' + error.message);
    }
  }

  const handleClearGoogleDriveDefaultFolder = async () => {
    try {
      await (window as any).api.clearGoogleDriveDefaultFolder();
      setGoogleDriveDefaultFolder(null);
      showSuccess('Pasta padrão do Google Drive removida!');
    } catch (error: any) {
      console.error('Erro ao remover pasta padrão do Google Drive:', error);
      showError('Erro ao remover pasta padrão: ' + error.message);
    }
  }

  const handleBackupGoogleDriveWithFolder = async () => {
    console.log('Iniciando backup para Google Drive');
    console.log('Jogo selecionado:', selectedGame);
    console.log('Pasta selecionada:', selectedGoogleDriveFolder);
    console.log('Pasta padrão:', googleDriveDefaultFolder);
    
    if (!selectedGame) {
      console.log('Nenhum jogo selecionado');
      return;
    }

    // Usar pasta padrão se nenhuma pasta estiver selecionada
    const folderToUse = selectedGoogleDriveFolder || googleDriveDefaultFolder;
    
    if (!folderToUse) {
      showError('Por favor, selecione uma pasta do Google Drive ou defina uma pasta padrão');
      return;
    }

    setIsBackingUp(true)
    setBackupProgress(0)
    setShowBackupModal(false)
    setShowGoogleDriveFolderModal(false)

    try {
      // Criar backup efêmero diretamente no Google Drive (sem salvar localmente)
      const shop = selectedGame.platform || 'steam'
      const objectId = selectedGame.gameId || selectedGame.name
      
      console.log('Fazendo upload direto para Google Drive sem criar backup local permanente');
      // Fazer upload imediatamente para o Google Drive sem criar backup local permanente
      await (window as any).api.gdriveUploadEphemeral(
        selectedGame.id, 
        `Backup de ${new Date().toLocaleDateString('pt-BR')}`, 
        folderToUse.name
      )
      
      // Recarregar apenas os backups do Google Drive, não os locais
      await loadGames()
      await loadAllBackups()
      addNotification('Backup no Google Drive criado com sucesso!', 'success')
    } catch (error: any) {
      console.error('Erro ao criar backup no Google Drive:', error);
      if (error.message.includes('cancelled') || error.message.includes('cancelado')) {
        addNotification('Backup cancelado pelo usuário', 'info')
      } else {
        addNotification('Erro ao criar backup: ' + error.message, 'error')
      }
    } finally {
      setIsBackingUp(false)
      setBackupProgress(0)
      setCurrentBackupProcess(null)
      setSelectedGoogleDriveFolder(null)
      setCurrentGoogleDrivePath([{id: 'root', name: 'Google Drive'}])
    }
  }

  const handleBackupAllGoogleDriveWithFolder = async () => {
    console.log('Iniciando backup geral para Google Drive');
    console.log('Pasta selecionada:', selectedGoogleDriveFolder);
    
    if (!selectedGoogleDriveFolder) {
      showError('Por favor, selecione uma pasta do Google Drive');
      return;
    }

    setShowBackupAllModal(false)
    setIsBackingUp(true)
    setBackupProgress(0)
    setShowGoogleDriveFolderModal(false)

    try {
      console.log('Criando backup de todos os jogos');
      // Adicionar listener para progresso do backup
      const cleanupBackup = (window as any).api.onBackupProgress((progress: any) => {
        if (progress && typeof progress.progress === 'number') {
          setBackupProgress(progress.progress);
        }
      });
      
      // Criar backup de todos os jogos diretamente no Google Drive
      const result = await (window as any).api.createAllGamesBackupGdrive(selectedGoogleDriveFolder.name)
      console.log('Resultado do backup geral:', result);
      
      // Remover listener
      cleanupBackup();
      
      await loadGames()
      await loadAllBackups()
      showSuccess('Backup no Google Drive criado com sucesso!')
    } catch (error: any) {
      console.error('Erro ao criar backup geral no Google Drive:', error);
      if (error.message.includes('cancelled') || error.message.includes('cancelado')) {
        showInfo('Backup cancelado pelo usuário')
      } else {
        showError('Erro ao criar backup geral: ' + error.message)
      }
    } finally {
      setIsBackingUp(false)
      setBackupProgress(0)
      setCurrentBackupProcess(null)
      setSelectedGoogleDriveFolder(null)
      setCurrentGoogleDrivePath([{id: 'root', name: 'Google Drive'}])
    }
  }

  // Função para verificar se um backup está no Google Drive
  const isBackupInGoogleDrive = (backup: any): boolean => {
    // Verificar se o backup tem um cloudFileId, o que indica que está no Google Drive
    if (backup.cloudFileId) {
      return true;
    }
    
    // Verificar se o ID do backup indica que está no Google Drive
    if (backup.id && backup.id.startsWith('gdrive-')) {
      return true;
    }
    
    // Verificar se há metadados que indiquem que está no Google Drive
    if (backup.metadata && backup.metadata.cloudStorage === 'google-drive') {
      return true;
    }
    
    console.log('Backup não está no Google Drive:', backup);
    return false;
  }

  const handleUpdateAllIcons = async () => {
    setIsUpdatingIcons(true)
    try {
      await (window as any).api.updateAllIcons()
      await loadGames()
      showSuccess('Ícones atualizados com sucesso!')
    } catch (error: any) {
      showError('Erro ao atualizar ícones: ' + error.message)
    } finally {
      setIsUpdatingIcons(false)
    }
  }

  const handleRemoveGame = (game: any) => {
    setGameToRemove(game)
    setShowRemoveGameModal(true)
  }

  const confirmRemoveGame = async () => {
    if (!gameToRemove) return

    try {
      await (window as any).api.removeGame(gameToRemove.id)
      await loadGames()
      await loadAllBackups()
      
      // Se o jogo removido era o jogo selecionado, deselecionar
      if (selectedGame && selectedGame.id === gameToRemove.id) {
        setSelectedGame(null)
      }
      
      showSuccess(`Jogo "${gameToRemove.name}" removido com sucesso!`)
    } catch (error: any) {
      showError('Erro ao remover jogo: ' + error.message)
    } finally {
      setShowRemoveGameModal(false)
      setGameToRemove(null)
    }
  }

  const cancelRemoveGame = () => {
    setShowRemoveGameModal(false)
    setGameToRemove(null)
  }

  const toggleScannedGameSelection = (gameId: string) => {
    const newSelected = new Set(selectedScannedGames)
    if (newSelected.has(gameId)) {
      newSelected.delete(gameId)
    } else {
      newSelected.add(gameId)
    }
    setSelectedScannedGames(newSelected)
  }

  const toggleSelectAllScannedGames = () => {
    if (selectedScannedGames.size === scannedGames.length) {
      // Se todos estão selecionados, desmarcar todos
      setSelectedScannedGames(new Set())
    } else {
      // Se nem todos estão selecionados, selecionar todos
      const allGameIds = new Set(scannedGames.map(game => game.gameId))
      setSelectedScannedGames(allGameIds)
    }
  }

  const handleAddSelectedScannedGames = async () => {
    const gamesToAdd = scannedGames.filter(game => selectedScannedGames.has(game.gameId))
    if (gamesToAdd.length === 0) {
      showWarning('Nenhum jogo selecionado para adicionar')
      return
    }
    await handleAddScannedGames(gamesToAdd)
  }

  const handleOpenGitHub = () => {
    (window as any).api.openExternalUrl('https://github.com/weguer/ProjectW')
  }

  const toggleTheme = () => {
    const newTheme = !isLightTheme
    setIsLightTheme(newTheme)
    
    if (newTheme) {
      document.body.classList.add('light-theme')
      localStorage.setItem('theme', 'light')
    } else {
      document.body.classList.remove('light-theme')
      localStorage.setItem('theme', 'dark')
    }
  }

  return (
    <div className="app">
      <CustomTitleBar />
      <header className="app-header">
        <h1>🎮 Project W - Backup de Saves de Jogos</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme}>
            {isLightTheme ? '🌙' : '☀️'}
          </button>
          <button className="btn btn-primary" onClick={handleBackupAllGames} disabled={!ludusaviAvailable || isBackingUp}>
            💾 Backup de Todos os Jogos
          </button>
          <button className="btn" onClick={() => setSelectedGame(null)}>
            📋 Backups Recentes
          </button>
          {/* Botão "Atualizar Ícones" oculto - funcionalidade mantida mas não visível */}
          <button 
            className="btn" 
            onClick={handleUpdateAllIcons}
            disabled={isUpdatingIcons}
            style={{ display: 'none' }}
          >
            {isUpdatingIcons ? '🔄 Atualizando...' : '🔄 Atualizar Ícones'}
          </button>
          <button className="btn" onClick={() => setShowSettings(true)}>
            ⚙️ Configurações
          </button>
          <button className="btn" onClick={() => setShowAboutModal(true)}>
            ℹ️ Sobre
          </button>
        </div>
        {!ludusaviAvailable && (
          <div className="warning">
            ⚠️ Ludusavi não encontrado. Por favor, baixe e coloque em ./ludusavi/
          </div>
        )}
      </header>

      {/* Notifications Container */}
      <Notifications notifications={notifications} onRemove={removeNotification} />

      <div className="container">
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>Jogos</h2>
            <div className="header-buttons">
              {scanning ? (
                <button onClick={handleCancelScan} className="btn btn-danger">
                  ❌ Parar
                </button>
              ) : (
                <button onClick={handleScanGames} disabled={!ludusaviAvailable} className="btn btn-primary">
                  🔍 Escanear Jogos
                </button>
              )}
            </div>
            {scanning && (
              <div className="scan-progress">
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${scanProgress}%` }}></div>
                </div>
                <div className="progress-text">Procurando... {scanProgress}%</div>
              </div>
            )}
          </div>

          <ul className="games-list">
            {games.map((game) => (
              <li
                key={game.id}
                className={selectedGame?.id === game.id ? 'active' : ''}
                onClick={() => handleSelectGame(game)}
              >
                {game.coverUrl ? (
                  <img 
                    src={game.coverUrl} 
                    alt={game.name} 
                    className="game-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="game-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                    🎮
                  </div>
                )}
                <div className="game-details">
                  <div className="game-name">{game.name}</div>
                  <div className="game-info">{game.backupCount} backup(s)</div>
                </div>
                <button 
                  className="btn-remove-game"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveGame(game);
                  }}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="main-content">
          {showSettings && (
            <div className="modal-overlay">
              <div className="modal-content settings-modal">
                <h2>⚙️ Configurações</h2>
                
                <div className="settings-section">
                  <h3>💾 Pasta de Backups</h3>
                  <p className="settings-description">
                    Todos os backups (individuais e completos) serão salvos nesta pasta
                  </p>
                  <div className="path-selector">
                    <input 
                      type="text" 
                      value={backupPath} 
                      onChange={(e) => setBackupPath(e.target.value)}
                      className="path-input"
                      placeholder='Selecione uma Pasta'
                    />
                    <button 
                      onClick={handleSelectBackupFolder} 
                      className="btn"
                    >
                      📂 Procurar
                    </button>
                  </div>
                  <div className="path-info">
                    <p>Exemplos:</p>
                    📁 <strong>Jogo Individual:</strong> .../Backups/CloudSaves/steam-1234567/uuid-identificador/<br/>
                    📁 <strong>Todos os Jogos:</strong> .../Backups/CloudSaves/steam-1234567/uuid-identificador/
                  </div>
                </div>

                <div className="settings-section">
                  <h3>☁️ Google Drive</h3>
                  <div className="gdrive-status">
                    Status: 
                    {isDriveAuthenticated ? (
                      <span className="connected">Conectado</span>
                    ) : (
                      <span className="disconnected">Desconectado</span>
                    )}
                  </div>

                  {isDriveAuthenticated ? (
                    <button onClick={handleGoogleDriveLogout} className="btn btn-danger">
                      Desconectar
                    </button>
                  ) : (
                    <button onClick={handleGoogleDriveAuth} className="btn btn-primary">
                      Autenticar com Google Drive
                    </button>
                  )}
                </div>

                <div className="modal-actions">
                  <button onClick={handleSaveSettings} className="btn btn-success">Salvar</button>
                  <button onClick={() => setShowSettings(false)} className="btn">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {showAboutModal && (
            <div className="modal-overlay">
              <div className="modal-content about-modal">
                <h2>ℹ️ Sobre o Project W</h2>
                <div className="about-content">
                  <p><strong>Versão:</strong> 1.0.0</p>
                  <p><strong>Weguer</strong></p>
                  <div className="github-section">
                    <p>Projeto no GitHub:</p>
                    <button className="btn github-btn" onClick={handleOpenGitHub}>
                      <span className="icon">🐙</span> Acessar Repositório
                    </button>
                  </div>
                </div>
                <div className="modal-actions">
                  <button onClick={() => setShowAboutModal(false)} className="btn">Fechar</button>
                </div>
              </div>
            </div>
          )}

          {showBackupModal && (
            <div className="modal-overlay">
              <div className="modal-content backup-modal">
                <h2>💾 Escolha o Tipo de Backup</h2>
                <p>Para: <strong>{selectedGame?.name}</strong></p>
                <div className="backup-options">
                  <button className="backup-option-btn local" onClick={handleBackupLocal}>
                    <span className="icon">💾</span>
                    <span className="title">Backup Local</span>
                    <span className="desc">Salvar no computador</span>
                  </button>
                  <button 
                    className="backup-option-btn gdrive" 
                    onClick={handleBackupGoogleDrive}
                    disabled={!isDriveAuthenticated}
                  >
                    <span className="icon">☁️</span>
                    <span className="title">Google Drive</span>
                    <span className="desc">Salvar na nuvem</span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button onClick={() => setShowBackupModal(false)} className="btn">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {showBackupAllModal && (
            <div className="modal-overlay">
              <div className="modal-content backup-modal">
                <h2>💾 Escolha o Tipo de Backup Geral</h2>
                <p>Para: <strong>TODOS OS JOGOS</strong></p>
                <div className="backup-options">
                  <button className="backup-option-btn local" onClick={handleBackupAllLocal}>
                    <span className="icon">💾</span>
                    <span className="title">Backup Local</span>
                    <span className="desc">Salvar no computador</span>
                  </button>
                  <button 
                    className="backup-option-btn gdrive" 
                    onClick={handleBackupAllGoogleDrive}
                    disabled={!isDriveAuthenticated}
                  >
                    <span className="icon">☁️</span>
                    <span className="title">Google Drive</span>
                    <span className="desc">Salvar na nuvem</span>
                  </button>
                </div>
                <div className="modal-actions">
                  <button onClick={() => setShowBackupAllModal(false)} className="btn">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {isBackingUp && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>Criando Backup...</h3>
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${backupProgress}%` }}></div>
                </div>
                <div className="progress-text">{backupProgress}%</div>
                <div className="modal-actions">
                  <button onClick={handleCancelBackup} className="btn btn-danger">
                    ❌ Parar Backup
                  </button>
                </div>
              </div>
            </div>
          )}

          {isRestoring && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3>Restaurando Backup...</h3>
                <div className="progress-container">
                  <div className="progress-bar" style={{ width: `${restoreProgress}%` }}></div>
                </div>
                <div className="progress-text">{restoreProgress}%</div>
                <div className="modal-actions">
                  <button onClick={() => {
                    // TODO: Implementar cancelamento de restauração
                    setIsRestoring(false);
                    setRestoreProgress(0);
                    setCurrentBackupProcess(null);
                    showInfo('Restauração cancelada pelo usuário');
                  }} className="btn btn-danger">
                    ❌ Parar Restauração
                  </button>
                </div>
              </div>
            </div>
          )}

          {showRemoveGameModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>🗑️ Remover Jogo</h2>
                <p>Tem certeza que deseja remover o jogo <strong>{gameToRemove?.name}</strong>?</p>
                <p>Esta ação irá remover o jogo da lista, mas não afetará os arquivos de save existentes.</p>
                <div className="modal-actions">
                  <button onClick={confirmRemoveGame} className="btn btn-danger">
                    Sim, Remover
                  </button>
                  <button onClick={cancelRemoveGame} className="btn">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDeleteBackupModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>🗑️ Deletar Backup</h2>
                <p>Tem certeza que deseja deletar este backup?</p>
                <p>Esta ação não pode ser desfeita.</p>
                <div className="modal-actions">
                  <button onClick={confirmDeleteBackup} className="btn btn-danger">
                    Sim, Deletar
                  </button>
                  <button onClick={cancelDeleteBackup} className="btn">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {showScanResults && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>Encontrados {scannedGames.length} Jogo(s) com Saves</h2>
                
                {/* Barra de ações para seleção */}
                <div className="scan-actions-bar">
                  <button 
                    onClick={toggleSelectAllScannedGames}
                    className="btn btn-secondary"
                  >
                    {selectedScannedGames.size === scannedGames.length 
                      ? 'Desmarcar Todos' 
                      : 'Selecionar Todos'}
                  </button>
                  <button 
                    onClick={handleAddSelectedScannedGames}
                    className="btn btn-success"
                    disabled={selectedScannedGames.size === 0}
                  >
                    Adicionar Selecionados ({selectedScannedGames.size})
                  </button>
                </div>
                
                <div className="scanned-games-list">
                  {scannedGames.map((game) => {
                    // Verifica se o jogo já está adicionado
                    const isAlreadyAdded = games.some(g => 
                      (g.gameId && g.gameId === game.gameId) || 
                      g.name === game.name || 
                      g.name === (game.displayName || game.name)
                    )
                    // Verifica se está selecionado
                    const isSelected = selectedScannedGames.has(game.gameId)
                    
                    return (
                      <div 
                        key={game.gameId} 
                        className={`scanned-game-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleScannedGameSelection(game.gameId)}
                      >
                        <div className="scanned-game-selection-indicator">
                          {isSelected ? '✓' : '○'}
                        </div>
                        
                        {game.coverUrl ? (
                          <img 
                            src={game.coverUrl} 
                            alt={game.name} 
                            className="scanned-game-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="scanned-game-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                            🎮
                          </div>
                        )}
                        
                        <div className="scanned-game-info">
                          <div className="scanned-game-name">
                            {game.displayName && game.displayName.length > 30 
                              ? `${game.displayName.substring(0, 30)}...` 
                              : game.displayName || game.name}
                          </div>
                          {isAlreadyAdded && (
                            <div className="already-added-indicator-below" title="Jogo já adicionado">
                              🟢 Jogo já adicionado
                            </div>
                          )}
                          {game.gameId && game.gameId !== (game.displayName || game.name) && (
                            <div className="scanned-game-id">ID: {game.gameId}</div>
                          )}
                          <div className="scanned-game-saves">
                            {game.savesCount} save(s) encontrado(s)
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="modal-actions">
                  <button 
                    onClick={handleAddSelectedScannedGames}
                    className="btn btn-success"
                    disabled={selectedScannedGames.size === 0}
                  >
                    Adicionar Selecionados ({selectedScannedGames.size})
                  </button>
                  <button onClick={() => setShowScanResults(false)} className="btn">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {showGoogleDriveFolderModal && (
            <div className="modal-overlay">
              <div className="modal-content backup-modal">
                <h2>📂 Selecionar Pasta do Google Drive</h2>
                <p>Para: <strong>{selectedGame?.name || 'Todos os Jogos'}</strong></p>
                
                {/* Breadcrumb para navegação */}
                <div className="folder-breadcrumb">
                  {currentGoogleDrivePath.length > 1 && (
                    <button 
                      onClick={navigateToParentFolder}
                      className="btn"
                    >
                      ← Pasta pai
                    </button>
                  )}
                  {currentGoogleDrivePath.map((folder, index) => (
                    <span key={folder.id}>
                      <button 
                        onClick={() => {
                          // Navegar para esta pasta
                          const newPath = currentGoogleDrivePath.slice(0, index + 1)
                          setCurrentGoogleDrivePath(newPath)
                          const parentId = index > 0 ? newPath[index].id : 'root'
                          loadGoogleDriveFolders(parentId)
                          // Desmarcar qualquer pasta selecionada ao navegar
                          setSelectedGoogleDriveFolder(null)
                        }}
                        className="btn"
                      >
                        {folder.name}
                      </button>
                      {index < currentGoogleDrivePath.length - 1 && <span> / </span>}
                    </span>
                  ))}
                </div>
                
                {loadingFolders ? (
                  <p>Carregando pastas...</p>
                ) : (
                  <>
                    <div className="folder-list">
                      <h3>Pastas:</h3>
                      {currentGoogleDrivePath.length > 1 && (
                        <div 
                          className="folder-item"
                          onClick={navigateToParentFolder}
                        >
                          📁 .. (Pasta pai)
                        </div>
                      )}
                      {googleDriveFolders.length === 0 ? (
                        <p>Nenhuma pasta encontrada</p>
                      ) : (
                        <ul className="folders-list">
                          {googleDriveFolders.map((folder) => (
                            <li 
                              key={folder.id} 
                              className="folder-item"
                            >
                              <div 
                                className="folder-name"
                                onClick={() => navigateToFolder(folder)}
                              >
                                📁 {folder.name}
                              </div>
                              <button
                                className={`btn ${selectedGoogleDriveFolder?.id === folder.id ? 'btn-success' : ''}`}
                                onClick={() => handleSelectGoogleDriveFolder(folder)}
                              >
                                {selectedGoogleDriveFolder?.id === folder.id ? '✓' : '○'}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    
                    <div className="create-folder-section">
                      <h3>Criar nova pasta:</h3>
                      <div className="folder-input-group">
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="Nome da nova pasta"
                          className="path-input"
                        />
                        <button 
                          onClick={handleCreateGoogleDriveFolder}
                          className="btn btn-primary"
                        >
                          Criar
                        </button>
                      </div>
                    </div>
                  </>
                )}
                
                <div className="modal-actions">
                  <button 
                    onClick={() => {
                      console.log('Botão Continuar com Backup clicado');
                      console.log('Pasta selecionada:', selectedGoogleDriveFolder);
                      if (selectedGame) {
                        handleBackupGoogleDriveWithFolder()
                      } else {
                        handleBackupAllGoogleDriveWithFolder()
                      }
                    }}
                    disabled={!selectedGoogleDriveFolder && !googleDriveDefaultFolder}
                    className="btn btn-success"
                  >
                    Continuar com Backup
                  </button>
                  {selectedGoogleDriveFolder && (
                    <button 
                      onClick={handleSetGoogleDriveDefaultFolder}
                      className="btn btn-warning"
                    >
                      Definir como Pasta Padrão
                    </button>
                  )}
                  {googleDriveDefaultFolder && (
                    <button 
                      onClick={handleClearGoogleDriveDefaultFolder}
                      className="btn"
                    >
                      Limpar Pasta Padrão ({googleDriveDefaultFolder.name})
                    </button>
                  )}
                  <button onClick={() => {
                    setShowGoogleDriveFolderModal(false)
                    setSelectedGoogleDriveFolder(null)
                    setCurrentGoogleDrivePath([{id: 'root', name: 'Google Drive'}])
                  }} className="btn">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Seção de Backups Recentes na Tela Inicial */}
          {!selectedGame && (
            <div className="recent-backups-section">
              <div className="recent-backups-header">
                <h2>💾 Backups Recentes</h2>
                {googleDriveDefaultFolder && (
                  <div className="default-folder-info">
                    📁 Pasta Padrão do Google Drive: {googleDriveDefaultFolder.name}
                  </div>
                )}
              </div>
              {loadingAllBackups ? (
                <p>Carregando backups...</p>
              ) : allBackups.length === 0 ? (
                <p>Nenhum backup encontrado. Crie um backup de um jogo para vê-lo aqui.</p>
              ) : (
                <div className="recent-backups-list">
                  {allBackups.map(({ game, backups }) => 
                    backups.map((backup: any) => (
                      <div 
                        key={`${game.id}-${backup.id}`} 
                        className={`recent-backup-item ${backup.isCloudBackup ? 'cloud-backup' : 'local-backup'}`}
                      >
                        <div className="recent-backup-header">
                          <div className="recent-backup-game-info">
                            {game.coverUrl ? (
                              <img 
                                src={game.coverUrl} 
                                alt={game.name} 
                                className="recent-backup-game-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="recent-backup-game-cover" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                🎮
                              </div>
                            )}
                            <div>
                              <div className="recent-backup-game-name">{game.name}</div>
                              <div className="recent-backup-label">
                                {backup.label || 'Backup sem nome'}
                                {backup.isCloudBackup && (
                                  <span className="backup-source"> (Google Drive)</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="recent-backup-date">
                            {new Date(backup.createdAt).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <div className="recent-backup-actions">
                          <button
                            onClick={() => handleRestoreBackup(backup, game)}
                            className="btn btn-primary"
                          >
                            🔁 Restaurar
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.id, game)}
                            className="btn btn-danger"
                          >
                            🗑️ Deletar
                          </button>
                        </div>
                      </div>
                    ))
                  ).flat()}
                </div>
              )}
            </div>
          )}

          {selectedGame ? (
            <>
              <div className="game-header">
                <h2>{selectedGame.name}</h2>
                <div className="game-header-actions">
                  <button onClick={handleCreateBackup} className="btn btn-primary">Criar Backup</button>
                  {googleDriveDefaultFolder && (
                    <div className="default-folder-info">
                      📁 Pasta Padrão: {googleDriveDefaultFolder.name}
                    </div>
                  )}
                </div>
              </div>

              <div className="backups-section">
                <h3>Backups</h3>
                {backups.length === 0 ? (
                  <p>Nenhum backup ainda. Crie um!</p>
                ) : (
                  <ul className="backups-list">
                    {backups.map((backup: any) => (
                      <li 
                        key={backup.id} 
                        className={`backup-item ${backup.isCloudBackup ? 'cloud-backup' : 'local-backup'}`}
                      >
                        <div className="backup-info">
                          <div className="backup-label">
                            {backup.label || 'Backup sem nome'}
                            {backup.isCloudBackup && (
                              <span className="backup-source"> (Google Drive)</span>
                            )}
                          </div>
                          <div className="backup-date">
                            {new Date(backup.createdAt).toLocaleString('pt-BR')}
                          </div>
                          <div className="backup-size">
                            {typeof backup.artifactLengthInBytes === 'number' 
                              ? (backup.artifactLengthInBytes / 1024 / 1024).toFixed(2) 
                              : '0.00'} MB
                          </div>
                        </div>
                        <div className="backup-actions">
                          <button
                            onClick={() => handleRestoreBackup(backup, selectedGame)}
                            className="btn btn-primary"
                          >
                            🔁 Restaurar
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.id, selectedGame)}
                            className="btn btn-danger"
                          >
                            🗑️ Deletar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
          
        </div>
      </div>
      
      {/* Rodapé removido */}
    </div>
  )
}

export default App