# Project W

**Project W** é apenas um aplicativo que fiz para utilização propria, utilizando o ludusavi-cli e que serve para backup e restauração de saves de jogos com integração ao Google Drive. Desenvolvida com Electron, React e TypeScript, oferece uma interface moderna e intuitiva para gerenciar seus saves de jogos em múltiplas plataformas.

<p align="center">
  <img src="https://i.imgur.com/kKtFpNF.png" width="300" alt="Logo do Projeto">
</p>


## Funcionalidades

- 🔍 Escaneamento automático de jogos instalados
- 💾 Backup local e na nuvem (Google Drive)
- 🔄 Restauração de saves com um clique
- 🌐 Suporte multiplataforma (Windows e Linux)
- 🎮 Compatível com Steam, GOG, Epic Games e jogos personalizados


## Requisitos do Sistema

- **Windows**: Windows 7 ou superior
- **Linux**: Distribuição com suporte a AppImage ou DEB (A Build para Linux não testei 100%)
- **Armazenamento**: Espaço suficiente para os saves dos jogos

## Instalação

### Método 1: Instalador (Recomendado)

1. **Baixe o instalador**:
   - Acesse a seção [Releases](https://github.com/weguer/projectw/releases) do projeto
   - Baixe o instalador apropriado para seu sistema:
     - **Windows**: `Project W Setup X.X.X.exe`
     - **Linux**: `projectw-X.X.X.AppImage` ou `projectw_X.X.X_amd64.deb`

2. **Instale o aplicativo**:
   - **Windows**: Execute o arquivo `.exe` e siga o assistente de instalação
   - **Linux**: 
     - AppImage: Dê permissão de execução (`chmod +x projectw-X.X.X.AppImage`) e execute
     - DEB: Instale com `sudo dpkg -i projectw_X.X.X_amd64.deb`

### Método 2: A partir do código-fonte

1. **Pré-requisitos**:
   - Node.js 16 ou superior
   - npm 8 ou superior
   - Git

2. **Clone o repositório**:
   ```bash
   git clone https://github.com/seu-usuario/projectw.git
   cd projectw
   ```

3. **Instale as dependências**:
   ```bash
   npm install
   ```

4. **Inicie o modo de desenvolvimento**:
   ```bash
   npm run dev
   ```

5. **Construa o aplicativo** (opcional):
   ```bash
   # Para Windows
   npm run build:win
   
   # Para Linux
   npm run build:linux
   ```

## Configuração do Google Drive

Para usar a integração com Google Drive, você precisa configurar as credenciais da API:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione um existente
3. Habilite a API do Google Drive
4. Crie credenciais OAuth 2.0 do tipo "Aplicativo para Web"
5. Adicione as URLS de redirecionamento, em example.env tem algumas que o aplicativo já utilza.
6. para utilzaçao em modo dev, precisa ter o .env na pasta.
7. Baixe o arquivo JSON com as credenciais
8. No Project W, vá em Configurações > Google Drive
9. Selecione o arquivo de credenciais baixado
10. Autorize o acesso quando solicitado
11. SDe não quiser utilizar o Google Drive integrado ao aplicativo, pode montar o Google Drive com alguma outro aplicativo no computador e utilizar a versão local e selecionar.

## Uso Básico

1. **Adicionar jogos**:
   - Clique em "Scanear Jogos" para detectar automaticamente os jogos instalados
   - Por padrão já utiliza o manifets.yaml do ludusavi que vem da GameWiki para localizar os games, mas após scanear pela primeira vez ele gera o arquivo config.yaml, onde pode editar e adicionar uma url de alguma manifest personalizado.
   - Exemplo em example.config

2. **Criar backup**:
   - Selecione um jogo na lista
   - Clique em "Criar Backup"
   - Escolha entre backup local ou na nuvem

3. **Restaurar backup**:
   - Selecione um jogo com backups disponíveis
   - Escolha o backup desejado
   - Clique em "Restaurar"

## Solução de Problemas

### Problemas comuns com Google Drive

**Erro de autenticação**:
- Verifique se o arquivo de credenciais está correto
- Certifique-se de que a API do Google Drive está habilitada
- Tente desconectar e reconectar sua conta

**Backups não aparecem**:
- Verifique se os backups estão na pasta correta no Google Drive
- Configure a pasta padrão nas configurações do Google Drive

### Problemas com backups locais

**Saves não detectados**:
- Verifique se o Ludusavi está funcionando corretamente

## Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.
