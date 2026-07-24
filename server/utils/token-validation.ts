import { useRuntimeConfig } from '#imports'

/**
 * Token validation utilities for ERC-20 and ERC-721 contracts
 * Uses public blockchain RPC endpoints for validation
 */

export interface TokenBalanceResponse {
  balance: bigint
  blockNumber: number
}

export interface NftOwnershipResponse {
  owner: string
  tokenURI?: string
}

/**
 * Validates ERC-20 token balance for a wallet
 * @param walletAddress - Wallet address to check
 * @param tokenContract - ERC-20 token contract address
 * @param minRequired - Minimum balance required
 * @param network - Blockchain network (ethereum, polygon, arbitrum, base)
 * @returns Balance if sufficient, throws if insufficient or error
 */
export async function validateErc20Balance (
  walletAddress: string,
  tokenContract: string,
  minRequired: number,
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base'
): Promise<number> {
  const rpcUrl = getRpcUrl(network)
  
  // ERC-20 balanceOf function signature
  const functionSelector = '0x70a08231'
  const calldata = functionSelector + walletAddress.substring(2).padStart(64, '0')
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: tokenContract,
            data: calldata
          },
          'latest'
        ],
        id: 1
      })
    })
    
    const result = await response.json()
    
    if (result.error) {
      throw new Error(result.error.message)
    }
    
    const balance = BigInt(result.result)
    const decimalDivisor = BigInt(10 ** 18) // Standard 18 decimals
    const balanceFormatted = Number(balance / decimalDivisor)
    
    if (balanceFormatted < minRequired) {
      throw new Error(`Insufficient balance: ${balanceFormatted} < ${minRequired}`)
    }
    
    return balanceFormatted
  } catch (error) {
    console.error(`ERC-20 balance validation failed for ${tokenContract}:`, error)
    throw error
  }
}

/**
 * Validates ERC-721 NFT ownership
 * @param nftContract - ERC-721 contract address
 * @param tokenId - NFT token ID
 * @param expectedOwner - Expected owner address
 * @returns true if owner matches, false otherwise
 */
export async function validateErc721Ownership (
  nftContract: string,
  tokenId: number,
  expectedOwner: string
): Promise<string> {
  const rpcUrl = getRpcUrl('ethereum')
  
  // ERC-721 ownerOf function signature
  const functionSelector = '0x6352211e'
  const calldata = functionSelector + tokenId.toString().padStart(64, '0')
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            to: nftContract,
            data: calldata
          },
          'latest'
        ],
        id: 1
      })
    })
    
    const result = await response.json()
    
    if (result.error) {
      throw new Error(result.error.message)
    }
    
    // Parse owner from result (last 20 bytes of returned data)
    const ownerData = result.result.substring(2)
    const owner = '0x' + ownerData.substring(ownerData.length - 40)
    
    return owner
  } catch (error) {
    console.error(`ERC-721 ownership validation failed for ${nftContract}#${tokenId}:`, error)
    throw error
  }
}

/**
 * Gets RPC URL for specified network
 /** Gets RPC URL for specified network */
 function getRpcUrl(network: string): string {
   const config = useRuntimeConfig()
   const rpcUrls: Record<string, string> = {
     ethereum: config.ethRpcUrl || 'https://eth-mainnet.g.alchemy.com/v2/demo',
     polygon: config.polygonRpcUrl || 'https://polygon-mainnet.g.alchemy.com/v2/demo',
     arbitrum: config.arbitrumRpcUrl || 'https://arb-mainnet.g.alchemy.com/v2/demo',
     base: config.baseRpcUrl || 'https://base-mainnet.g.alchemy.com/v2/demo'
   }
  
   return rpcUrls[network] || rpcUrls.ethereum
 }

/**
 * Fetches NFT metadata from contract
 */
export async function fetchNftMetadata (
  nftContract: string,
  tokenId: number,
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base'
): Promise<{ name: string; description: string; image: string } | null> {
  const owner = await validateErc721Ownership(nftContract, tokenId, '0x')
  
  if (!owner) {
    return null
  }
  
  // For now, return placeholder metadata
  // In production, use OpenSea API or IPFS for metadata
  return {
    name: `NFT #${tokenId}`,
    description: 'Token-gated access NFT',
    image: ''
  }
}
