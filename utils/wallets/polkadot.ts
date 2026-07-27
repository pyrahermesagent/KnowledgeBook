// utils/wallets/polkadot.ts
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

const APP_NAME = 'KnowledgeBook';

/**
 * @polkadot/extension-dapp is imported lazily: it touches window at module
 * scope, so a static import breaks server-side rendering.
 */
async function extensionDapp() {
  return await import('@polkadot/extension-dapp');
}

/** Accounts are keyed by address so a walletId round-trips through the UI. */
let accountCache: { address: string; name: string; source: string }[] = [];

export const polkadotConnector: WalletConnector = {
  provider: 'polkadot',
  label: 'Polkadot',
  installUrl: 'https://polkadot.js.org/extension/',

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];

    const { web3Enable, web3Accounts } = await extensionDapp();

    // Prompts the extension for authorization; returns [] when none installed.
    const extensions = await web3Enable(APP_NAME);
    if (!extensions.length) return [];

    const accounts = await web3Accounts();
    accountCache = accounts.map((a) => ({
      address: a.address,
      name: a.meta.name ?? a.address,
      source: a.meta.source,
    }));

    // One entry per account, since a Polkadot extension holds several.
    return accountCache.map((a) => ({ id: a.address, name: `${a.name} (${a.source})` }));
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const account = accountCache.find((a) => a.address === walletId);
    if (!account) throw new Error('Account not available. Try reconnecting the extension.');

    return { address: account.address };
  },

  async signMessage(walletId: string, address: string, message: string): Promise<string> {
    const account = accountCache.find((a) => a.address === walletId);
    if (!account) throw new Error('Account not available. Try reconnecting the extension.');

    try {
      const { web3FromSource } = await extensionDapp();
      const injector = await web3FromSource(account.source);

      if (!injector.signer.signRaw) {
        throw new Error('This wallet cannot sign plain messages.');
      }

      // type 'bytes' signs the payload as a message rather than a transaction.
      // The extension wraps it in <Bytes>…</Bytes>; the server's signatureVerify
      // accepts both wrapped and unwrapped forms.
      const { signature } = await injector.signer.signRaw({
        address,
        data: message,
        type: 'bytes',
      });

      return signature;
    } catch (error) {
      throw normalizePolkadotError(error);
    }
  },
};

/** The polkadot.js extension reports a closed prompt as "Cancelled". */
export function normalizePolkadotError(error: unknown): Error {
  const message = (error as Error)?.message ?? String(error);
  if (/cancel|reject/i.test(message)) return new UserRejectedError();
  return error instanceof Error ? error : new Error(message);
}
