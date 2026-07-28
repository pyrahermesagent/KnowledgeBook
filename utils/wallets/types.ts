// utils/wallets/types.ts

/** A wallet extension found in this browser. */
export interface DetectedWallet {
  /** Stable per-ecosystem key, e.g. an EIP-6963 rdns or a wallet-standard name. */
  id: string;
  name: string;
  icon?: string;
}

export interface WalletConnection {
  address: string;
  /** CAIP-2 where the wallet reports it, e.g. 'eip155:8453'. */
  chainId?: string;
}

/**
 * The user closed the wallet prompt. Not an error condition — callers close the
 * modal quietly rather than showing a failure.
 */
export class UserRejectedError extends Error {
  constructor() {
    super('Signature request rejected');
    this.name = 'UserRejectedError';
  }
}

export interface WalletConnector {
  provider: 'eip155' | 'solana' | 'polkadot';
  label: string;
  installUrl: string;
  /**
   * True when `discover()` only observes what is installed, without the wallet
   * asking the user for anything. Those connectors are safe to run on mount.
   *
   * Polkadot's is not passive: `web3Enable()` is the extension's authorization
   * request and opens an "allow this site to access your accounts?" dialog, so
   * it must wait for the user to ask for it.
   */
  passiveDiscovery: boolean;
  discover(): Promise<DetectedWallet[]>;
  connect(walletId: string): Promise<WalletConnection>;
  signMessage(walletId: string, address: string, message: string): Promise<string>;
}
