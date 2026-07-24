<script setup lang="ts">
import { generateNonce, createLoginMessage } from '#utils/auth-wallet'

const walletAddress = ref<string | null>(null)
const chainId = ref<number>(1)
const isConnected = computed(() => !!walletAddress.value)
const isLoading = ref(false)

const emit = defineEmits(['connect', 'disconnect'])

// Check if wallet is already connected in session
const checkConnection = async () => {
  // TODO: Check session for wallet connection
}

const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error('Ethereum wallet not found. Please install MetaMask or another Web3 wallet.')
  }

  isLoading.value = true

  try {
    // Request account connection
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
    const address = accounts[0]

    // Get chain ID
    const chainIdRaw = await window.ethereum.request({ method: 'eth_chainId' })
    chainId.value = parseInt(chainIdRaw, 16)

    // Get login message from backend
    const { message } = await $fetch('/api/auth/wallet/login-message', {
      method: 'POST',
      body: JSON.stringify({ address })
    })

    // Sign message
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address]
    })

    // Send to backend for verification
    const result = await $fetch('/api/auth/wallet/login', {
      method: 'POST',
      body: JSON.stringify({
        address,
        signature,
        message,
        chainId: chainId.value
      })
    })

    walletAddress.value = address
    emit('connect', { address, chainId: chainId.value })
  } catch (error: any) {
    console.error('Wallet connection failed:', error)
    throw error
  } finally {
    isLoading.value = false
  }
}

const disconnect = async () => {
  try {
    await $fetch('/api/auth/wallet/logout', { method: 'POST' })
    walletAddress.value = null
    emit('disconnect')
  } catch (error) {
    console.error('Wallet disconnection failed:', error)
  }
}

// Auto-check connection on mount
onMounted(checkConnection)
</script>

<template>
  <div class="wallet-connect">
    <button
      v-if="!isConnected"
      :disabled="isLoading"
      @click="connectWallet"
      class="connect-btn"
    >
      <span v-if="isLoading">Connecting...</span>
      <span v-else>Connect Wallet</span>
    </button>

    <div v-else class="connected-wallet">
      <span class="wallet-address">{{ formatAddress(walletAddress!) }}</span>
      <span class="chain-badge">{{ chainId }}</span>
      <button @click="disconnect" class="disconnect-btn">
        Disconnect
      </button>
    </div>
  </div>
</template>

<style scoped>
.wallet-connect {
  display: inline-block;
}

.connect-btn {
  padding: 8px 16px;
  background: #346ddb;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.connect-btn:hover:not(:disabled) {
  background: #2a5bc1;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.connected-wallet {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(52, 109, 219, 0.1);
  padding: 4px 12px;
  border-radius: 6px;
}

.wallet-address {
  font-family: monospace;
  font-size: 13px;
}

.chain-badge {
  font-size: 11px;
  background: #4b5563;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
}

.disconnect-btn {
  background: transparent;
  border: 1px solid #d1d5db;
  color: #6b7280;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.disconnect-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}
</style>
