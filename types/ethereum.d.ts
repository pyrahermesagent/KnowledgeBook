/**
 * EIP-1193 provider injected by browser wallets (MetaMask and friends).
 * Declared so components can reach window.ethereum without casting to any.
 */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export {};
