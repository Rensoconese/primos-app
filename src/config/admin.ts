/**
 * Configuración del panel de administración
 */

// Lista de wallets autorizadas (wallets oficiales del equipo)
const AUTHORIZED_ADMINS = [
  '0xce6818326aa1db5641528d11f3121a7f84b53eff', // PRIMOS_WALLET_ADDRESS
  '0xc1b977a826b75a87b5423bbe952104bcee885315', // MONSAI_WALLET_ADDRESS  
  '0x0Fc67932d60aB6194d3B93feF2d76B1e3A7d43dF', // POOL_WALLET_ADDRESS
  '0xf9970b9d5D6a9b0E2a1bD69A880B302941b126E6'  // RENSO_WALLET_ADDRESS
];

// Normalizar todas las wallets a lowercase
export const ADMIN_WALLETS = AUTHORIZED_ADMINS.map(addr => addr.toLowerCase());

// Función helper para verificar si una wallet está autorizada
export const isAdminWallet = (address: string | null): boolean => {
  if (!address) return false;
  
  // Comparación case-insensitive
  const normalizedAddress = address.toLowerCase();
  const isAdmin = ADMIN_WALLETS.includes(normalizedAddress);
  
  // Debug log
  console.log('isAdminWallet check:', {
    address,
    normalizedAddress,
    isAdmin
  });
  
  return isAdmin;
};