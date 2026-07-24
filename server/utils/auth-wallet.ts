import type { H3Event } from 'h3'
import { recoverMessageSignature, verifyMessage } from 'viem'

export interface WalletUser {
  id?: number
  wallet_address: string
  chain_id: number
  message: string
  signature: string
  created_at: string
}

export interface SessionWalletUser {
  wallet_address: string
  chain_id: number
}

/**
 * EIP-1193: Wallet RPC provider interface
 * Provides connection to MetaMask and other EVM wallets
 */
export interface WalletProvider {
  connect(): Promise<string>
  disconnect(): void
  onConnect(handler: (address: string) => void): void
  onDisconnect(handler: () => void): void
  getChainId(): Promise<number>
  getAccount(): Promise<string | null>
  signMessage(message: string): Promise<string>
  isConnected(): boolean
}

/**
 * EIP-4361: Sign-in with Ethereum implementation
 * Validates wallet signature against a message
 */
export async function verifyWalletSignature (
  event: H3Event,
  message: string,
  signature: string
): Promise<{ success: boolean; address: string }> {
  try {
    const address = await verifyMessage({
      message,
      signature
    })
    return { success: true, address }
  } catch (error) {
    return { success: false, address: '' }
  }
}

/**
 * Creates a unique login message for EIP-4361 compliance
 */
export function createLoginMessage (address: string, nonce: string): string {
  const domain = 'knowledgebook.app'
  const uri = 'https://knowledgebook.app/login'
  const statement = 'Please sign this message to confirm your identity.'
  const chainId = 1 // Ethereum mainnet (configurable)
  const issuedAt = new Date().toISOString()

  return `${domain} wants you to sign in with your Ethereum account:\n\n${address}\n\n${statement}\nURI: ${uri}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`
}

/**
 * Generates a secure nonce for login messages
 */
export function generateNonce (): string {
  const array = new Uint8Array(32)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    // Fallback for Node.js
    const crypto = require('crypto')
    crypto.randomFillSync(array)
  }
  return Buffer.from(array).toString('hex')
}

/**
 * Stores wallet user in database (extends users table)
 */
export function upsertWalletUser (address: string, chainId: number): number {
  const db = useDb()
  
  // Check if wallet already exists
  const existing = db.prepare('SELECT id FROM wallet_users WHERE wallet_address = ?').get(address) as { id: number } | undefined
  
  if (existing) {
    return existing.id
  }
  
  // Insert new wallet user
  const result = db.prepare(
    'INSERT INTO wallet_users (wallet_address, chain_id, created_at) VALUES (?, ?, datetime("now")) RETURNING id'
  ).get(address, chainId) as { id: number }
  
  return result.id
}

/**
 * Check if wallet is connected to a project
 */
export function isWalletProjectMember (projectId: number, walletAddress: string): boolean {
  return Boolean(useDb()
    .prepare('SELECT 1 FROM wallet_project_members WHERE project_id = ? AND wallet_address = ?')
    .get(projectId, walletAddress))
}

/**
 * Like requireProjectAccess but for wallet users
 */
export async function requireWalletProjectAccess (event: H3Event): Promise<{ wallet: SessionWalletUser, project: any, isAdmin: boolean }> {
  const wallet = await requireWalletUser(event)
  const slug = getRouterParam(event, 'slug')!
  const project = getProjectBySlug(slug)
  
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  
  const isAdmin = project.owner_wallet_address === wallet.wallet_address
  if (!isAdmin && !isWalletProjectMember(project.id, wallet.wallet_address)) {
    throw createError({ statusCode: 403, message: 'You are not a member of this project' })
  }
  
  return { wallet, project, isAdmin }
}

/**
 * Like requireWalletProjectAccess, but only the project admin (owner) passes
 */
export async function requireWalletProjectAdmin (event: H3Event): Promise<{ wallet: SessionWalletUser, project: any }> {
  const { wallet, project, isAdmin } = await requireWalletProjectAccess(event)
  if (!isAdmin) {
    throw createError({ statusCode: 403, message: 'Only the project admin can do this' })
  }
  return { wallet, project }
}

/**
 * Require wallet user session (similar to requireUser for Google OAuth)
 */
export async function requireWalletUser (event: H3Event): Promise<SessionWalletUser> {
  const session = await useSession(event)
  const wallet = session.data.wallet as SessionWalletUser | undefined
  
  if (!wallet) {
    throw createError({ statusCode: 401, message: 'Wallet not connected' })
  }
  
  return wallet
}
