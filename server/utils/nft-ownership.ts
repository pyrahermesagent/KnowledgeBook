import { validateErc721Ownership } from './token-validation'

export interface NftOwnershipRecord {
  project_id: number
  nft_contract: string
  nft_token_id: number
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base'
  owner_address: string
  granted_at: string
}

/**
 * Checks if wallet owns the NFT required for project ownership
 * This is the CRITICAL Web3 feature - NFT-based project ownership
 */
export async function validateNftProjectOwnership (
  projectId: number,
  walletAddress: string
): Promise<{ ownsProject: boolean; nft: NftOwnershipRecord | null }> {
  const db = useDb()
  
  const nftRecord = db.prepare(`
    SELECT * FROM nft_project_ownership 
    WHERE project_id = ?
  `).get(projectId) as NftOwnershipRecord | undefined
  
  if (!nftRecord) {
    // No NFT ownership requirement for this project
    return { ownsProject: false, nft: null }
  }
  
  try {
    const actualOwner = await validateErc721Ownership(
      nftRecord.nft_contract,
      nftRecord.nft_token_id,
      walletAddress
    )
    
    const owns = actualOwner.toLowerCase() === walletAddress.toLowerCase()
    
    return { ownsProject: owns, nft: nftRecord }
  } catch (error) {
    console.error(`NFT validation failed for project ${projectId}:`, error)
    return { ownsProject: false, nft: nftRecord }
  }
}

/**
 * Transfers project ownership via NFT ownership
 * Only the NFT owner can transfer project ownership
 */
export async function transferProjectOwnershipViaNft (
  projectId: number,
  fromWallet: string,
  toWallet: string
): Promise<{ success: boolean; error?: string }> {
  const db = useDb()
  
  // Verify fromWallet owns the NFT
  const { ownsProject, nft } = await validateNftProjectOwnership(projectId, fromWallet)
  
  if (!ownsProject || !nft) {
    return { 
      success: false, 
      error: 'You do not own the required NFT to transfer this project' 
    }
  }
  
  // Verify toWallet has a wallet user record (or create one)
  db.prepare(`
    INSERT OR IGNORE INTO wallet_users (wallet_address, chain_id, created_at)
    VALUES (?, 1, datetime('now'))
  `).run(toWallet)
  
  // Update project ownership
  db.prepare(`
    UPDATE projects 
    SET owner_wallet_address = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(toWallet, projectId)
  
  return { success: true }
}

/**
 * Adds NFT-based ownership requirement to a project
 */
export function addNftProjectOwnership (
  projectId: number,
  nftContract: string,
  nftTokenId: number,
  network: 'ethereum' | 'polygon' | 'arbitrum' | 'base',
  ownerAddress: string
): void {
  const db = useDb()
  
  // Check if NFT ownership already exists
  const existing = db.prepare(`
    SELECT 1 FROM nft_project_ownership 
    WHERE project_id = ? AND nft_contract = ?
  `).get(projectId, nftContract) as { 1: number } | undefined
  
  if (existing) {
    db.prepare(`
      UPDATE nft_project_ownership 
      SET nft_token_id = ?, network = ?, owner_address = ?, granted_at = datetime('now')
      WHERE project_id = ? AND nft_contract = ?
    `).run(nftTokenId, network, ownerAddress, projectId, nftContract)
  } else {
    db.prepare(`
      INSERT INTO nft_project_ownership (project_id, nft_contract, nft_token_id, network, owner_address, granted_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(projectId, nftContract, nftTokenId, network, ownerAddress)
  }
}

/**
 * Removes NFT-based ownership from project
 */
export function removeNftProjectOwnership (projectId: number): void {
  const db = useDb()
  db.prepare('DELETE FROM nft_project_ownership WHERE project_id = ?').run(projectId)
}

/**
 * Gets all projects owned via NFT for a wallet
 */
export function getNftOwnedProjects (walletAddress: string): number[] {
  const db = useDb()
  
  const projects = db.prepare(`
    SELECT project_id FROM nft_project_ownership 
    WHERE owner_address = ?
  `).all(walletAddress) as { project_id: number }[]
  
  return projects.map(p => p.project_id)
}

/**
 * Validates wallet owns NFT and has project access
 * Combined check for NFT-gated access control
 */
export async function validateNftAccess (
  projectId: number,
  walletAddress: string
): Promise<{ hasAccess: boolean; reason?: string }> {
  const { ownsProject, nft } = await validateNftProjectOwnership(projectId, walletAddress)
  
  if (ownsProject) {
    return { hasAccess: true }
  }
  
  if (nft) {
    return { 
      hasAccess: false, 
      reason: `You must own NFT #${nft.nft_token_id} on ${nft.network} to access this project` 
    }
  }
  
  // Project doesn't require NFT ownership
  return { hasAccess: true }
}

/**
 * Middleware for NFT-gated project access
 */
export async function nftGateMiddleware (event: H3Event): Promise<void> {
  const wallet = await useSession(event).data.wallet as { wallet_address: string } | undefined
  const slug = getRouterParam(event, 'slug')!
  const project = getProjectBySlug(slug)
  
  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  
  if (wallet) {
    const { hasAccess, reason } = await validateNftAccess(project.id, wallet.wallet_address)
    
    if (!hasAccess) {
      throw createError({ 
        statusCode: 403, 
        message: reason || 'Project access restricted by NFT ownership' 
      })
    }
  }
}
