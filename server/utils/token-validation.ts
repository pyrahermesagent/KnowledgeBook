import { isAddress, getAddress } from 'viem';
import { useRuntimeConfig } from '#imports';

/**
 * Token validation utilities for ERC-20 and ERC-721 contracts
 * Uses public blockchain RPC endpoints for validation
 */

export type SupportedNetwork = 'ethereum' | 'polygon' | 'arbitrum' | 'base';

const SUPPORTED_NETWORKS: SupportedNetwork[] = ['ethereum', 'polygon', 'arbitrum', 'base'];

export interface TokenBalanceResponse {
  balance: bigint;
  blockNumber: number;
}

export interface NftOwnershipResponse {
  owner: string;
  tokenURI?: string;
}

/**
 * Validates and checksums an address before it is interpolated into calldata
 * or an RPC request body.
 *
 * Everything reaching these helpers is ultimately user-supplied (contract
 * addresses come from project config, wallet addresses from the session), so
 * they are rejected here rather than forwarded to an external RPC endpoint.
 */
function assertAddress(value: string, label: string): `0x${string}` {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
  return getAddress(value);
}

/**
 * Encode a uint256 argument as a 32-byte big-endian hex word.
 */
function encodeUint256(value: bigint): string {
  if (value < 0n) {
    throw new Error(`Invalid uint256 value: ${value}`);
  }
  return value.toString(16).padStart(64, '0');
}

/**
 * Encode an address argument as a 32-byte left-padded hex word.
 */
function encodeAddress(address: `0x${string}`): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Perform an eth_call against the network's RPC endpoint.
 */
async function ethCall(
  network: SupportedNetwork,
  to: `0x${string}`,
  data: string
): Promise<string> {
  const rpcUrl = getRpcUrl(network);

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (typeof result.result !== 'string' || !result.result.startsWith('0x')) {
    throw new Error('Malformed RPC response');
  }

  return result.result;
}

/**
 * Reads the ERC-20 decimals(), falling back to the 18 used by most tokens
 * when the contract does not implement it.
 */
async function getErc20Decimals(
  tokenContract: `0x${string}`,
  network: SupportedNetwork
): Promise<number> {
  try {
    // decimals()
    const raw = await ethCall(network, tokenContract, '0x313ce567');
    if (raw === '0x') return 18;
    const decimals = Number(BigInt(raw));
    return decimals >= 0 && decimals <= 77 ? decimals : 18;
  } catch {
    return 18;
  }
}

/**
 * Reads a wallet's ERC-20 balance, scaled by the token's decimals.
 *
 * Returns the balance rather than throwing when it is below `minRequired`: an
 * insufficient balance is an expected answer, and callers need to tell it apart
 * from an RPC failure so they do not report a denial as an outage. Throws only
 * on invalid input or an unreachable/erroring endpoint.
 *
 * @param walletAddress - Wallet address to check
 * @param tokenContract - ERC-20 token contract address
 * @param minRequired - Minimum balance the caller intends to compare against
 * @param network - Blockchain network (ethereum, polygon, arbitrum, base)
 * @returns The wallet's balance in whole tokens
 */
export async function validateErc20Balance(
  walletAddress: string,
  tokenContract: string,
  minRequired: number,
  network: SupportedNetwork
): Promise<number> {
  const wallet = assertAddress(walletAddress, 'wallet address');
  const contract = assertAddress(tokenContract, 'token contract address');

  // ERC-20 balanceOf(address)
  const calldata = '0x70a08231' + encodeAddress(wallet);

  try {
    const raw = await ethCall(network, contract, calldata);
    const balance = BigInt(raw);
    const decimals = await getErc20Decimals(contract, network);
    const divisor = 10n ** BigInt(decimals);

    // Scale via Number division rather than BigInt division, which would floor
    // a 9.9-token balance to 9 before the caller ever sees it.
    return Number(balance) / Number(divisor);
  } catch (error) {
    console.error(`ERC-20 balance validation failed for ${contract}:`, error);
    throw error;
  }
}

/**
 * Validates ERC-721 NFT ownership
 * @param nftContract - ERC-721 contract address
 * @param tokenId - NFT token ID
 * @param network - Blockchain network the contract is deployed on
 * @returns The current owner address, lowercased
 */
export async function validateErc721Ownership(
  nftContract: string,
  tokenId: number | bigint | string,
  network: SupportedNetwork = 'ethereum'
): Promise<string> {
  const contract = assertAddress(nftContract, 'NFT contract address');
  const id = BigInt(tokenId);

  // ERC-721 ownerOf(uint256). The token ID must be hex-encoded — encoding the
  // decimal digits instead would query a completely different token.
  const calldata = '0x6352211e' + encodeUint256(id);

  try {
    const raw = await ethCall(network, contract, calldata);
    const ownerData = raw.slice(2);

    if (ownerData.length < 40) {
      throw new Error('Malformed ownerOf response');
    }

    // Owner is the last 20 bytes of the returned word
    return '0x' + ownerData.slice(-40).toLowerCase();
  } catch (error) {
    console.error(`ERC-721 ownership validation failed for ${contract}#${id}:`, error);
    throw error;
  }
}

/**
 * Gets RPC URL for specified network
 */
export function getRpcUrl(network: string): string {
  const config = useRuntimeConfig();
  const rpcUrls: Record<string, string> = {
    ethereum: config.ethRpcUrl || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    polygon: config.polygonRpcUrl || 'https://polygon-mainnet.g.alchemy.com/v2/demo',
    arbitrum: config.arbitrumRpcUrl || 'https://arb-mainnet.g.alchemy.com/v2/demo',
    base: config.baseRpcUrl || 'https://base-mainnet.g.alchemy.com/v2/demo',
  };

  return rpcUrls[network] || rpcUrls.ethereum;
}

/**
 * Narrows an arbitrary string to a supported network, defaulting to ethereum.
 */
export function toSupportedNetwork(network: string | undefined): SupportedNetwork {
  return SUPPORTED_NETWORKS.includes(network as SupportedNetwork)
    ? (network as SupportedNetwork)
    : 'ethereum';
}

/**
 * Fetches NFT metadata from contract
 */
export async function fetchNftMetadata(
  nftContract: string,
  tokenId: number,
  network: SupportedNetwork
): Promise<{ name: string; description: string; image: string } | null> {
  const owner = await validateErc721Ownership(nftContract, tokenId, network);

  if (!owner) {
    return null;
  }

  // For now, return placeholder metadata
  // In production, use OpenSea API or IPFS for metadata
  return {
    name: `NFT #${tokenId}`,
    description: 'Token-gated access NFT',
    image: '',
  };
}
