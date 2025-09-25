import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

// Lista de wallets autorizadas
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6', // RENSO_WALLET
  '0x66BE3123Fdf641070f8834Fbe66803C8559255f6', // ADMIN_WALLET
].map(addr => addr.toLowerCase());

// Mapeo de rarezas válidas
const VALID_RARITIES = {
  'original': 'original',
  'original z': 'original Z',
  'original z summer': 'original Z summer',
  'shiny': 'shiny',
  'shiny z': 'shiny Z',
  'shiny z summer': 'shiny Z summer',
  'unique': 'unique'
};

export async function POST(request: Request) {
  try {
    // DEBUG: Verificar token inmediatamente - FORZAR RECOMPILACION
    const envToken = process.env.GITHUB_TOKEN;
    console.log('🔍 DEBUG UPDATE-NFT-RARITY - Token check:');
    console.log('  - Existe:', !!envToken);
    console.log('  - Length:', envToken?.length);
    console.log('  - Starts with:', envToken?.substring(0, 15));
    console.log('  - Timestamp:', new Date().toISOString());
    
    // Verificar autorización
    const authHeader = request.headers.get('authorization');
    const adminWallet = authHeader?.replace('Bearer ', '').toLowerCase();

    if (!adminWallet || !AUTHORIZED_ADMINS.includes(adminWallet)) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tokenId, newRarity } = body;

    // Validaciones
    if (!tokenId || typeof tokenId !== 'number' || tokenId < 1 || tokenId > 3000) {
      return NextResponse.json(
        { error: 'Token ID inválido. Debe ser un número entre 1 y 3000.' },
        { status: 400 }
      );
    }

    const normalizedRarity = newRarity?.toLowerCase();
    if (!normalizedRarity || !VALID_RARITIES[normalizedRarity]) {
      return NextResponse.json(
        { error: 'Rareza inválida. Valores permitidos: ' + Object.values(VALID_RARITIES).join(', ') },
        { status: 400 }
      );
    }

    const finalRarity = VALID_RARITIES[normalizedRarity];

    console.log(`🔄 Actualizando NFT #${tokenId} a rareza: ${finalRarity}`);

    // Configurar Octokit para GitHub
    const githubToken = process.env.GITHUB_TOKEN;
    console.log('🔑 GitHub Token presente:', !!githubToken);
    console.log('🔑 Token length:', githubToken?.length);
    console.log('🔑 Token prefix:', githubToken?.substring(0, 10) + '...');
    
    if (!githubToken) {
      console.error('❌ GITHUB_TOKEN no configurado');
      return NextResponse.json(
        { error: 'GitHub token no configurado' },
        { status: 500 }
      );
    }

    const octokit = new Octokit({
      auth: githubToken.trim(), // Asegurar que no haya espacios
    });

    const owner = 'Rensoconese';
    const repo = 'primos-app';
    const path = 'src/data/nftMappings.ts';

    // Obtener el archivo actual de GitHub
    console.log('📥 Descargando archivo nftMappings.ts desde GitHub...');
    
    let fileContent: string;
    let fileSha: string;
    
    try {
      // Primero intentamos obtener el archivo normalmente
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: 'main',
      });

      if ('content' in data && !Array.isArray(data)) {
        // Si el archivo es pequeño, el contenido viene directamente
        if (data.content) {
          fileContent = Buffer.from(data.content, 'base64').toString('utf-8');
        } else {
          // Si el archivo es grande (>1MB), usamos la API de blobs
          console.log('📦 Archivo grande detectado, usando blob API...');
          const blobResponse = await octokit.rest.git.getBlob({
            owner,
            repo,
            file_sha: data.sha,
          });
          fileContent = Buffer.from(blobResponse.data.content, 'base64').toString('utf-8');
        }
        fileSha = data.sha;
        console.log('✅ Archivo descargado exitosamente');
      } else {
        throw new Error('No se pudo obtener el contenido del archivo');
      }
    } catch (error: any) {
      console.error('❌ Error descargando archivo:', error.message);
      return NextResponse.json(
        { error: 'No se pudo obtener el archivo desde GitHub' },
        { status: 500 }
      );
    }

    // Buscar y actualizar el NFT - MÉTODO ULTRA SIMPLE
    console.log(`🔍 Buscando NFT #${tokenId} en el archivo...`);
    
    // Buscar dónde empieza el array
    const arrayStart = fileContent.indexOf('export const NFT_MAPPINGS: NFTMapping[] = ') + 'export const NFT_MAPPINGS: NFTMapping[] = '.length;
    
    // Buscar dónde termina el array (puede ser ] o ];)
    let arrayEnd = fileContent.indexOf('\n]', arrayStart);
    const hasSemicolon = fileContent[arrayEnd + 2] === ';';
    
    if (arrayStart === -1 || arrayEnd === -1) {
      return NextResponse.json(
        { error: 'Formato de archivo inválido' },
        { status: 500 }
      );
    }
    
    // Extraer solo el array JSON (incluir el ])
    const jsonString = fileContent.substring(arrayStart, arrayEnd + 2);
    
    // Parsear el JSON
    let nftMappings: any[];
    try {
      nftMappings = JSON.parse(jsonString);
    } catch (error) {
      console.error('Error parseando JSON:', error);
      return NextResponse.json(
        { error: 'Error al parsear el archivo' },
        { status: 500 }
      );
    }
    
    // Buscar el NFT específico
    const nftIndex = nftMappings.findIndex(nft => nft.token_id === tokenId);
    
    if (nftIndex === -1) {
      return NextResponse.json(
        { error: `NFT #${tokenId} no encontrado en el archivo` },
        { status: 404 }
      );
    }
    
    const oldRarity = nftMappings[nftIndex].rarity;
    
    // Si la rareza es la misma, no hacer nada
    if (oldRarity === finalRarity) {
      console.log(`ℹ️ NFT #${tokenId} ya tiene la rareza ${finalRarity}`);
      return NextResponse.json({
        success: true,
        message: `NFT #${tokenId} ya tiene la rareza ${finalRarity}`,
        tokenId,
        rarity: finalRarity,
        unchanged: true
      });
    }
    
    // Actualizar la rareza
    nftMappings[nftIndex].rarity = finalRarity;
    
    // Reconstruir el archivo completo
    const updatedJson = JSON.stringify(nftMappings, null, 2);
    const afterArray = hasSemicolon ? fileContent.substring(arrayEnd + 3) : fileContent.substring(arrayEnd + 2);
    const updatedContent = fileContent.substring(0, arrayStart) + updatedJson + (hasSemicolon ? ';' : '') + afterArray;

    // Verificar que el reemplazo funcionó
    if (updatedContent === fileContent) {
      console.error('❌ No se pudo actualizar el archivo');
      return NextResponse.json(
        { error: 'Error al actualizar el archivo' },
        { status: 500 }
      );
    }

    console.log(`✅ NFT #${tokenId}: ${oldRarity} → ${finalRarity}`);

    // Hacer commit a GitHub
    console.log('📤 Subiendo cambios a GitHub...');
    
    try {
      const commitMessage = `fix: Actualizar NFT #${tokenId} de ${oldRarity} a ${finalRarity}

Admin: ${adminWallet}
Timestamp: ${new Date().toISOString()}

🤖 Generated with [Claude Code](https://claude.ai/code)`;

      const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: commitMessage,
        content: Buffer.from(updatedContent).toString('base64'),
        sha: fileSha,
        branch: 'main',
      });

      console.log('✅ Commit exitoso:', commitData.commit.sha);

      return NextResponse.json({
        success: true,
        message: `NFT #${tokenId} actualizado exitosamente`,
        tokenId,
        oldRarity,
        newRarity: finalRarity,
        githubCommit: commitData.commit.sha,
        commitUrl: commitData.commit.html_url
      });

    } catch (error: any) {
      console.error('❌ Error haciendo commit:', error.message);
      return NextResponse.json(
        { error: 'Error al guardar cambios en GitHub' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error en update-nft-rarity:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}