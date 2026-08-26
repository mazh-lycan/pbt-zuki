import { Wallet, getBytes } from "./ethers.js";

// The only seam that knows how a chip signs. For the PoC the key travels in the
// URL fragment, which means the page can sign whenever it likes. A real Arx
// chip keeps its key on-die and answers a challenge over NFC, so replacing this
// module with a libhalo-backed one should be the whole migration: everything
// else only ever calls `address` and `signDigest`.
//
// The fragment is used rather than a query string because it is never sent to
// the server, so the key stays out of access logs, Referer headers and
// analytics.
export function readChipFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const privateKey = params.get("k");

  if (privateKey === null) {
    return null;
  }

  const wallet = new Wallet(privateKey);

  return {
    address: wallet.address,

    // `digest` is already the 32 bytes the contract hashes; signMessage wraps
    // it in the EIP-191 prefix, which is what ECDSA.toEthSignedMessageHash
    // expects on the other side.
    async signDigest(digest) {
      return wallet.signMessage(getBytes(digest));
    },
  };
}
