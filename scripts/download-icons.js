#!/usr/bin/env node

/**
 * Script para download e conversão de ícones remotos
 * 
 * Este script faz o download do ícone remoto e gera as versões necessárias
 * para Windows (.ico) e Linux (.png)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import https from 'https';

// Obter o diretório atual do script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório do projeto
const projectRoot = path.join(__dirname, '..');

// URL do ícone remoto (usando tamanho maior para garantir qualidade)
// Para trocar o ícone, atualize a URL abaixo:
const REMOTE_ICON_URL = 'https://img.icons8.com/?size=256&id=6n6UAK58NMvK&format=png&color=000000';

// Diretórios de destino
const publicDir = path.join(projectRoot, 'public');
const resourcesDir = path.join(projectRoot, 'resources');

// Verificar se os diretórios existem, se não, criá-los
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Função para baixar arquivo
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(dest);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Apagar arquivo parcial em caso de erro
      reject(err);
    });
  });
}

// Função para converter PNG para ICO com múltiplas resoluções
async function convertPngToIco(pngPath, icoPath) {
  try {
    // Verificar se o ImageMagick está instalado
    execSync('magick -version', { stdio: 'ignore' });
    
    // Converter usando ImageMagick com múltiplas resoluções
    execSync(`magick "${pngPath}" -define icon:auto-resize=256,128,64,48,32,16 "${icoPath}"`, { stdio: 'inherit' });
    console.log(`✅ ICO criado com sucesso: ${icoPath}`);
    return true;
  } catch (error) {
    console.warn('⚠️ ImageMagick não encontrado. Criando ICO com png-to-ico...');
    
    try {
      // Importar a biblioteca png-to-ico
      const pngToIco = (await import('png-to-ico')).default;
      
      // Criar o ICO com múltiplas resoluções
      const icoBuffer = await pngToIco(pngPath);
      fs.writeFileSync(icoPath, icoBuffer);
      
      console.log(`✅ ICO criado com png-to-ico: ${icoPath}`);
      return true;
    } catch (pngToIcoError) {
      console.error('❌ Falha ao criar ICO com png-to-ico:', pngToIcoError.message);
      
      // Fallback: copiar o PNG como ICO
      try {
        fs.copyFileSync(pngPath, icoPath);
        console.log(`ℹ️ PNG copiado como ICO (sem conversão real): ${icoPath}`);
        return true;
      } catch (copyError) {
        console.error('❌ Falha ao copiar PNG como ICO:', copyError.message);
        return false;
      }
    }
  }
}

console.log('📥 Baixando ícone remoto...');

try {
  // Caminhos dos arquivos
  const pngPath = path.join(publicDir, 'icon.png');
  const icoPath = path.join(publicDir, 'icon.ico');
  
  // Baixar o ícone PNG em alta resolução
  await downloadFile(REMOTE_ICON_URL, pngPath);
  console.log(`✅ PNG baixado com sucesso: ${pngPath}`);
  
  // Criar versão ICO
  await convertPngToIco(pngPath, icoPath);
  
  // Copiar arquivos para o diretório resources também
  fs.copyFileSync(pngPath, path.join(resourcesDir, 'icon.png'));
  fs.copyFileSync(icoPath, path.join(resourcesDir, 'icon.ico'));
  
  // Garantir que os diretórios necessários existam
  const buildDir = path.join(projectRoot, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  
  // Copiar os ícones para o diretório build também (para garantir compatibilidade)
  fs.copyFileSync(pngPath, path.join(buildDir, 'icon.png'));
  fs.copyFileSync(icoPath, path.join(buildDir, 'icon.ico'));
  
  console.log(`🎉 Ícones instalados com sucesso!`);
  console.log(`   PNG: ${pngPath}`);
  console.log(`   ICO: ${icoPath}`);
  
  process.exit(0);
} catch (error) {
  console.error('❌ Erro ao baixar/criar ícones:', error.message);
  process.exit(1);
}