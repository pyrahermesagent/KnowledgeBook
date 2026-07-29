import {
  validateErc721Ownership,
  toSupportedNetwork,
  type SupportedNetwork,
} from './token-validation';
import { resolveIdentity } from './auth/identities';

export interface NftOwnershipRecord {
  project_id: number;
  nft_contract: string;
  // Stored as TEXT: ERC-721 token IDs are uint256 and routinely exceed the
  // range JavaScript numbers can represent exactly.
  nft_token_id: string;
  network: SupportedNetwork;
  owner_address: string;
  granted_at: string;
}

/**
 * Checks if wallet owns the NFT required for project ownership
 * This is the CRITICAL Web3 feature - NFT-based project ownership
 */
export async function validateNftProjectOwnership(
  projectId: number,
  walletAddress: string
): Promise<{ ownsProject: boolean; nft: NftOwnershipRecord | null }> {
  const db = useDb();

  const nftRecord = db
    .prepare(
      `
    SELECT * FROM nft_project_ownership 
    WHERE project_id = ?
  `
    )
    .get(projectId) as NftOwnershipRecord | undefined;

  if (!nftRecord) {
    // No NFT ownership requirement for this project
    return { ownsProject: false, nft: null };
  }

  try {
    const actualOwner = await validateErc721Ownership(
      nftRecord.nft_contract,
      nftRecord.nft_token_id,
      toSupportedNetwork(nftRecord.network)
    );

    const owns = actualOwner.toLowerCase() === walletAddress.toLowerCase();

    return { ownsProject: owns, nft: nftRecord };
  } catch (error) {
    console.error(`NFT validation failed for project ${projectId}:`, error);
    return { ownsProject: false, nft: nftRecord };
  }
}

/**
 * Transfers project ownership via NFT ownership
 * Only the NFT owner can transfer project ownership
 */
export async function transferProjectOwnershipViaNft(
  projectId: number,
  fromWallet: string,
  toWallet: string
): Promise<{ success: boolean; error?: string }> {
  const db = useDb();
  const recipient = toWallet.toLowerCase();

  // Verify fromWallet owns the NFT
  const { ownsProject, nft } = await validateNftProjectOwnership(projectId, fromWallet);

  if (!ownsProject || !nft) {
    return {
      success: false,
      error: 'You do not own the required NFT to transfer this project',
    };
  }

  // The recipient's account, the project owner and the ownership record must
  // move together — a partial transfer would leave the project unreachable by
  // either wallet. The recipient's account is the one behind their eip155
  // identity (get-or-create, same as wallet login) now that wallets no longer
  // have their own table — see migrations 3 and 4.
  db.transaction(() => {
    const { userId: recipientUserId } = resolveIdentity(
      { provider: 'eip155', subject: recipient },
      null
    );

    db.prepare(
      `
      UPDATE projects
      SET owner_id = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(recipientUserId, projectId);

    db.prepare(
      `
      UPDATE nft_project_ownership
      SET owner_address = ?, granted_at = datetime('now')
      WHERE project_id = ? AND nft_contract = ?
    `
    ).run(recipient, projectId, nft.nft_contract);
  })();

  return { success: true };
}

/**
 * Adds NFT-based ownership requirement to a project
 */
export function addNftProjectOwnership(
  projectId: number,
  nftContract: string,
  nftTokenId: number | bigint | string,
  network: SupportedNetwork,
  ownerAddress: string
): void {
  const db = useDb();

  db.prepare(
    `
    INSERT INTO nft_project_ownership (project_id, nft_contract, nft_token_id, network, owner_address, granted_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id, nft_contract) DO UPDATE SET
      nft_token_id  = excluded.nft_token_id,
      network       = excluded.network,
      owner_address = excluded.owner_address,
      granted_at    = datetime('now')
  `
  ).run(projectId, nftContract, BigInt(nftTokenId).toString(), network, ownerAddress.toLowerCase());
}

/**
 * Removes NFT-based ownership from project
 */
export function removeNftProjectOwnership(projectId: number): void {
  const db = useDb();
  db.prepare('DELETE FROM nft_project_ownership WHERE project_id = ?').run(projectId);
}

/**
 * Gets all projects owned via NFT for a wallet
 */
export function getNftOwnedProjects(walletAddress: string): number[] {
  const db = useDb();

  const projects = db
    .prepare(
      `
    SELECT project_id FROM nft_project_ownership
    WHERE owner_address = ?
  `
    )
    .all(walletAddress.toLowerCase()) as { project_id: number }[];

  return projects.map((p) => p.project_id);
}

/**
 * Validates wallet owns NFT and has project access
 * Combined check for NFT-gated access control
 */
export async function validateNftAccess(
  projectId: number,
  walletAddress: string
): Promise<{ hasAccess: boolean; reason?: string }> {
  const { ownsProject, nft } = await validateNftProjectOwnership(projectId, walletAddress);

  if (ownsProject) {
    return { hasAccess: true };
  }

  if (nft) {
    return {
      hasAccess: false,
      reason: `You must own NFT #${nft.nft_token_id} on ${nft.network} to access this project`,
    };
  }

  // Project doesn't require NFT ownership
  return { hasAccess: true };
}
