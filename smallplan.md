# Phase 1 — trial run with 3 artworks

Same flow as the real thing, only tokens 1, 2 and 3. The Sepolia deployment
here is throwaway: it gets redeployed in phase 2 with all ten chips.
Parameter-by-parameter instructions live in DEPLOY.md.

1. v Add URI logic to Smart Contract
2. v Add 3 IPFS metadata files (`ipfs/3tests/1`, `2`, `3`)
3. v Test URI logic on hardhat local
4. v Create the HTML for the site (`web/index.html`)
5. v Create the script that verifies, connects metamask (mobile app) and
  transacts (mobile app). If a token has not been minted yet, when verifying
   show a "default image" loaded on server, and allow for connect wallet and
   transfer (here branched to mint after checking) to connected user
   — written in `web/app.js`, not yet tested on a real phone
6. v Use pinata to render the IPFS on the site — gateway rewriting is in
  `web/app.js`; only the gateway domain is still to fill in `web/config.js`
7. v Ignition deployment module with a 1h signature window, plus
  `scripts/verify-chips.js` to catch a mispaired chip before deploying
8. v Draw the 3 artworks for the PBTs
9. v Take pictures, upload the images folder to IPFS → note IMAGE_CID
10. v Put IMAGE_CID into the 3 metadata files, upload the metadata folder →
  note METADATA_CID, that is the baseURI
11. v Cut `ignition/modules/Season1byMazh.ts` down to chips 1–3 and ids 1, 2, 3
  for the trial, then run `node scripts/verify-chips.js`
12. v Deploy to Sepolia, then fill `contractAddress` and the pinata gateway in
  `web/config.js`
13. v Publish the site on GitHub Pages
14. v Save the 3 PBT private keys URIs on NFC tags
15. v Mint PBT 1
16. v Test verify, connect wallet and transfer
17. v Do a few transfers to play around with tokens 1, 2, 3

# Phase 2 — full set of 10

Only the things that change once the trial has proven the flow.

1. Draw the remaining 7 artworks
2. Take pictures, upload the full images folder → new IMAGE_CID
3. Write the 10 metadata files into `ipfs/10tests/`, upload that folder → new
  METADATA_CID
4. Restore all 10 chips and ids 1–10 in the ignition module, verify again
5. Add "updateChips" function to smart contract and
  test it
6. Redeploy to Sepolia with the new baseURI, update `web/config.js`
7. Save the remaining 7 private keys URIs on NFC tags. The first 3 stay as
  they are: a tag only holds the site URL and its own key, so the redeploy is
    invisible to it
8. Transfer all PBTs to main PoC account to test in Alastria Blockchain Awards
  event as a live demo with a few people

# Phase 3 — Arbitrum One (mainnet), marketplace check

Testnets do not show on OpenSea proper. Do this only after phase 2 has
proven mint / verify / transfer on the 10-token set.

1. Check whether `claimTxOverrides` is still needed on Arbitrum One, or if
  MetaMask's default fees are enough (see the gas note below).
2. Deploy Season1byMazh to Arbitrum One, update `web/config.js` (chain id
  42161, mainnet RPC, new contract address).
3. Mint PBT 1, check it appears on OpenSea with the IPFS artwork and traits.

# Note — claim gas fees (`web/app.js` `claimTxOverrides`)

Claim sets `maxFeePerGas` to 2× the current base fee plus 10_000_000 wei
because Arbitrum Sepolia was rejecting MetaMask's estimate with
`max fee per gas less than block base fee` (e.g. 258724000 vs 260594000).
The same happened on a plain ETH transfer in MetaMask until the fee was
bumped by hand. Check on the next chain whether this buffer is still
needed or is an Arbitrum Sepolia / flaky-base-fee workaround. A quieter
L1 or a mainnet with stable fees may be fine with MetaMask's defaults.