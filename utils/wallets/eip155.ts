// utils/wallets/eip155.ts
import {
  UserRejectedError,
  type DetectedWallet,
  type WalletConnection,
  type WalletConnector,
} from './types';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

const providers = new Map<string, Eip6963Detail>();

/**
 * EIP-6963 replaces the single window.ethereum slot that wallets used to fight
 * over: each extension announces itself, so every installed one is reachable.
 */
function listen(): void {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = (event as CustomEvent<Eip6963Detail>).detail;
    providers.set(detail.info.rdns, detail);
  });
}

let listening = false;

export const eip155Connector: WalletConnector = {
  provider: 'eip155',
  label: 'Ethereum',
  installUrl: 'https://metamask.io/download/',
  // The EIP-6963 request/announce exchange is between the page and the
  // extension; no wallet shows the user anything.
  passiveDiscovery: true,

  async discover(): Promise<DetectedWallet[]> {
    if (!import.meta.client) return [];
    if (!listening) {
      listen();
      listening = true;
    }

    providers.clear();
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // Announcements are synchronous in practice; one tick is enough to collect.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const found = [...providers.values()].map((p) => ({
      id: p.info.rdns,
      name: p.info.name,
      icon: p.info.icon,
    }));

    // Wallets predating EIP-6963 only expose the legacy injected object.
    if (!found.length && (window as any).ethereum) {
      return [{ id: 'injected', name: 'Browser wallet' }];
    }
    return found;
  },

  async connect(walletId: string): Promise<WalletConnection> {
    const provider = resolveProvider(walletId);

    try {
      const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
      const chainIdHex: string = await provider.request({ method: 'eth_chainId' });

      return { address: accounts[0], chainId: `eip155:${parseInt(chainIdHex, 16)}` };
    } catch (error) {
      throw normalizeEip155Error(error);
    }
  },

  async signMessage(walletId: string, address: string, message: string): Promise<string> {
    const provider = resolveProvider(walletId);

    try {
      return await provider.request({ method: 'personal_sign', params: [message, address] });
    } catch (error) {
      throw normalizeEip155Error(error);
    }
  },
};

function resolveProvider(walletId: string): Eip1193Provider {
  const detail = providers.get(walletId);
  if (detail) return detail.provider;

  const injected = (window as any).ethereum as Eip1193Provider | undefined;
  if (injected) return injected;

  throw new Error('Wallet not available. Is the extension still installed?');
}

/** EIP-1193 reports a declined prompt as code 4001. */
export function normalizeEip155Error(error: unknown): Error {
  if ((error as { code?: number })?.code === 4001) return new UserRejectedError();
  return error instanceof Error ? error : new Error(String(error));
}
