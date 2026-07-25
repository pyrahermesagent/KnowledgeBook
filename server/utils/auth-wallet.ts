import crypto from 'node:crypto';
import type { H3Event } from 'h3';
import { recoverMessageAddress, isAddress, getAddress } from 'viem';

export interface WalletUser {
  id?: number;
  wallet_address: string;
  chain_id: number;
  message: string;
  signature: string;
  created_at: string;
}

export interface SessionWalletUser {
  wallet_address: string;
  chain_id: number;
}

/**
 * Nonce as stored in the session, with the timestamp used for expiry.
 */
export interface StoredNonce {
  value: string;
  issuedAt: number;
}

/** How long a login nonce stays valid before it must be reissued. */
export const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * EIP-1193: Wallet RPC provider interface
 * Provides connection to MetaMask and other EVM wallets
 */
export interface WalletProvider {
  connect(): Promise<string>;
  disconnect(): void;
  onConnect(handler: (address: string) => void): void;
  onDisconnect(handler: () => void): void;
  getChainId(): Promise<number>;
  getAccount(): Promise<string | null>;
  signMessage(message: string): Promise<string>;
  isConnected(): boolean;
}

/**
 * Resolves the Web3 settings from runtime config, so the chain and the
 * domain bound into the login message are deployment-specific rather than
 * hardcoded to Ethereum mainnet.
 */
export function getWeb3Config(): { chainId: number; domain: string; uri: string } {
  const config = useRuntimeConfig();
  const chainId = Number(config.web3?.chainId);

  return {
    chainId: Number.isFinite(chainId) && chainId > 0 ? chainId : 1,
    domain: config.web3?.appDomain || 'localhost:3000',
    uri: config.web3?.appUri || 'http://localhost:3000/login',
  };
}

/**
 * Lowercases an EVM address after validating it.
 *
 * Every address that reaches the database goes through here so that lookups
 * and comparisons never depend on EIP-55 checksum casing.
 */
export function normalizeAddress(address: string): string {
  if (!isAddress(address)) {
    throw createError({ statusCode: 400, message: 'Invalid wallet address' });
  }
  return getAddress(address).toLowerCase();
}

/**
 * EIP-4361: Sign-in with Ethereum implementation
 *
 * Recovers the signer from the signature and checks it against the address the
 * message was issued for. Returns the recovered address so the caller can bind
 * the session to the key that actually signed, never to a client-supplied value.
 */
export async function verifyWalletSignature(
  message: string,
  signature: string
): Promise<{ success: boolean; address: string }> {
  try {
    const address = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    return { success: true, address: address.toLowerCase() };
  } catch {
    return { success: false, address: '' };
  }
}

/**
 * Creates a unique login message for EIP-4361 compliance
 */
export function createLoginMessage(address: string, nonce: string): string {
  const { chainId, domain, uri } = getWeb3Config();
  const statement = 'Please sign this message to confirm your identity.';
  const issuedAt = new Date().toISOString();

  return `${domain} wants you to sign in with your Ethereum account:\n\n${address}\n\n${statement}\nURI: ${uri}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

/**
 * Extracts the fields the server must re-check from a login message.
 * Returns null when the message does not match the format we issue.
 */
export function parseLoginMessage(message: string): {
  address: string;
  domain: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
} | null {
  const domain = message.match(/^(.+?) wants you to sign in with your Ethereum account:/)?.[1];
  const address = message.match(/\n\n(0x[a-fA-F0-9]{40})\n\n/)?.[1];
  const chainId = message.match(/\nChain ID: (\d+)/)?.[1];
  const nonce = message.match(/\nNonce: ([a-f0-9]{64})/)?.[1];
  const issuedAt = message.match(/\nIssued At: (.+)$/)?.[1];

  if (!domain || !address || !chainId || !nonce || !issuedAt) {
    return null;
  }

  return { domain, address, chainId: Number(chainId), nonce, issuedAt };
}

/**
 * Full server-side validation of a login attempt.
 *
 * The signature alone proves key custody but not freshness or intent, so the
 * message is also checked against the nonce this session issued, the configured
 * domain and chain, and the nonce TTL. The caller must clear the stored nonce
 * afterwards so a captured signature cannot be replayed.
 */
export async function verifyLoginAttempt(
  message: string,
  signature: string,
  storedNonce: StoredNonce | undefined
): Promise<{ success: boolean; address: string; reason?: string }> {
  if (!storedNonce) {
    return { success: false, address: '', reason: 'No login challenge issued for this session' };
  }

  if (Date.now() - storedNonce.issuedAt > NONCE_TTL_MS) {
    return { success: false, address: '', reason: 'Login challenge expired, please retry' };
  }

  const parsed = parseLoginMessage(message);
  if (!parsed) {
    return { success: false, address: '', reason: 'Malformed login message' };
  }

  // Constant-time compare so a mismatching nonce cannot be probed byte by byte.
  const expected = Buffer.from(storedNonce.value);
  const provided = Buffer.from(parsed.nonce);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return { success: false, address: '', reason: 'Invalid login challenge' };
  }

  const { chainId, domain } = getWeb3Config();
  if (parsed.domain !== domain) {
    return { success: false, address: '', reason: 'Login message issued for a different domain' };
  }
  if (parsed.chainId !== chainId) {
    return { success: false, address: '', reason: 'Login message issued for a different chain' };
  }

  const { success, address } = await verifyWalletSignature(message, signature);
  if (!success) {
    return { success: false, address: '', reason: 'Invalid signature' };
  }

  // The address inside the signed message must be the one that signed it.
  if (address !== parsed.address.toLowerCase()) {
    return {
      success: false,
      address: '',
      reason: 'Signature does not match the address in the message',
    };
  }

  return { success: true, address };
}

/**
 * Generates a secure nonce for login messages
 */
export function generateNonce(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Stores wallet user in database (extends users table)
 */
export function upsertWalletUser(address: string, chainId: number): number {
  const db = useDb();
  const walletAddress = normalizeAddress(address);

  // Check if wallet already exists
  const existing = db
    .prepare('SELECT id FROM wallet_users WHERE wallet_address = ?')
    .get(walletAddress) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  // Insert new wallet user
  const result = db
    .prepare(
      "INSERT INTO wallet_users (wallet_address, chain_id, created_at) VALUES (?, ?, datetime('now')) RETURNING id"
    )
    .get(walletAddress, chainId) as { id: number };

  return result.id;
}

/**
 * Check if wallet is connected to a project
 */
export function isWalletProjectMember(projectId: number, walletAddress: string): boolean {
  return Boolean(
    useDb()
      .prepare('SELECT 1 FROM wallet_project_members WHERE project_id = ? AND wallet_address = ?')
      .get(projectId, walletAddress.toLowerCase())
  );
}

/**
 * Like requireProjectAccess but for wallet users
 */
export async function requireWalletProjectAccess(
  event: H3Event
): Promise<{ wallet: SessionWalletUser; project: any; isAdmin: boolean }> {
  const wallet = await requireWalletUser(event);
  const slug = getRouterParam(event, 'slug')!;
  const project = getProjectBySlug(slug);

  if (!project) {
    throw createError({ statusCode: 404, message: 'Project not found' });
  }

  const owner = project.owner_wallet_address;
  const isAdmin = owner != null && owner.toLowerCase() === wallet.wallet_address;
  if (!isAdmin && !isWalletProjectMember(project.id, wallet.wallet_address)) {
    throw createError({ statusCode: 403, message: 'You are not a member of this project' });
  }

  return { wallet, project, isAdmin };
}

/**
 * Like requireWalletProjectAccess, but only the project admin (owner) passes
 */
export async function requireWalletProjectAdmin(
  event: H3Event
): Promise<{ wallet: SessionWalletUser; project: any }> {
  const { wallet, project, isAdmin } = await requireWalletProjectAccess(event);
  if (!isAdmin) {
    throw createError({ statusCode: 403, message: 'Only the project admin can do this' });
  }
  return { wallet, project };
}

/**
 * Read the wallet attached to the current session, if any.
 *
 * Session access goes through nuxt-auth-utils, the same as the Google OAuth
 * path. The previous code called h3's useSession(event) without the required
 * session config and then session.save(), which does not exist on h3 sessions —
 * so nothing was ever persisted.
 */
export async function getSessionWallet(event: H3Event): Promise<SessionWalletUser | undefined> {
  const session = await getUserSession(event);
  return session.wallet as SessionWalletUser | undefined;
}

/**
 * Require wallet user session (similar to requireUser for Google OAuth)
 */
export async function requireWalletUser(event: H3Event): Promise<SessionWalletUser> {
  const wallet = await getSessionWallet(event);

  if (!wallet) {
    throw createError({ statusCode: 401, message: 'Wallet not connected' });
  }

  return wallet;
}
