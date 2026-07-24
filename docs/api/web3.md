# Web3 Integration Guide

KnowledgeBook supports Web3 authentication and NFT-based access control for documentation projects.

## Web3 Features

### Wallet Authentication

Authenticate using cryptocurrency wallets (MetaMask, WalletConnect, etc.) instead of Google OAuth.

**Supported Networks:**
- Ethereum Mainnet
- Polygon
- Arbitrum
- Base

### Token-Gated Access

Control access to documentation based on token ownership or balance:

- **ERC-20:** Access based on token balance (e.g., must hold 100+ tokens)
- **ERC-721:** Access based on NFT ownership (e.g., must own specific NFT)

### NFT-Based Project Ownership

Transfer project ownership via NFT instead of Google account.

## Authentication Flow

### 1. Login with Wallet

Send a signature request to the wallet:

```javascript
// JavaScript example
const message = 'Login to KnowledgeBook';

// Request signature from wallet
const signature = await window.ethereum.request({
  method: 'personal_sign',
  params: [address, message]
});

// Send to KnowledgeBook
const response = await fetch('/api/auth/wallet/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: address,
    message: message,
    signature: signature
  })
});

const { token, user } = await response.json();
// Store token in session cookie
```

### 2. Verify Ownership

Check if wallet owns required tokens:

```javascript
async function verifyNftOwnership(contract, tokenId, wallet) {
  const response = await fetch(`/api/nft/verify/${contract}/${tokenId}/${wallet}`);
  const data = await response.json();
  return data.owned;
}
```

## Token-Gated Access

### Configuration

Create token-gated projects using the dashboard or API:

```json
// Create token-gated project
POST /api/projects/{slug}/token-gate

{
  "token_contract": "0x...",
  "token_type": "erc20", // or "erc721"
  "value": 100, // min balance for ERC-20, token ID for ERC-721
  "network": "ethereum" // or "polygon", "arbitrum", "base"
}
```

### Access Validation

The system validates access by:

1. Checking if project has token requirements
2. Querying blockchain for wallet balance/ownership
3. Granting or denying access based on result

## NFT Project Ownership

### Setup NFT Ownership

Assign NFT-based ownership to a project:

```json
// Set NFT as project owner
POST /api/projects/{slug}/nft-ownership

{
  "nft_contract": "0x...",
  "nft_token_id": 123,
  "network": "ethereum",
  "owner_address": "0x..."
}
```

### Transfer Ownership

Transfer project ownership via NFT:

```json
// Transfer project via NFT
POST /api/projects/{slug}/transfer-ownership

{
  "from_wallet": "0x...",
  "to_wallet": "0x...",
  "nft_contract": "0x...",
  "nft_token_id": 123
}
```

## Smart Contracts

### NFT Ownership Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract NftOwnership {
    struct ProjectNft {
        uint256 projectId;
        address nftContract;
        uint256 tokenId;
        string network;
        address ownerAddress;
        uint256 grantedAt;
    }
    
    mapping(uint256 => ProjectNft) public projectNfts;
    
    function setProjectNft(
        uint256 projectId,
        address nftContract,
        uint256 tokenId,
        string memory network,
        address ownerAddress
    ) public {
        projectNfts[projectId] = ProjectNft({
            projectId: projectId,
            nftContract: nftContract,
            tokenId: tokenId,
            network: network,
            ownerAddress: ownerAddress,
            grantedAt: block.timestamp
        });
    }
    
    function getProjectNft(uint256 projectId) public view returns (ProjectNft memory) {
        return projectNfts[projectId];
    }
    
    function validateOwnership(
        uint256 projectId,
        address wallet
    ) public view returns (bool) {
        ProjectNft memory nft = projectNfts[projectId];
        if (nft.projectId == 0) return false;
        
        IERC721 nftContract = IERC721(nft.nftContract);
        return nftContract.ownerOf(nft.tokenId) == wallet;
    }
}
```

## API Reference

### Wallet Endpoints

#### POST /api/auth/wallet/login

Authenticate with wallet signature.

**Request:**
```json
{
  "address": "0x...",
  "message": "Login message",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "session_token",
  "user": {
    "id": 1,
    "wallet_address": "0x...",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### NFT Endpoints

#### GET /api/nft/verify/{contract}/{token_id}/{wallet}

Verify wallet owns specific NFT.

**Response:**
```json
{
  "owned": true,
  "contract": "0x...",
  "token_id": 123,
  "owner": "0x..."
}
```

### Token-Gated Endpoints

#### GET /api/token-gate/{project_slug}/check/{wallet}

Check if wallet has access to token-gated project.

**Response:**
```json
{
  "hasAccess": true,
  "reason": "Access granted"
}
```

## Security Considerations

1. **Signature Verification:** All wallet signatures are verified using `viem` library
2. **Message Formatting:** Login messages use standard format: `Login to KnowledgeBook`
3. **Rate Limiting:** Wallet endpoints rate-limited to 10 requests per minute
4. **Network Selection:** Always specify network to prevent cross-chain attacks
5. **Address Validation:** All wallet addresses are validated before storage

## Best Practices

1. **Test on Testnets:** Always test Web3 features on test networks first
2. **Gas Optimization:** Batch NFT operations to reduce gas costs
3. **Fallback Mechanisms:** Provide Google OAuth fallback for non-Web3 users
4. **Error Handling:** Handle blockchain errors gracefully
5. **Caching:** Cache token ownership status to reduce RPC calls

## Examples

### React Integration

```javascript
import { useAccount, useConnect, useSignMessage } from 'wagmi';

function WalletLogin() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { signMessage } = useSignMessage();

  const handleLogin = async () => {
    if (!isConnected) {
      connect({ connector: connectors[0] });
      return;
    }

    const message = `Login to KnowledgeBook`;
    
    signMessage({ message }, {
      onSuccess: async (signature) => {
        const response = await fetch('/api/auth/wallet/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            message,
            signature
          })
        });
        
        const { token } = await response.json();
        // Store token
        localStorage.setItem('token', token);
      }
    });
  };

  return (
    <button onClick={handleLogin}>
      {isConnected ? 'Login with Wallet' : 'Connect Wallet'}
    </button>
  );
}
```

### Python SDK Integration

```python
from web3 import Web3
import requests

class KnowledgeBookWeb3:
    def __init__(self, base_url):
        self.base_url = base_url
        self.w3 = Web3()
    
    def login(self, address, message, signature):
        """Authenticate with wallet signature"""
        response = requests.post(
            f"{self.base_url}/api/auth/wallet/login",
            json={
                "address": address,
                "message": message,
                "signature": signature
            }
        )
        return response.json()
    
    def verify_nft_ownership(self, contract, token_id, wallet):
        """Verify wallet owns NFT"""
        response = requests.get(
            f"{self.base_url}/api/nft/verify/{contract}/{token_id}/{wallet}"
        )
        return response.json()
    
    def check_token_access(self, project_slug, wallet):
        """Check if wallet has access to token-gated project"""
        response = requests.get(
            f"{self.base_url}/api/token-gate/{project_slug}/check/{wallet}"
        )
        return response.json()

# Usage
kb = KnowledgeBookWeb3("https://knowledgebook.plutolabs.app")
result = kb.login(
    address="0x...",
    message="Login to KnowledgeBook",
    signature="0x..."
)
print(result)
```

## Troubleshooting

### Common Issues

1. **Signature Verification Failed**
   - Ensure message format matches exactly
   - Check wallet signature was created with correct message
   - Verify wallet address matches signature

2. **Network Mismatch**
   - Confirm project is configured for correct network
   - Check wallet is connected to correct network
   - Verify RPC endpoint supports the network

3. **Token Balance Not Detected**
   - Check token contract address is correct
   - Verify token has enough supply for testing
   - Wait for blockchain confirmation

4. **NFT Ownership Not Detected**
   - Confirm wallet owns the specific NFT token ID
   - Check NFT contract is deployed on correct network
   - Verify NFT ownership transfer was successful

## Support

For Web3 integration questions:
- Check the [MCP documentation](./mcp.md) for AI agent integration
- Review [REST API docs](./rest.md) for programmatic access
- Join the [developer community](https://forum.knowledgebook.app)
