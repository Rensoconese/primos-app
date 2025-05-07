import { parseAbi } from 'viem';

/**
 * ABI para contratos ERC721 (NFTs) en formato viem
 */
export const ERC721_ABI = parseAbi([
  // ERC721 Estándar
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  
  // Extensión ERC721Enumerable
  'function totalSupply() view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  
  // Eventos
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)'
])

/**
 * Tipo para el ABI ERC721
 */
export type Erc721Abi = typeof ERC721_ABI
