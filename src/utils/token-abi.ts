// ABI para el token ERC1155 Fire Dust
export const FireDustABI = [
    // Funciones de lectura
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function uri(uint256 tokenId) view returns (string)",
    "function balanceOf(address account, uint256 id) view returns (uint256)",
    "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
    "function isApprovedForAll(address account, address operator) view returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function totalSupply(uint256 id) view returns (uint256)",
    
    // Funciones de escritura
    "function setApprovalForAll(address operator, bool approved)",
    "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
    "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)",
    
    // Funciones de administración (roles)
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function getRoleAdmin(bytes32 role) view returns (bytes32)",
    "function grantRole(bytes32 role, address account)",
    "function revokeRole(bytes32 role, address account)",
    "function MINTER_ROLE() view returns (bytes32)",
    
    // Funciones de acuñación
    "function mint(address account, uint256 id, uint256 amount, bytes data)",
    "function mintBatch(address to, uint256[] ids, uint256[] amounts, bytes data)",
    
    // Eventos
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
    "event ApprovalForAll(address indexed account, address indexed operator, bool approved)"
  ];