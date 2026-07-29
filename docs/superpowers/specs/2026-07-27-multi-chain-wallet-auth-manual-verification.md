# Manual verification checklist: multi-chain wallet auth

## Why this exists

Every browser-side path in this feature — extension discovery, connect, and signing —
runs against `window`/injected-provider APIs that no automated test in this repo can
exercise. `vitest` here runs in a plain **node** environment (no jsdom/happy-dom), so
`npm test`'s 339 tests prove the server-side logic (chain adapters, signature
verification, identity resolution, membership) and the pure client-side helpers
(error normalization, signature encoding) are correct, but nothing exercises a real
wallet extension end to end. This checklist is the compensating control. A human with
at least one wallet extension follows it against a running `npm run dev` instance.

Each item is a concrete action with an expected, observable result — not "check that
login works."

## Before you start

- `npm run dev`, then work from `http://localhost:3000`.
- Wallet extensions, install whichever you can:
  - **Ethereum (EIP-155)**: MetaMask, Rabby, Coinbase Wallet, or any other EIP-6963
    extension.
  - **Solana**: Phantom, Solflare, or Backpack.
  - **Polkadot**: polkadot.js extension, Talisman, or SubWallet.
- A Google account, for the linking sections.
- **You do not need all three ecosystems.** Sections 1, 3, 6, and 8 are each
  meaningfully testable with just one installed extension. Sections tagged
  **Needs 2 accounts** require either a second wallet/Google account or a second
  browser profile — see the note at the end of each.
- Don't look for a wallet modal or a standalone connect button:
  `components/wallet/ConnectButton.vue` and `components/wallet/WalletModal.vue` were
  deleted in the final review pass because nothing imported them. Sign-in happens
  through the panel embedded directly in the landing page (`pages/index.vue`) and
  linking happens through the inline UI on `pages/dashboard/account.vue`.
- Polkadot discovery is deliberately lazy: the extension's "allow this site to
  access your accounts?" dialog must appear only after you expand the **Polkadot**
  row (or press **Connect extension** on the account page), never on page load.

---

## 1. First-time wallet sign-in

**Applies to:** Ethereum, Solana, Polkadot (repeat once per extension you have
installed). **Solo-testable.**

1. In a browser with no existing KnowledgeBook session (private/incognito window, or
   clear cookies for the site), go to `/`.
2. In the hero panel, click the row for your ecosystem (Ethereum / Solana / Polkadot).
   - **Expected:** the row expands. Before expanding, the row showed a bare number (the
     count of detected wallets) or "none detected." With the extension installed, the
     count is ≥ 1, and expanding shows a button per detected wallet with its name (and,
     for EIP-6963 Ethereum wallets, its icon).
3. Click your wallet's button.
   - **Expected:** the extension's own connect/authorize popup appears. Approve it.
4. A signature request follows, showing a plaintext message (domain, address,
   statement, nonce, issued-at timestamp). Approve it.
   - **Expected:** you land on `/dashboard`. The dashboard header shows a signed-in
     user — since a wallet has no display name, the name shown is the shortened
     address (e.g. `0x1111…1111`).
5. Go to `/dashboard/account`.
   - **Expected:** exactly one identity is listed, its provider label matches the
     ecosystem you used ("Ethereum" / "Solana" / "Polkadot"), and the **Remove**
     button is disabled with the tooltip "This is your only way to sign in."

Ethereum-specific: if your wallet lets you switch networks, try signing in on each of
mainnet, Optimism, Polygon, Base, and Arbitrum (chain ids 1, 10, 137, 8453, 42161 — the
default `NUXT_WEB3_EVM_CHAIN_IDS`). All should succeed identically. If you can switch to
a chain _not_ in that list (e.g. a testnet), confirm sign-in fails with a clear message
rather than a crash or a silent hang.

---

## 2. A wallet-only account creates and owns a project

**Applies to:** any ecosystem. **Solo-testable.** This is the clearest proof the
unified account model works — before this feature, a wallet identity could not own
anything.

1. Signed in with a wallet-only account (from Section 1), go to `/dashboard` and create
   a new project (name + slug).
   - **Expected:** the project is created without error.
2. Open the project, add a section/page, type some content.
   - **Expected:** normal editing works — the page autosaves (status indicator updates)
     exactly as it would for a Google-signed-in user. No feature is gated behind having
     an email/Google identity.
3. Open the project's **Team** panel (sidebar → Team).
   - **Expected:** you (the wallet-only account) are listed as the admin.

---

## 3. Declining the signature prompt

**Applies to:** Ethereum, Solana, Polkadot. **Solo-testable** per ecosystem you have.
This is deliberate, easy-to-regress behavior: a decline is a choice, not an error.

1. From `/`, expand a chain row and click a wallet.
2. When the extension's **connect** popup appears, click Reject/Cancel in the
   extension (not in the KnowledgeBook UI).
   - **Expected:** no error message appears anywhere in the panel. The "signing…"
     label clears. The chain row stays open and the wallet button is clickable again
     immediately — no page reload needed.
3. Repeat, but this time approve the connect step and decline the **signature**
   popup instead.
   - **Expected:** identical outcome to step 2 — no error text, panel stays usable.
4. Try clicking a different wallet or row immediately after a decline.
   - **Expected:** it works with no leftover disabled state.

---

## 4. Linking Google and a wallet to one account

**Needs:** a Google account and a wallet extension (2 login methods, 1 person).

1. From `/`, sign in with Google ("Continue with Google").
2. Go to `/dashboard/account`.
   - **Expected:** exactly one identity ("Google"), Remove disabled.
3. Under "Link another wallet," click a detected wallet and approve the connect + sign
   prompts.
   - **Expected:** the page does **not** navigate away — the identity list refreshes
     in place to show two identities (Google + the wallet). **Remove** is now enabled
     on both rows, tooltip changed to "Remove this login method."
4. Sign out.
5. From `/`, sign in again — this time using **only** the wallet (not Google).
   - **Expected:** you land on `/dashboard` on the **same account**: same
     name/avatar (if the Google profile set one) and, critically, the same projects
     you had before linking are still there.

---

## 5. The 409 path: a wallet already linked elsewhere

**Needs 2 accounts** — e.g. account A from Section 4 (has a wallet linked) and a
fresh account B (sign up with a different Google account, or a different device/
browser profile entirely).

1. Note the wallet address linked to account A.
2. Sign out of account A. Sign in (or sign up) as account B.
3. From account B's `/dashboard/account`, under "Link another wallet," click the
   **same** wallet extension and select the **same address** that's linked to
   account A. Approve the connect + sign prompts (the client can't know in advance
   that this address is taken).
   - **Expected:** after signing, the account page shows an error banner reading
     "This login method is linked to another account. Sign out first." No new
     identity appears in account B's list.

---

## 6. Last login method guard

**Applies to:** any ecosystem. **Solo-testable**, building on Section 4.

1. On an account with exactly one identity, visit `/dashboard/account`.
   - **Expected:** Remove is disabled; hovering it shows the tooltip "This is your
     only way to sign in."
2. Link a second method (Google or another wallet, per Section 4).
   - **Expected:** Remove becomes enabled on **both** rows; tooltip changes to
     "Remove this login method" on both.
3. Click Remove on one of the two identities.
   - **Expected:** it's deleted; the list refreshes to show only the remaining
     identity; Remove on that last one is disabled again, tooltip back to "This is
     your only way to sign in."

---

## 7. Invite by wallet address

**Needs 2 accounts** (the inviter, and the invitee who controls the wallet address
being invited — can be a second wallet you also control).

1. As a project member/admin, open the project → sidebar **Team** button.
2. In "Add member," switch the kind dropdown from "Email" to the invitee's ecosystem
   (Ethereum / Solana / Polkadot), paste their wallet address, click "Add member."
   - **Expected:** the member appears in the list immediately with a shortened
     address and an **"Invited"** badge (not "Member" yet — the server hasn't seen
     that address sign in before, so it can't attach a name).
3. As the invitee, sign in with that exact wallet address for the first time (per
   Section 1).
   - **Expected:** the invited project now appears in their `/dashboard` project
     list, and they can open and edit it.
4. Back in the Team panel (reopen it / refresh), check the same row.
   - **Expected:** the badge has flipped from "Invited" to **"Member"**, and the
     display name is now the shortened wallet address (matching how the identity
     resolved), proving the invite and the later sign-in are the same membership
     row, matched through `user_identities` rather than a fresh row.

---

## 8. The reach limitation on a regular mobile browser

**Applies to:** all wallet ecosystems as a group. **Solo-testable** with any phone
(a plain browser, not a wallet app's built-in browser) or a desktop browser's mobile
device emulation as a rough proxy.

1. Open the site in a normal mobile browser (iOS Safari, Android Chrome) with no
   wallet extension present.
   - **Expected:** every chain row shows "none detected" before expanding. Expanding
     a row shows "Install a {label} wallet →" (this link is not especially useful on
     mobile, but it must not throw or dead-end silently). Below the rows, the note
     "Wallet sign-in uses browser extensions — it works in a desktop browser or your
     wallet app's built-in browser, but not a regular mobile browser like Safari or
     Chrome on your phone" is visible.
   - **Expected NOT:** no broken layout, no console errors, no interaction that looks
     like a crash — the panel should read as "not supported here, here's why," not as
     a bug.
2. Confirm Google sign-in still works fine from the same mobile browser (it's
   unaffected by this limitation) — a useful control to prove the limitation is
   scoped correctly.

---

## 9. Polkadot: a real extension signature — HIGHEST RISK ITEM

**Applies to:** Polkadot only. This is the single highest-risk item in this checklist.

**Why it's the highest risk:** the polkadot.js/Talisman/SubWallet extensions wrap the
message in `<Bytes>…</Bytes>` before signing it (`signer.signRaw({ type: 'bytes' })`
on the client, in `utils/wallets/polkadot.ts`), and the server verifies with
`signatureVerify` from `@polkadot/util-crypto` (`server/utils/auth/chains/polkadot.ts`),
which is documented to accept both the wrapped and unwrapped forms — the lower-level
`sr25519Verify` does not. `tests/auth-chain-polkadot.test.ts` proves the _server's_
unwrap logic works, but it does so against a **synthetically constructed** signature (a
raw sr25519 keypair signs a hand-built `<Bytes>...</Bytes>` string in the test) — it
does not, and cannot, prove that a real extension's `signRaw` call actually produces a
signature the server accepts. That gap — a real extension talking to this server for
the first time — is exactly what no test in the repo reaches.

1. Install the polkadot.js extension (or Talisman, or SubWallet), create or import an
   account.
2. From `/`, expand the Polkadot row and click your account.
   - **Expected:** the extension prompts to authorize the site (first time only),
     then shows a "sign this message" popup with the plaintext login message
     (domain, address, statement, nonce, issued-at).
3. Approve the signing prompt.
   - **Expected:** sign-in succeeds and you land on `/dashboard` with a new account.
     **This is the one path in the whole feature where success is not backed by any
     automated test** — if this fails, it is the single most important bug this
     checklist can catch.
4. If it fails, capture the exact text shown in the error banner. Check in particular
   whether the extension implements `signRaw` at all — the connector explicitly checks
   for this and throws "This wallet cannot sign plain messages." if it's missing, which
   would point at an unusual/outdated signer rather than the `<Bytes>` handling itself.
5. If you have access to a second Polkadot-ecosystem extension (e.g. you tested
   polkadot.js above), repeat with Talisman or SubWallet. They're separate codebases
   from polkadot.js and could wrap the payload slightly differently — this is worth
   confirming independently rather than assuming one implementation covers all three.

---

## Appendix: additional UI checks worth a pass

These are lower-stakes than Sections 1–9 but were flagged during implementation
(Tasks 15–16) as untested UI details. Sweep through them if time allows.

- **Header "Sign in" anchor** (landing page) — click "Sign in" in the header nav;
  it scrolls to the hero sign-in panel with the header not overlapping it.
- **Chain-row expand/collapse** — clicking each of the three rows (Ethereum/Solana/
  Polkadot) toggles it open/closed and the chevron icon visibly rotates 180°.
- **Pending disables every wallet button, not just the clicked one** — while one
  wallet is mid-sign-in ("signing…" shown on its button), every other wallet button
  across all three rows is disabled, not just the one being used. Confirm this reads
  as intentional (you can't run two sign-ins at once) rather than broken.
- **Genuine failure (not a decline)** — force a real failure if you can (e.g. disable
  network mid-flow after connecting but before the signature posts). Confirm the
  server's error text appears in the red error line, and that it clears on the next
  attempt.
- **Account page — Remove race with a second tab** — with exactly 2 identities open
  in two tabs on the same account, click Remove on the same or different identity in
  both tabs quickly. Confirm the tab that loses the race shows the server's 400
  message ("This is your last login method — you would not be able to sign in
  again.") gracefully rather than crashing, and the list is correct after a refresh.
- **Auth middleware** — visit `/dashboard/account` while signed out.
  - **Expected:** redirected away (to `/`), not shown a broken/empty page.
- **Narrow viewport** — check the sign-in panel and the account page's identity/link
  rows at a small width (~360px). No horizontal overflow; the header's "Account" and
  "Sign out" buttons collapse to icon-only under 640px.
- **Dark theme** — if you can reach the theme toggle (dashboard → sidebar → Theme),
  switch to dark and confirm the sign-in panel and account page still read correctly
  (they use only shared CSS custom properties, so this should be automatic — worth a
  quick look rather than a deep check).

---

## Summary table

| #   | Section                            | Ecosystems              | Needs 2 accounts?        |
| --- | ---------------------------------- | ----------------------- | ------------------------ |
| 1   | First-time wallet sign-in          | ETH / SOL / DOT         | No                       |
| 2   | Wallet-only account owns a project | Any one                 | No                       |
| 3   | Declining the signature prompt     | ETH / SOL / DOT         | No                       |
| 4   | Linking Google + wallet            | Any one wallet + Google | No (1 person, 2 methods) |
| 5   | 409 conflict                       | Any one                 | **Yes**                  |
| 6   | Last login method guard            | Any one                 | No                       |
| 7   | Invite by wallet address           | Any one                 | **Yes**                  |
| 8   | Mobile reach limitation            | All (as a group)        | No                       |
| 9   | Polkadot real signature            | DOT only                | No                       |
| —   | Appendix (polish items)            | Mixed                   | No                       |

Report results by annotating each numbered step with pass/fail and, for failures, the
exact error text and which extension/browser was used.
