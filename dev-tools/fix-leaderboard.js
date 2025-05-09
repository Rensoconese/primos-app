/**
 * Script para corregir manualmente el leaderboard
 * 
 * Este script verifica y corrige discrepancias entre los tokens reclamados
 * registrados en la tabla 'rewards' y los mostrados en el 'leaderboard'.
 * 
 * Uso:
 * 1. Configurar las variables de entorno de Supabase en un archivo .env
 * 2. Ejecutar: node dev-tools/fix-leaderboard.js [wallet_address]
 *    - Si se proporciona una dirección de wallet, solo se corregirá esa wallet
 *    - Si no se proporciona, se verificarán todas las wallets
 */

// Importar dotenv para cargar variables de entorno
require('dotenv').config();

// Importar Supabase
const { createClient } = require('@supabase/supabase-js');

// Configurar cliente de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Variables de entorno NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Obtiene el total de tokens reclamados para una wallet
 * @param {string} walletAddress - Dirección de la wallet
 * @returns {Promise<number>} - Total de tokens reclamados
 */
async function getTotalClaimedTokens(walletAddress) {
  try {
    const { data, error } = await supabase
      .from('rewards')
      .select('tokens_received')
      .eq('wallet_address', walletAddress.toLowerCase());
      
    if (error) throw error;
    
    // Calcula el total sumando los tokens_received
    const totalClaimed = data.reduce((total, reward) => total + (reward.tokens_received || 0), 0);
    
    return totalClaimed;
  } catch (err) {
    console.error(`Error obteniendo tokens reclamados para ${walletAddress}:`, err);
    return 0;
  }
}

/**
 * Obtiene el valor actual de tokens_claimed en el leaderboard
 * @param {string} walletAddress - Dirección de la wallet
 * @returns {Promise<number|null>} - Valor actual o null si no existe
 */
async function getCurrentLeaderboardValue(walletAddress) {
  try {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('tokens_claimed')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return null;
      }
      throw error;
    }
    
    return data.tokens_claimed;
  } catch (err) {
    console.error(`Error obteniendo valor del leaderboard para ${walletAddress}:`, err);
    return null;
  }
}

/**
 * Actualiza el valor de tokens_claimed en el leaderboard
 * @param {string} walletAddress - Dirección de la wallet
 * @param {number} tokensValue - Nuevo valor de tokens_claimed
 * @returns {Promise<boolean>} - true si se actualizó correctamente
 */
async function updateLeaderboard(walletAddress, tokensValue) {
  try {
    const { error } = await supabase
      .from('leaderboard')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        tokens_claimed: tokensValue,
        updated_at: new Date().toISOString()
      }, { onConflict: 'wallet_address' });
      
    if (error) throw error;
    
    return true;
  } catch (err) {
    console.error(`Error actualizando leaderboard para ${walletAddress}:`, err);
    return false;
  }
}

/**
 * Verifica y corrige el leaderboard para una wallet específica
 * @param {string} walletAddress - Dirección de la wallet
 */
async function fixLeaderboardForWallet(walletAddress) {
  console.log(`\nVerificando wallet: ${walletAddress}`);
  
  // Obtener el total de tokens reclamados
  const totalClaimed = await getTotalClaimedTokens(walletAddress);
  console.log(`Total de tokens reclamados en tabla 'rewards': ${totalClaimed}`);
  
  // Obtener el valor actual en el leaderboard
  const currentValue = await getCurrentLeaderboardValue(walletAddress);
  console.log(`Valor actual en 'leaderboard': ${currentValue !== null ? currentValue : 'No existe'}`);
  
  // Verificar si hay discrepancia
  if (currentValue === null) {
    console.log(`Creando nueva entrada en el leaderboard para ${walletAddress}`);
    const success = await updateLeaderboard(walletAddress, totalClaimed);
    if (success) {
      console.log(`✅ Entrada creada correctamente con tokens_claimed = ${totalClaimed}`);
    } else {
      console.log(`❌ Error al crear entrada`);
    }
  } else if (currentValue !== totalClaimed) {
    console.log(`Discrepancia detectada: leaderboard=${currentValue}, actual=${totalClaimed}`);
    const success = await updateLeaderboard(walletAddress, totalClaimed);
    if (success) {
      console.log(`✅ Valor corregido a ${totalClaimed}`);
    } else {
      console.log(`❌ Error al corregir valor`);
    }
  } else {
    console.log(`✅ Valores coinciden, no se requiere corrección`);
  }
}

/**
 * Verifica y corrige el leaderboard para todas las wallets
 */
async function fixAllLeaderboards() {
  console.log('Obteniendo todas las wallets con recompensas...');
  
  // Obtener todas las wallets distintas de la tabla rewards
  const { data: wallets, error } = await supabase
    .from('rewards')
    .select('wallet_address')
    .order('wallet_address')
    .limit(1000);
    
  if (error) {
    console.error('Error obteniendo wallets:', error);
    return;
  }
  
  // Eliminar duplicados
  const uniqueWallets = [...new Set(wallets.map(w => w.wallet_address.toLowerCase()))];
  console.log(`Se encontraron ${uniqueWallets.length} wallets únicas con recompensas`);
  
  // Procesar cada wallet
  for (const wallet of uniqueWallets) {
    await fixLeaderboardForWallet(wallet);
  }
  
  console.log('\nProceso completado');
}

// Función principal
async function main() {
  const walletAddress = process.argv[2];
  
  if (walletAddress) {
    await fixLeaderboardForWallet(walletAddress);
  } else {
    await fixAllLeaderboards();
  }
  
  // Cerrar la conexión
  process.exit(0);
}

// Ejecutar la función principal
main().catch(err => {
  console.error('Error en el script:', err);
  process.exit(1);
});
