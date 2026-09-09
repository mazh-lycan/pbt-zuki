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
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  const privateKey = hashParams.get("k") ?? queryParams.get("k");

  if (privateKey === null) {
    return null;
  }

  // Query strings hit server logs; MetaMask's in-app browser often drops the
  // fragment, so the deep link may arrive as ?k=. Move it back to the hash.
  if (queryParams.has("k")) {
    queryParams.delete("k");
    const search = queryParams.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ""}#k=${privateKey}`;
    window.history.replaceState(null, "", url);
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
