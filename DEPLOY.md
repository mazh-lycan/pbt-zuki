# Going live checklist

Every value that needs replacing, in the order the dependencies allow. The
ordering matters in one place: metadata files reference images by CID, so the
images have to be pinned first.

## 1. Pinata

- [ ] Sign up at [pinata.cloud](https://pinata.cloud). The free plan covers this
      PoC: 1 GB storage, 500 files, one dedicated gateway, 10 GB bandwidth and
      10,000 gateway requests a month. No card needed.
- [ ] Create the dedicated gateway and note its domain, e.g.
      `plum-whale-1234.mypinata.cloud`.

## 2. Artwork and metadata on IPFS

- [ ] Photograph / draw the ten pieces. Square, 2000×2000 or thereabouts, PNG.
- [ ] Name the images `1.png` … `10.png`, matching token ids.
- [ ] Upload the **images folder** to Pinata as a folder, not ten separate
      files. Note the directory CID → call it `IMAGE_CID`.
- [ ] Write the ten metadata files into `ipfs/10tests/`, named `1` … `10` with
      **no extension**, using `ipfs/3tests/1` as the template.
- [ ] In each metadata file, replace `REPLACE_WITH_IMAGE_FOLDER_CID` with
      `IMAGE_CID`, and fill in the real `name`, `description` and `attributes`.
- [ ] Upload the **metadata folder** to Pinata as a folder. Note the directory
      CID → call it `METADATA_CID`.
- [ ] Sanity check in a browser: `https://<your-gateway>/ipfs/<METADATA_CID>/1`
      should return JSON, and the `image` inside it should render.

## 3. Contract parameters

- [ ] `ignition/parameters.json` → replace
      `ipfs://REPLACE_WITH_METADATA_FOLDER_CID/` with
      `ipfs://<METADATA_CID>/`. **Keep the trailing slash**, or token 1 resolves
      to `…<CID>1` instead of `…<CID>/1`.
- [ ] Confirm the chip pairing is correct. This is irreversible — the contract
      has no way to re-pair a chip after deployment, so a wrong address means a
      permanently unclaimable token:

```bash
node scripts/verify-chips.js
```

- [ ] `npx hardhat test` is green.

## 4. Deploy to Sepolia

- [ ] Put the deployer credentials in the Hardhat keystore (not a `.env`, the
      config reads them via `configVariable`):

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

- [ ] Fund the deployer address with Sepolia ETH from a faucet.
- [ ] Deploy. The deployer becomes the owner and is the only account that can
      ever call `setBaseURI`, so use a key you will still have in a month:

```bash
npx hardhat ignition deploy ignition/modules/Season1byMazh.ts \
  --network sepolia \
  --parameters ignition/parameters.json
```

- [ ] Note the deployed address → call it `CONTRACT_ADDRESS`.
- [ ] Check on Etherscan that `baseURI()` returns exactly what you intended.

## 5. Frontend

- [ ] `web/config.js` → `contractAddress`: replace the zero address with
      `CONTRACT_ADDRESS`.
- [ ] `web/config.js` → `ipfsGateway`: replace
      `https://gateway.pinata.cloud/ipfs/` with
      `https://<your-gateway>/ipfs/` (keep the trailing slash).
- [ ] Leave `rpcUrl` on the public endpoint unless it rate-limits during
      testing, in which case swap in an Alchemy or Infura Sepolia URL.

## 6. Publish

- [ ] Confirm `chips.md` is still untracked (`git status`). GitHub Pages on a
      free account requires a **public** repo, and that file holds all ten
      private keys.
- [ ] Push to `main`.
- [ ] Settings → Pages → deploy from branch `main`, folder `/ (root)`. The site
      lands at `https://mazh-lycan.github.io/pbt-zuki/web/`.
- [ ] Open that URL on a desktop browser. With no `#k=` fragment it should say
      "Scan a Season 1 tag to open its token."

## 7. NFC tags

- [ ] Write one URI record per tag, matching each chip to its own tag:

```
https://mazh-lycan.github.io/pbt-zuki/web/#k=<that chip's private key>
```

- [ ] Do **not** lock the tags or set them read-only. Adding a custom domain
      later means rewriting all ten.

## 8. Smoke test, in this order

- [ ] Tap tag 1 on a phone. The page opens, shows `#1`, unclaimed, placeholder
      image.
- [ ] Press "Verify this piece" → green, no wallet involved.
- [ ] Connect wallet. In a normal mobile browser there is no injected provider,
      so this deep-links into MetaMask's in-app browser. **Test this early** —
      it is the least certain step, and the fallback is WalletConnect.
- [ ] Claim. Token mints to the connected wallet, the real artwork replaces the
      placeholder.
- [ ] Check it on [testnets.opensea.io](https://testnets.opensea.io) for
      marketplace compatibility.
- [ ] Tap tag 1 again from a second wallet and transfer.
