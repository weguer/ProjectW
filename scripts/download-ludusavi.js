#!/usr/bin/env node

/**
 * Script para download automático do Ludusavi
 * 
 * Este script faz o download da versão apropriada do Ludusavi do GitHub
 * com base no sistema operacional e a coloca na pasta ludusavi/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Obter o diretório atual do script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório do projeto
const projectRoot = path.join(__dirname, '..');
const ludusaviDir = path.join(projectRoot, 'ludusavi');

// Verificar se o diretório ludusavi existe, se não, criá-lo
if (!fs.existsSync(ludusaviDir)) {
  fs.mkdirSync(ludusaviDir, { recursive: true });
}

// Obter o sistema operacional
const platform = process.argv[2] || process.platform;
const isWindows = platform === 'win32' || platform === 'win' || platform.includes('win');
const isLinux = platform === 'linux' || platform.includes('linux');

console.log(`🔍 Detectando plataforma: ${platform}`);
console.log(`🖥️  Windows: ${isWindows}, Linux: ${isLinux}`);

// Nome do binário
const binaryName = isWindows ? 'ludusavi.exe' : 'ludusavi';
const binaryPath = path.join(ludusaviDir, binaryName);

// Verificar se o binário já existe
if (fs.existsSync(binaryPath)) {
  console.log(`✅ Ludusavi já está instalado em: ${binaryPath}`);
  process.exit(0);
}

console.log('📥 Baixando Ludusavi...');

// Função para tentar download com múltiplas tentativas
function downloadWithRetries(url, outputPath, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`🔗 Tentativa ${i}/${maxRetries}: Baixando de ${url}`);
      
      if (isWindows) {
        // Usar curl.exe explicitamente no Windows
        execSync(`curl.exe -L "${url}" -o "${outputPath}" --retry 3 --retry-delay 2`, { stdio: 'inherit' });
      } else {
        // Para Linux, usar curl com retry
        execSync(`curl -L "${url}" -o "${outputPath}" --retry 3 --retry-delay 2`, { stdio: 'inherit' });
      }
      
      // Verificar se o arquivo foi baixado corretamente
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`📁 Tamanho do arquivo baixado: ${stats.size} bytes`);
        
        if (stats.size > 102400) { // 100KB
          return true;
        } else {
          const content = fs.readFileSync(outputPath, 'utf8');
          console.error('❌ Conteúdo do arquivo baixado (primeiros 200 caracteres):', content.substring(0, 200));
          fs.unlinkSync(outputPath); // Remover arquivo inválido
        }
      }
    } catch (error) {
      console.warn(`⚠️ Tentativa ${i} falhou:`, error.message);
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath); // Remover arquivo parcial
      }
    }
    
    if (i < maxRetries) {
      console.log(`⏳ Aguardando antes da próxima tentativa...`);
      // Esperar um tempo aleatório entre tentativas
      const waitTime = 2000 + Math.random() * 3000;
      execSync(`powershell -Command "Start-Sleep -Milliseconds ${waitTime}"`);
    }
  }
  
  return false;
}

try {
  // Usar uma versão específica conhecida
  const versionTag = 'v0.30.0';
  console.log(`🔍 Usando versão: ${versionTag}`);
  
  // Montar a URL correta com base na versão
  let downloadUrl;
  if (isWindows) {
    downloadUrl = `https://github.com/mtkennerly/ludusavi/releases/download/${versionTag}/ludusavi-${versionTag}-win64.zip`;
  } else {
    downloadUrl = `https://github.com/mtkennerly/ludusavi/releases/download/${versionTag}/ludusavi-${versionTag}-linux.tar.gz`;
  }
  
  console.log(`🔗 Tentando baixar de: ${downloadUrl}`);
  
  if (isWindows) {
    const zipPath = path.join(ludusaviDir, 'ludusavi.zip');
    
    // Tentar download com retries
    const downloadSuccess = downloadWithRetries(downloadUrl, zipPath);
    
    if (!downloadSuccess) {
      throw new Error('Falha ao baixar o arquivo após múltiplas tentativas');
    }
    
    console.log('🔧 Extraindo Ludusavi...');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${ludusaviDir}' -Force"`, { stdio: 'inherit' });
    
    // Procurar o binário em todos os subdiretórios
    const findBinary = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            const result = findBinary(filePath);
            if (result) return result;
          } else if (file === 'ludusavi.exe') {
            return filePath;
          }
        }
      } catch (error) {
        console.warn(`⚠️ Erro ao ler diretório ${dir}:`, error.message);
      }
      return null;
    };
    
    const foundBinary = findBinary(ludusaviDir);
    if (foundBinary) {
      console.log(`📁 Encontrado binário em: ${foundBinary}`);
      fs.renameSync(foundBinary, binaryPath);
    } else {
      // Se não encontrar o binário, tentar copiar qualquer executável
      console.log('🔍 Procurando por executáveis...');
      const findExecutable = (dir) => {
        try {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              const result = findExecutable(filePath);
              if (result) return result;
            } else if (file.toLowerCase().endsWith('.exe')) {
              return filePath;
            }
          }
        } catch (error) {
          console.warn(`⚠️ Erro ao ler diretório ${dir}:`, error.message);
        }
        return null;
      };
      
      const foundExecutable = findExecutable(ludusaviDir);
      if (foundExecutable) {
        console.log(`📁 Encontrado executável em: ${foundExecutable}`);
        fs.renameSync(foundExecutable, binaryPath);
      } else {
        throw new Error('Nenhum executável encontrado após extração');
      }
    }
    
    // Remover arquivos temporários
    fs.unlinkSync(zipPath);
    
    // Remover diretórios temporários (se houver)
    try {
      const items = fs.readdirSync(ludusaviDir);
      for (const item of items) {
        const itemPath = path.join(ludusaviDir, item);
        if (item !== 'ludusavi.exe' && fs.statSync(itemPath).isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Erro ao limpar diretórios temporários:', cleanupError.message);
    }
  } else {
    // Para Linux
    const tarPath = path.join(ludusaviDir, 'ludusavi.tar.gz');
    
    // Tentar download com retries
    const downloadSuccess = downloadWithRetries(downloadUrl, tarPath);
    
    if (!downloadSuccess) {
      throw new Error('Falha ao baixar o arquivo após múltiplas tentativas');
    }
    
    console.log('🔧 Extraindo Ludusavi...');
    execSync(`tar -xzf "${tarPath}" -C "${ludusaviDir}"`, { stdio: 'inherit' });
    
    // Tornar o binário executável
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, 0o755);
    }
    
    // Remover arquivo temporário
    fs.unlinkSync(tarPath);
  }
  
  // Verificar se o binário foi instalado corretamente
  if (fs.existsSync(binaryPath)) {
    console.log(`🎉 Ludusavi instalado com sucesso em: ${binaryPath}`);
  } else {
    throw new Error('Falha ao instalar o binário do Ludusavi');
  }
} catch (error) {
  console.error('❌ Erro ao baixar Ludusavi:', error.message);
  console.log('');
  console.log('💡 Soluções alternativas:');
  console.log('   1. Tente executar o comando novamente');
  console.log('   2. Verifique sua conexão com a internet');
  console.log('   3. Baixe manualmente em: https://github.com/mtkennerly/ludusavi/releases');
  console.log(`   4. Coloque o executável em: ${ludusaviDir}`);
  process.exit(1);
}