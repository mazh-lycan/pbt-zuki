# The PoC
Your token has no metadata. Nothing in contracts/ overrides _baseURI() or tokenURI(), and OpenZeppelin's default returns an empty string:


`ERC721.sol`
`Ln 93–107`
```
function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
    _requireMinted(tokenId);
    string memory baseURI = _baseURI();
    return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString())) : "";
}
```
Your own site can hardcode the image, so the PoC works either way. But the moment someone transfers the PBT into MetaMask or looks at it on a testnet explorer, it'll be a blank token — which undercuts the "this is the real artwork" feeling you're going for. Since your contract has no owner and no setter, the simplest fix is a constructor parameter holding an IPFS base URI and a one-line _baseURI() override. Worth deciding before you deploy to Sepolia, because you can't change it afterward without redeploying.

Put the key in the URL fragment, not the query string. #k=0x... never leaves the browser; ?k=0x... gets sent to your server and lands in access logs, Referer headers on any outbound link, and analytics. Same UX, much smaller blast radius.

More importantly, be clear-eyed that key-in-URL is a PoC stand-in that inverts your security model. A real Arx Halo or Kong chip generates its key on-die and signs a challenge over NFC — the key physically cannot leave. With the key in a URL, the first person who scans your sofubi can save it and transfer the PBT to themselves a year later, from anywhere, having never touched the object again. That's the opposite of "loyal to the physical item." For a demo it's fine; just build the page behind a single signDigest(digest): Promise<Hex> seam so swapping the PoC signer for libhalo's NFC signing later is a one-file change rather than a rewrite.

The no-wallet validation you described works exactly as you imagined. isChipSignatureForToken is a view, so a viem public client pointed at any public Sepolia RPC can call it with no wallet, no gas, no connection prompt. Generate a random challenge client-side each time rather than signing a fixed string, so what you're showing is a live response and not a replayable one.

The honest limitation: a green check proves the tag holds the key for that token. It can't prove the page is honest — a counterfeiter can embed a URL to their own lookalike site that always shows green. Every NFC authentication product has this problem, and the answers are all social (people learn one domain) or require verification from a neutral app. Worth knowing now rather than discovering it in a demo.

Two practical notes for the build. The digest construction you need is already written — signAsChip in test/Season1byMazh.ts reads chipNonce, ABI-encodes the six fields, hashes, and signs EIP-191. Port it verbatim; it's the heart of the frontend. And the page needs to branch between mint and transfer: the first claim of a token is mint, every later one is transferToken. ownerOf reverts on an unminted token, so that's your check.

For deployment, hardhat-ignition is installed but there's no ignition/ directory yet, and your Sepolia config reads SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY through configVariable, which means setting them in the Hardhat keystore rather than a .env. One thought: if you expect to land on an L2 eventually, deploying the PoC to Base Sepolia instead would let you test the same wallet and on-ramp stack you'd use in production.