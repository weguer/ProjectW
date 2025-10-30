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

try {
  // Usar curl ou wget para baixar o Ludusavi
  if (isWindows) {
    // No Windows, usar PowerShell para baixar
    const downloadUrl = 'https://github.com/mtkennerly/ludusavi/releases/latest/download/ludusavi-v0.29.1-win64.zip';
    const zipPath = path.join(ludusaviDir, 'ludusavi.zip');
    
    console.log(`🔗 Baixando de: ${downloadUrl}`);
    execSync(`powershell -Command "Invoke-WebRequest -Uri '${downloadUrl}' -OutFile '${zipPath}'"`, { stdio: 'inherit' });
    
    console.log('🔧 Extraindo...');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${ludusaviDir}' -Force"`, { stdio: 'inherit' });
    
    // Mover o binário para o local correto
    const extractedBinary = path.join(ludusaviDir, 'ludusavi.exe');
    if (fs.existsSync(extractedBinary)) {
      fs.renameSync(extractedBinary, binaryPath);
    } else {
      // Tentar encontrar o binário em qualquer lugar da pasta
      const findBinary = (dir) => {
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
        return null;
      };
      
      const foundBinary = findBinary(ludusaviDir);
      if (foundBinary) {
        fs.renameSync(foundBinary, binaryPath);
      }
    }
    
    // Remover arquivos temporários
    fs.rmSync(path.join(ludusaviDir, 'ludusavi'), { recursive: true, force: true });
    fs.unlinkSync(zipPath);
  } else {
    // No Linux, usar curl
    const downloadUrl = 'https://github.com/mtkennerly/ludusavi/releases/latest/download/ludusavi-v0.29.1-linux.tar.gz';
    const tarPath = path.join(ludusaviDir, 'ludusavi.tar.gz');
    
    console.log(`🔗 Baixando de: ${downloadUrl}`);
    execSync(`curl -L "${downloadUrl}" -o "${tarPath}"`, { stdio: 'inherit' });
    
    console.log('🔧 Extraindo...');
    execSync(`tar -xzf "${tarPath}" -C "${ludusaviDir}"`, { stdio: 'inherit' });
    
    // Tornar o binário executável
    if (fs.existsSync(binaryPath)) {
      fs.chmodSync(binaryPath, 0o755);
    }
    
    // Remover arquivo temporário
    fs.unlinkSync(tarPath);
  }
  
  console.log(`🎉 Ludusavi instalado com sucesso em: ${binaryPath}`);
} catch (error) {
  console.error('❌ Erro ao baixar Ludusavi:', error.message);
  process.exit(1);
}