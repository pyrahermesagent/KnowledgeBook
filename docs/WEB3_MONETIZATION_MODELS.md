# KnowledgeBook Monetization Models

**Date:** 2026-07-21  
**Project:** KnowledgeBook  
**Category:** Web3 Monetization & Governance Models

---

## Overview

This document defines three Web3-enabled monetization models for KnowledgeBook:
1. **Tip-Based Monetization** - One-time creator tips
2. **Subscription Model** - Recurring access tiers
3. **Micropayment Model** - Per-page/consumption pricing

---

## 1. Tip-Based Monetization

### Concept
Allow users to tip creators for valuable documentation, tutorials, or reference guides.

### Implementation

#### Database Schema
```sql
-- Creator tipping accounts
CREATE TABLE creator_tips (
  id INTEGER PRIMARY KEY,
  creator_wallet_address TEXT NOT NULL,
  platform_percentage REAL DEFAULT 0.05,  -- 5% platform fee
  created_at TEXT DEFAULT datetime('now')
);

-- Tip transactions
CREATE TABLE tip_transactions (
  id INTEGER PRIMARY KEY,
  tipper_wallet_address TEXT NOT NULL,
  creator_wallet_address TEXT NOT NULL,
  amount_native REAL NOT NULL,
  amount_usd REAL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  project_id INTEGER,
  project_slug TEXT,
  message TEXT,
  transaction_hash TEXT UNIQUE,
  block_number INTEGER,
  created_at TEXT DEFAULT datetime('now')
);
```

#### API Endpoints
- `POST /api/tips/send` - Send tip to creator
- `GET /api/tips/creator/:address` - Get tip statistics for creator
- `GET /api/tips/recent` - Get recent tips across platform

#### Technical Requirements
- Support multiple token standards (ERC-20, SOL, StarkNet)
- Gasless tipping (meta-transactions via EigenLayer/Relay)
- NFT-based tipping tiers ( Bronze/Silver/Gold tipper NFTs)

#### UI/UX
- Tip button on project pages
- Tip NFT badge for tipper
- Creator tip dashboard with analytics

---

## 2. Subscription Model

### Concept
Tiered subscription access for documentation projects, similar to GitBook Teams/Premium.

### Implementation

#### Database Schema
```sql
-- Subscription plans
CREATE TABLE subscription_plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_usd REAL NOT NULL,
  yearly_price_usd REAL NOT NULL,
  features JSON,  -- {max_projects, team_members, ai_search, etc}
  created_at TEXT DEFAULT datetime('now')
);

-- Customer subscriptions
CREATE TABLE customer_subscriptions (
  id INTEGER PRIMARY KEY,
  customer_wallet_address TEXT NOT NULL,
  plan_id INTEGER NOT NULL,
  stripe_customer_id TEXT,  -- Off-chain for payment
  status TEXT DEFAULT 'active',  -- active, cancelled, past_due
  current_period_start TEXT,
  current_period_end TEXT,
  cancelled_at TEXT,
  created_at TEXT DEFAULT datetime('now')
);

-- Token-gated subscription access
CREATE TABLE subscription_access (
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  access_level TEXT DEFAULT 'read',  -- read, comment, edit
  created_at TEXT DEFAULT datetime('now')
);
```

#### Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 3 projects, community support |
| Hobby | $9/mo | 20 projects, team members, custom domain |
| Pro | $29/mo | Unlimited projects, AI search, analytics, priority support |
| Enterprise | Custom | SSO, audit logs, dedicated support |

#### Web3-Only Monetization Options

**Option A: Token-Gated Access**
- Project owners mint subscription NFT
- NFT holder gets access to project
- Smart contract handles renewal logic

**Option B: Escrow-Based Subscriptions**
- Funds held in escrow smart contract
- Payout to creator on successful delivery
- Refund mechanism for不满

#### API Endpoints
- `POST /api/subscriptions/create-checkout` - Create Stripe checkout session
- `POST /api/subscriptions/create-mint` - Create subscription NFT mint
- `GET /api/subscriptions/active/:address` - Get active subscriptions for wallet
- `POST /api/subscriptions/renew` - Auto-renew subscription

---

## 3. Micropayment Model

### Concept
Pay-per-consumption model for documentation - pay per page viewed or API call made.

### Implementation

#### Database Schema
```sql
-- Payment wallet accounts
CREATE TABLE payment_accounts (
  id INTEGER PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  balance_wei INTEGER DEFAULT 0,
  min_withdrawal_wei INTEGER DEFAULT 1000000000000000000,  -- 1 ETH
  created_at TEXT DEFAULT datetime('now')
);

-- Page view transactions
CREATE TABLE page_view_transactions (
  id INTEGER PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  project_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  page_slug TEXT NOT NULL,
  amount_wei INTEGER NOT NULL,
  timestamp TEXT DEFAULT datetime('now'),
  ipfs_cid TEXT,  -- Optional: content-addressed storage reference
  metadata TEXT  -- JSON: {duration_seconds, actions}
);

-- Withdrawal requests
CREATE TABLE withdrawal_requests (
  id INTEGER PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  amount_wei INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed
  transaction_hash TEXT,
  processed_at TEXT,
  created_at TEXT DEFAULT datetime('now')
);
```

#### Micropayment Structure

**Page View Pricing:**
- Free tier: 5 pages/day
- Paid: $0.01/page (0.00001 ETH at $2000/ETH)

**API Consumption Pricing:**
- Free tier: 100 MCP calls/day
- Paid: $0.001/MCP call (0.000001 ETH)

#### Smart Contract Design

```solidity
// @dev Micropayment wallet for KnowledgeBook
contract PaymentWallet {
    mapping(address => uint256) public balances;
    
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
    
    function payForPage(address projectOwner, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[projectOwner] += amount;
        // Emit event
    }
    
    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
}
```

#### Integration Points

1. **Nuxt Middleware:** Check wallet balance before rendering page
2. **Stripe Bridge:** Convert fiat to crypto for subscription payments
3. **Gasless Transactions:** Use third-party relayers for small payments

---

## Cross-Model Integration

### Unified Wallet System
- Single wallet address for tips, subscriptions, and micropayments
- Unified balance dashboard
- One-click top-up from all monetization points

### Revenue Sharing
- Platform fee: 5% across all models
- Creator retention: 95% of revenue
- Revenue payout: Weekly, monthly, or on-demand

### Analytics Dashboard
- Revenue by model (tips, subs, micropayments)
- Top earning creators
- Growth metrics (new subscribers, tip frequency)
- Geographic distribution of revenue

---

## Implementation Priority

| Model | Priority | Effort | Revenue Potential |
|-------|----------|--------|-------------------|
| Tip-Based | High | Low | Medium |
| Subscription | High | High | High |
| Micropayment | Medium | High | Low-Medium |

**Recommended Approach:** Start with subscription model as primary revenue source, add tipping as engagement feature, micropayment as experimental.

---

*Document generated by Discovery Task 2*
