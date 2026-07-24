<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean
  onClose: () => void
  onConnect: (address: string, chainId: number) => void
}>()

const emit = defineEmits(['close'])

const wallets = [
  { name: 'MetaMask', icon: '🦊', supported: true },
  { name: 'Phantom', icon: '👻', supported: true },
  { name: 'Coinbase Wallet', icon: ' wallet', supported: true },
  { name: 'Trust Wallet', icon: '🛡️', supported: true }
]

const connectWallet = async (walletName: string) => {
  try {
    if (!window.ethereum) {
      throw new Error('Ethereum wallet not found. Please install MetaMask or another Web3 wallet.')
    }

    // Request account connection
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    const address = accounts[0]

    // Get chain ID
    const chainIdRaw = await window.ethereum.request({ method: 'eth_chainId' })
    const chainId = parseInt(chainIdRaw, 16)

    emit('connect', address, chainId)
  } catch (error: any) {
    console.error(`Failed to connect ${walletName}:`, error)
    alert(`Failed to connect ${walletName}: ${error.message}`)
  }
}
</script>

<template>
  <div v-if="isOpen" class="wallet-modal-overlay" @click.self="onClose">
    <div class="wallet-modal">
      <div class="wallet-modal-header">
        <h3>Select a Wallet</h3>
        <button class="close-btn" @click="onClose">✕</button>
      </div>

      <div class="wallet-list">
        <div
          v-for="wallet in wallets"
          :key="wallet.name"
          class="wallet-item"
          :class="{ 'disabled': !wallet.supported }"
          @click="wallet.supported ? connectWallet(wallet.name) : null"
        >
          <div class="wallet-icon">{{ wallet.icon }}</div>
          <div class="wallet-info">
            <div class="wallet-name">{{ wallet.name }}</div>
            <div class="wallet-status">{{ wallet.supported ? 'Ready to use' : 'Coming soon' }}</div>
          </div>
          <div class="wallet-arrow">→</div>
        </div>
      </div>

      <div class="wallet-modal-footer">
        <p class="help-text">
          By connecting a wallet, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.wallet-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.wallet-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.wallet-modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  border-radius: 4px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #374151;
}

.wallet-list {
  padding: 8px;
}

.wallet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  border: 1px solid transparent;
}

.wallet-item:hover:not(.disabled) {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.wallet-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wallet-item.disabled:hover {
  background: transparent;
  border-color: transparent;
}

.wallet-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
  border-radius: 8px;
}

.wallet-info {
  flex: 1;
  min-width: 0;
}

.wallet-name {
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 2px;
}

.wallet-status {
  font-size: 12px;
  color: #6b7280;
}

.wallet-arrow {
  color: #9ca3af;
  font-size: 16px;
}

.wallet-modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
}

.help-text {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}
</style>
