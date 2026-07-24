import { validateErc20Balance, validateErc721Ownership } from './token-validation'

export interface TokenGatedProject {
  project_id: number
  token_contract: string
  token_id?: number // For ERC-721
  min_balance?: number // For ERC-20
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base'
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
  
  try {
    if (tokenProject.min_balance !== undefined) {
      // ERC-20 balance check
      const balance = await validateErc20Balance(
        walletAddress,
        tokenProject.token_contract,
        tokenProject.min_balance,
        tokenProject.network
      )
      
      if (balance >= tokenProject.min_balance) {
        return { hasAccess: true }
      }
      
      return { 
        hasAccess: false, 
        reason: `Insufficient balance. Required: ${tokenProject.min_balance} tokens` 
      }
    } else if (tokenProject.token_id !== undefined) {
      // ERC-721 ownership check
      const owner = await validateErc721Ownership(
        tokenProject.token_contract,
        tokenProject.token_id,
        walletAddress
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
  const wallet = await useSession(event).data.wallet as { wallet_address: string } | undefined
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
  walletAddress: string
): Promise<boolean> {
  try {
    const owner = await validateErc721Ownership(nftContract, parseInt(tokenId), walletAddress)
    return owner.toLowerCase() === walletAddress.toLowerCase()
  } catch {
    return false
  }
}

/**
 * Get all token-gated projects for a wallet
 */
export function getWalletTokenProjects (walletAddress: string): number[] {
  const db = useDb()
  
  // Get projects where wallet has ERC-20 balance
  const erc20Projects = db.prepare(`
    SELECT tgp.project_id 
    FROM token_gated_projects tgp
    WHERE tgp.min_balance IS NOT NULL
  `).all() as { project_id: number }[]
  
  // Get projects where wallet owns NFT
  const nftProjects = db.prepare(`
    SELECT tgp.project_id 
    FROM token_gated_projects tgp
    WHERE tgp.token_id IS NOT NULL
  `).all() as { project_id: number }[]
  
  // TODO: Filter by actual wallet balance/ownership
  return [...new Set([...erc20Projects, ...nftProjects].map(p => p.project_id))]
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
