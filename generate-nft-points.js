#!/usr/bin/env node

/**
 * Script para generar el mapa de puntos de NFTs
 * 
 * Este script ejecuta el generador de mapa de puntos de NFTs.
 * 
 * Uso:
 *   node generate-nft-points.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Cargar variables de entorno desde .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};

// Parsear el archivo .env.local
envFile.split('\n').forEach(line => {
  // Ignorar líneas de comentarios y líneas vacías
  if (line.startsWith('#') || !line.trim()) return;
  
  // Extraer clave y valor
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    envVars[key] = value;
  }
});

// Inicializar cliente Supabase
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Función principal
async function generateNFTPointsMap() {
  try {
    console.log('Iniciando generación del mapa de puntos de NFTs...');
    
    // Primero intentamos obtener de nfts_metadata si existe
    let data = [];
    let error;
    
    // Verificar si la tabla nfts_metadata existe
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'nfts_metadata');
    
    if (tablesError) {
      console.error('Error verificando tablas:', tablesError);
    }
    
    const nftsMetadataExists = tables && tables.length > 0;
    
    if (nftsMetadataExists) {
      console.log('Tabla nfts_metadata encontrada, obteniendo datos...');
      
      // Obtener todos los NFTs con sus metadatos desde nfts_metadata
      const result = await supabase
        .from('nfts_metadata')
        .select('token_id, metadata');
      
      data = result.data || [];
      error = result.error;
    } else {
      console.log('Tabla nfts_metadata no encontrada, obteniendo datos de nfts...');
      
      // Obtener todos los NFTs con sus metadatos desde la tabla nfts
      // Implementar paginación para obtener todos los NFTs (hasta 3000)
      let allData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      console.log('Obteniendo NFTs en lotes de', pageSize);
      
      while (hasMore && page < 3) { // Máximo 3 páginas (3000 NFTs)
        console.log(`Obteniendo lote ${page + 1}...`);
        
        const result = await supabase
          .from('nfts')
          .select('token_id, metadata, rarity, is_shiny, is_z, is_full_set, bonus_points')
          .order('token_id')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (result.error) {
          error = result.error;
          break;
        }
        
        const pageData = result.data || [];
        allData = [...allData, ...pageData];
        
        console.log(`Lote ${page + 1}: ${pageData.length} NFTs obtenidos`);
        
        // Si obtenemos menos registros que el tamaño de página, no hay más datos
        if (pageData.length < pageSize) {
          hasMore = false;
        }
        
        page++;
      }
      
      data = allData;
    }
    
    if (error) {
      throw error;
    }
    
    if (!data || data.length === 0) {
      throw new Error('No se encontraron NFTs en la base de datos');
    }
    
    console.log(`Procesando ${data.length} NFTs...`);
    
    // Mapa para almacenar los puntos calculados
    const pointsMap = {};
    const errorsMap = {};
    
    // Procesar cada NFT
    data.forEach(item => {
      const tokenId = String(item.token_id);
      
      try {
        // Si ya tenemos bonus_points, usamos ese valor directamente
        if (item.bonus_points !== undefined) {
          pointsMap[tokenId] = item.bonus_points;
          return;
        }
        
        const metadata = item.metadata;
        
        // Validar que exista metadata
        if (!metadata || !metadata.attributes) {
          throw new Error(`Metadata inválida o atributos faltantes`);
        }
        
        // Variables para almacenar propiedades
        let rarity = item.rarity;
        let isFullSet = item.is_full_set;
        
        // Si no tenemos rarity o isFullSet directamente, extraerlos de los atributos
        if (rarity === undefined || isFullSet === undefined) {
          // Extraer información relevante de los atributos
          for (const attr of metadata.attributes) {
            // Buscar atributo de rareza
            if (attr.trait_type === 'Rarity') {
              if (typeof attr.value === 'string') {
                rarity = attr.value.toLowerCase();
              } else {
                rarity = String(attr.value);
              }
            }
            // Buscar atributo de Full Set
            else if (attr.trait_type === 'Full Set' && attr.value === true) {
              isFullSet = true;
            }
          }
        }
        
        // Validar que se encontró la rareza
        if (!rarity) {
          throw new Error(`Atributo 'Rarity' no encontrado`);
        }
        
        // Calcular puntos según la rareza
        let bonusPoints;
        if (rarity === 'unique') {
          bonusPoints = 30;
        } else if (rarity === 'shiny z') {
          bonusPoints = 13;
        } else if (rarity === 'shiny') {
          bonusPoints = 7;
        } else if (rarity === 'original z') {
          bonusPoints = 4;
        } else if (rarity === 'original') {
          bonusPoints = 1;
        } else {
          throw new Error(`Rareza desconocida: ${rarity}`);
        }
        
        // Añadir bonificación por Full Set
        if (isFullSet) {
          bonusPoints += 2;
        }
        
        // Guardar en el mapa
        pointsMap[tokenId] = bonusPoints;
      } catch (err) {
        // Registrar error para informar al final
        const errorMsg = err instanceof Error ? err.message : String(err);
        errorsMap[tokenId] = errorMsg;
        console.error(`Error procesando NFT #${tokenId}: ${errorMsg}`);
      }
      
      // Log para monitorear el progreso
      if ((Object.keys(pointsMap).length + Object.keys(errorsMap).length) % 100 === 0) {
        console.log(`Procesados ${Object.keys(pointsMap).length + Object.keys(errorsMap).length} NFTs...`);
      }
    });
    
    // Reportar resultado del procesamiento
    console.log(`Procesamiento completado:`);
    console.log(`- NFTs procesados correctamente: ${Object.keys(pointsMap).length}`);
    console.log(`- NFTs con errores: ${Object.keys(errorsMap).length}`);
    
    if (Object.keys(errorsMap).length > 0) {
      console.log(`\nLista de NFTs con errores:`);
      Object.entries(errorsMap).forEach(([tokenId, errorMsg]) => {
        console.log(`- NFT #${tokenId}: ${errorMsg}`);
      });
      
      // Guardar errores en un archivo para referencia
      fs.writeFileSync(
        './nft-points-errors.json', 
        JSON.stringify(errorsMap, null, 2)
      );
      console.log(`Lista de errores guardada en ./nft-points-errors.json`);
    }
    
    // Crear contenido del archivo TypeScript
    const fileContent = `// Mapa de puntos de NFTs
// Generado automáticamente el ${new Date().toISOString()}
// NO MODIFICAR MANUALMENTE

// Total de NFTs: ${Object.keys(pointsMap).length}

export const NFT_POINTS: Record<string, number> = ${JSON.stringify(pointsMap, null, 2)};

/**
 * Obtiene los puntos de bonificación para un NFT por su ID
 * @param tokenId ID del NFT a consultar
 * @returns Puntos de bonificación del NFT
 * @throws Error si el tokenId no existe en el mapa
 */
export function getNFTPoints(tokenId: string): number {
  const points = NFT_POINTS[tokenId];
  
  if (points === undefined) {
    throw new Error(\`NFT con ID \${tokenId} no encontrado en el mapa de puntos\`);
  }
  
  return points;
}

/**
 * Verifica si un NFT existe en el mapa de puntos
 * @param tokenId ID del NFT a verificar
 * @returns true si el NFT existe en el mapa, false si no
 */
export function hasNFTPoints(tokenId: string): boolean {
  return NFT_POINTS[tokenId] !== undefined;
}

/**
 * Obtiene los puntos de bonificación para un NFT por su ID de forma segura
 * @param tokenId ID del NFT a consultar
 * @param defaultValue Valor por defecto si el NFT no existe en el mapa
 * @returns Puntos de bonificación del NFT o defaultValue si no existe
 */
export function getNFTPointsSafe(tokenId: string, defaultValue: number = 0): number {
  return NFT_POINTS[tokenId] !== undefined ? NFT_POINTS[tokenId] : defaultValue;
}
`;
    
    // Crear directorio si no existe
    const dirPath = path.join(__dirname, 'src', 'data');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Guardar archivo
    fs.writeFileSync(path.join(dirPath, 'nftPoints.ts'), fileContent);
    
    console.log(`\n✅ Mapa de puntos generado exitosamente!`);
    console.log(`- Archivo: ./src/data/nftPoints.ts`);
    
    return {
      success: true,
      totalNFTs: Object.keys(pointsMap).length,
      errorsCount: Object.keys(errorsMap).length
    };
  } catch (error) {
    console.error('Error crítico generando mapa de puntos:', error);
    return {
      success: false,
      error: String(error)
    };
  }
}

// Ejecutar script
generateNFTPointsMap()
  .then(result => {
    console.log('Resultado final:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Error inesperado:', error);
    process.exit(1);
  });
