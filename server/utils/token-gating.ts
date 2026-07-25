import type { H3Event } from 'h3'
import {
  validateErc20Balance,
  validateErc721Ownership,
  toSupportedNetwork,
  type SupportedNetwork,
} from './token-validation'

export interface TokenGatedProject {
  project_id: number
  token_contract: string
  // SQLite returns NULL (not undefined) for unset columns, so these are
  // nullable — checking against `undefined` alone would take the wrong branch.
  token_id?: number | null // For ERC-721
  min_balance?: number | null // For ERC-20
  network: SupportedNetwork
  created_at: string
}

/**
 * Validates if a wallet has access to a token-gated project
 * Supports ERC-20 (balance-based) and ERC-721 (ownership-based)
 */
export async function validateTokenAccess (
  walletAddress: string,
  projectId: number
): Promise<{ hasAccess: boolean; reason?: string }> {
  const db = useDb()
  
  const tokenProject = db.prepare(
    'SELECT * FROM token_gated_projects WHERE project_id = ?'
  ).get(projectId) as TokenGatedProject | undefined
  
  if (!tokenProject) {
    // Not a token-gated project, allow access
    return { hasAccess: true }
  }
  
  const network = toSupportedNetwork(tokenProject.network)

  try {
    if (tokenProject.min_balance != null) {
      // ERC-20 balance check
      const balance = await validateErc20Balance(
        walletAddress,
        tokenProject.token_contract,
        tokenProject.min_balance,
        network
      )

      if (balance >= tokenProject.min_balance) {
        return { hasAccess: true }
      }

      return {
        hasAccess: false,
        reason: `Insufficient balance. Required: ${tokenProject.min_balance} tokens`
      }
    } else if (tokenProject.token_id != null) {
      // ERC-721 ownership check
      const owner = await validateErc721Ownership(
        tokenProject.token_contract,
        tokenProject.token_id,
        network
      )

      if (owner.toLowerCase() === walletAddress.toLowerCase()) {
        return { hasAccess: true }
      }
      
      return { 
        hasAccess: false, 
        reason: 'You do not own the required NFT' 
      }
    }
    
    return { hasAccess: true } // Fallback
  } catch (error) {
    console.error('Token validation error:', error)
    return { 
      hasAccess: false, 
      reason: 'Token validation service unavailable. Please try again later.' 
    }
  }
}

/**
 * Middleware for token-gated access control
 */
export async function tokenGateMiddleware (event: H3Event): Promise<void> {
  const wallet = await getSessionWallet(event)
  const slug = getRouterParam(event, 'slug')!
  const project = getProjectBySlug(slug)
  
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  
  if (wallet) {
    const { hasAccess, reason } = await validateTokenAccess(wallet.wallet_address, project.id)
    
    if (!hasAccess) {
      throw createError({ 
        statusCode: 403, 
        message: reason || 'Access restricted by token requirements' 
      })
    }
  }
}

/**
 * Check if wallet owns a specific NFT (ERC-721)
 */
export async function validateNftOwnership (
  nftContract: string,
  tokenId: string,
  walletAddress: string,
  network: SupportedNetwork = 'ethereum'
): Promise<boolean> {
  try {
    const owner = await validateErc721Ownership(nftContract, BigInt(tokenId), network)
    return owner.toLowerCase() === walletAddress.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Get all token-gated projects for a wallet
 */
export async function getWalletTokenProjects (walletAddress: string): Promise<number[]> {
  const db = useDb()

  const gatedProjects = db.prepare(
    'SELECT project_id FROM token_gated_projects'
  ).all() as { project_id: number }[]

  // Ownership can only be answered by the chain, so each project is checked
  // against the wallet rather than returned unconditionally.
  const results = await Promise.all(
    gatedProjects.map(async ({ project_id }) => {
      const { hasAccess } = await validateTokenAccess(walletAddress, project_id)
      return hasAccess ? project_id : null
    })
  )

  return results.filter((id): id is number => id !== null)
}

/**
 * Add token-gated project configuration
 */
export function addTokenGatedProject (
  projectId: number,
  tokenContract: string,
  network: TokenGatedProject['network'],
  tokenType: 'erc20' | 'erc721',
  value: number
): void {
  const db = useDb()
  
  if (tokenType === 'erc20') {
    db.prepare(`
      INSERT INTO token_gated_projects (project_id, token_contract, min_balance, network)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        token_contract = excluded.token_contract,
        min_balance = excluded.min_balance,
        network = excluded.network
    `).run(projectId, tokenContract, value, network)
  } else {
    db.prepare(`
      INSERT INTO token_gated_projects (project_id, token_contract, token_id, network)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        token_contract = excluded.token_contract,
        token_id = excluded.token_id,
        network = excluded.network
    `).run(projectId, tokenContract, value, network)
  }
}

/**
 * Remove token-gated access from project
 */
export function removeTokenGatedAccess (projectId: number): void {
  const db = useDb()
  db.prepare('DELETE FROM token_gated_projects WHERE project_id = ?').run(projectId)
}
