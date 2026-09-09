import { SEASON_ABI } from "./abi.js";
import { readChipFromUrl } from "./chip.js";
import { config } from "./config.js";
import {
  AbiCoder,
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  hexlify,
  keccak256,
  randomBytes,
} from "./ethers.js";

const NO_EXTRAS = "0x";

const ui = {
  status: document.getElementById("status"),
  artwork: document.getElementById("artwork"),
  tokenName: document.getElementById("token-name"),
  tokenDescription: document.getElementById("token-description"),
  tokenState: document.getElementById("token-state"),
  verify: document.getElementById("verify"),
  verifyResult: document.getElementById("verify-result"),
  connect: document.getElementById("connect"),
  claim: document.getElementById("claim"),
};

const readProvider = new JsonRpcProvider(config.rpcUrl, config.chainId);
const readContract = new Contract(
  config.contractAddress,
  SEASON_ABI,
  readProvider,
);

let chip = null;
let tokenId = null;
let holder = null; // null while the token is unclaimed
let wallet = null;
let writeContract = null;

function setStatus(text) {
  ui.status.textContent = text;
}

function short(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function gatewayUrl(uri) {
  return uri.startsWith("ipfs://")
    ? config.ipfsGateway + uri.slice("ipfs://".length)
    : uri;
}

function describeError(error) {
  const decoded = decodeContractError(error);
  if (decoded !== null) {
    return (
      {
        InvalidSignature:
          "InvalidSignature (the tag signed a different digest than the chain expected)",
        SignatureTimestampInFuture:
          "SignatureTimestampInFuture (wallet clock/RPC was behind the signed timestamp)",
        SignatureTimestampTooOld: "SignatureTimestampTooOld (took too long to confirm)",
        NoMappedTokenForChip: "NoMappedTokenForChip",
      }[decoded] ?? decoded
    );
  }

  const nested =
    error?.info?.error?.message ??
    error?.error?.message ??
    error?.data?.message ??
    error?.shortMessage ??
    error?.reason ??
    error?.message;

  if (typeof nested === "string" && nested.length > 0 && nested !== "could not coalesce error") {
    return nested;
  }

  return String(error);
}

function decodeContractError(error) {
  const iface = writeContract?.interface ?? readContract.interface;
  let current = error;

  for (let depth = 0; depth < 8 && current; depth++) {
    const candidates = [
      current.data,
      current.info?.error?.data,
      current.error?.data,
      current.payload?.error?.data,
    ];

    for (const candidate of candidates) {
      const hex =
        typeof candidate === "string"
          ? candidate
          : typeof candidate?.data === "string"
            ? candidate.data
            : null;
      if (hex === null || !hex.startsWith("0x") || hex.length < 10) {
        continue;
      }
      try {
        const parsed = iface.parseError(hex);
        if (parsed !== null) {
          return parsed.name;
        }
      } catch {
        // Not a Season1byMazh custom error.
      }
    }

    current = current.info?.error ?? current.error ?? current.cause;
  }

  return null;
}

function errorCode(error) {
  return (
    error?.code ??
    error?.error?.code ??
    error?.data?.originalError?.code ??
    error?.info?.error?.code
  );
}

function getEthereum() {
  const ethereum = window.ethereum;
  if (ethereum === undefined) {
    return undefined;
  }
  if (Array.isArray(ethereum.providers)) {
    return (
      ethereum.providers.find((provider) => provider.isMetaMask) ??
      ethereum.providers[0]
    );
  }
  return ethereum;
}

function waitForEthereum(ms = 2500) {
  const existing = getEthereum();
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const finish = () => {
      window.removeEventListener("ethereum#initialized", finish);
      clearTimeout(timer);
      resolve(getEthereum());
    };
    const timer = setTimeout(finish, ms);
    window.addEventListener("ethereum#initialized", finish);
  });
}

function chainIdHex() {
  // QUANTITY encoding: no leading zeros. 421614 → 0x66eee. A padded value
  // such as 0x066eee is rejected by MetaMask mobile.
  return `0x${config.chainId.toString(16)}`;
}

function sameChain(left, right) {
  return BigInt(left) === BigInt(right);
}

function metamaskDappUrl() {
  const url = new URL(window.location.href);
  const key =
    new URLSearchParams(url.hash.slice(1)).get("k") ?? url.searchParams.get("k");
  if (key !== null) {
    url.searchParams.set("k", key);
  }
  return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}${url.hash}`;
}

function showPlaceholder(alt = "Unclaimed artwork") {
  ui.artwork.removeAttribute("data-state");
  ui.artwork.alt = alt;
  ui.artwork.src = config.placeholderImage;
}

function showArtwork(src, alt) {
  ui.artwork.dataset.state = "loading";
  ui.artwork.alt = alt;
  ui.artwork.onerror = () => {
    ui.artwork.onerror = null;
    showPlaceholder(alt);
    ui.tokenState.textContent =
      `${ui.tokenState.textContent} Artwork failed to load.`;
  };
  ui.artwork.onload = () => {
    ui.artwork.onload = null;
    ui.artwork.removeAttribute("data-state");
  };
  ui.artwork.src = src;
}

async function loadHolderAndArtwork() {
  try {
    holder = await readContract.ownerOf(tokenId);
  } catch {
    // ownerOf reverts for an unminted token, which is how the page knows the
    // token is still unclaimed.
    holder = null;
  }

  if (holder === null) {
    ui.tokenName.textContent = `Season1byMazh #${tokenId}`;
    ui.tokenDescription.textContent = "";
    ui.tokenState.textContent = "Unclaimed. The artwork is revealed on mint.";
    showPlaceholder();
    return;
  }

  ui.tokenState.textContent = `Held by ${short(holder)}. Loading artwork…`;
  showPlaceholder("Loading artwork");

  try {
    const response = await fetch(gatewayUrl(await readContract.tokenURI(tokenId)));
    if (!response.ok) {
      throw new Error(`metadata ${response.status}`);
    }
    const metadata = await response.json();
    const name = metadata.name ?? `Season1byMazh #${tokenId}`;
    ui.tokenName.textContent = name;
    ui.tokenDescription.textContent = metadata.description ?? "";
    ui.tokenState.textContent = `Held by ${short(holder)}`;
    showArtwork(gatewayUrl(metadata.image), name);
  } catch (error) {
    ui.tokenName.textContent = `Season1byMazh #${tokenId}`;
    ui.tokenDescription.textContent = "";
    ui.tokenState.textContent = `Held by ${short(holder)}. Could not load metadata: ${describeError(error)}`;
    showPlaceholder(`Season1byMazh #${tokenId}`);
  }
}

function refreshClaimButton() {
  if (wallet === null) {
    ui.claim.hidden = true;
    return;
  }

  ui.claim.hidden = false;

  if (holder !== null && holder.toLowerCase() === wallet.toLowerCase()) {
    ui.claim.textContent = "You already hold this token";
    ui.claim.disabled = true;
    return;
  }

  ui.claim.disabled = false;
  ui.claim.textContent =
    holder === null ? "Claim to my wallet" : "Transfer to my wallet";
}

async function verify() {
  ui.verify.disabled = true;
  ui.verifyResult.dataset.state = "pending";
  ui.verifyResult.textContent = "Challenging the tag…";

  try {
    // A fresh challenge every time, so what the page shows is a live answer
    // from the tag rather than a signature someone could have recorded.
    const challenge = hexlify(randomBytes(32));
    const signature = await chip.signDigest(keccak256(challenge));
    const genuine = await readContract.isChipSignatureForToken(
      tokenId,
      challenge,
      signature,
    );

    ui.verifyResult.dataset.state = genuine ? "ok" : "bad";
    ui.verifyResult.textContent = genuine
      ? `Genuine. This tag holds the key for #${tokenId}.`
      : "Not genuine. This tag did not sign for this token.";
  } catch (error) {
    ui.verifyResult.dataset.state = "bad";
    ui.verifyResult.textContent = `Could not verify: ${describeError(error)}`;
  } finally {
    ui.verify.disabled = false;
  }
}

async function connect() {
  const ethereum = await waitForEthereum();

  if (ethereum === undefined) {
    // System browsers have no injected provider. Deep-link into MetaMask's
    // in-app browser, duplicating the key as ?k= because that WebView often
    // drops the fragment.
    setStatus("Opening in MetaMask…");
    window.location.href = metamaskDappUrl();
    return;
  }

  ui.connect.disabled = true;
  setStatus("Requesting the selected account…");

  try {
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new Error("No account selected in MetaMask.");
    }

    const wanted = chainIdHex();
    const current = await ethereum.request({ method: "eth_chainId" });
    if (!sameChain(current, wanted)) {
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: wanted }],
        });
      } catch (error) {
        const code = errorCode(error);
        if (code !== 4902 && code !== -32603) throw error;
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: wanted,
              chainName: config.chainName,
              rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: [config.explorerUrl],
            },
          ],
        });
      }
    }

    const provider = new BrowserProvider(ethereum);
    const signer = await provider.getSigner(accounts[0]);
    wallet = await signer.getAddress();
    writeContract = new Contract(config.contractAddress, SEASON_ABI, signer);

    ethereum.removeAllListeners?.("accountsChanged");
    ethereum.removeAllListeners?.("chainChanged");
    ethereum.on?.("accountsChanged", () => {
      wallet = null;
      writeContract = null;
      ui.connect.textContent = "Connect wallet";
      refreshClaimButton();
      setStatus("Account changed. Connect again.");
    });
    ethereum.on?.("chainChanged", () => {
      wallet = null;
      writeContract = null;
      ui.connect.textContent = "Connect wallet";
      refreshClaimButton();
      setStatus("Network changed. Connect again.");
    });

    ui.connect.textContent = `Connected ${short(wallet)}`;
    refreshClaimButton();
    setStatus("Wallet connected.");
  } catch (error) {
    const code = errorCode(error);
    if (code === 4001) {
      setStatus("Connection rejected in MetaMask.");
    } else {
      setStatus(`Wallet connection failed: ${describeError(error)}`);
    }
  } finally {
    ui.connect.disabled = false;
  }
}

async function claim() {
  ui.claim.disabled = true;

  try {
    setStatus("Asking the tag to sign for your address…");

    // Use MetaMask's RPC for the clock and nonce. dRPC can be a few seconds
    // ahead of the node that mines the tx, which reverts as
    // SignatureTimestampInFuture and surfaces as ethers' "could not coalesce".
    const walletProvider = writeContract.runner.provider;
    const block = await walletProvider.getBlock("latest");
    const signatureTimestamp = BigInt(block.timestamp) - 15n;
    const nonce = await writeContract.chipNonce(chip.address);

    const digest = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes32", "address", "uint256", "bytes32"],
        [
          config.contractAddress,
          BigInt(config.chainId),
          nonce,
          wallet,
          signatureTimestamp,
          keccak256(NO_EXTRAS),
        ],
      ),
    );
    const signature = await chip.signDigest(digest);
    const args =
      holder === null
        ? [wallet, chip.address, signature, signatureTimestamp, NO_EXTRAS]
        : [wallet, chip.address, signature, signatureTimestamp, false, NO_EXTRAS];
    const method = holder === null ? "mint" : "transferToken";

    setStatus("Checking the claim will succeed…");
    await writeContract[method].staticCall(...args);

    setStatus("Confirm the transaction in your wallet…");
    const transaction = await writeContract[method](...args);

    setStatus("Waiting for the transaction…");
    await transaction.wait();

    await loadHolderAndArtwork();
    refreshClaimButton();
    setStatus("Done. The token is yours.");
  } catch (error) {
    const code = errorCode(error);
    if (code === 4001) {
      setStatus("Claim rejected in MetaMask.");
    } else {
      setStatus(`Claim failed: ${describeError(error)}`);
    }
    refreshClaimButton();
  }
}

async function start() {
  ui.verify.addEventListener("click", verify);
  ui.connect.addEventListener("click", connect);
  ui.claim.addEventListener("click", claim);

  try {
    chip = readChipFromUrl();
  } catch {
    setStatus("This tag's key is malformed.");
    return;
  }

  if (chip === null) {
    setStatus("Scan a Season 1 tag to open its token.");
    return;
  }

  setStatus("Looking up the tag…");

  try {
    tokenId = await readContract.tokenIdFor(chip.address);
  } catch (error) {
    setStatus(`This tag is not part of Season 1. (${describeError(error)})`);
    return;
  }

  ui.tokenName.textContent = `Season1byMazh #${tokenId}`;
  await loadHolderAndArtwork();

  ui.verify.hidden = false;
  ui.connect.hidden = false;
  const ethereum = await waitForEthereum(800);
  setStatus(
    ethereum === undefined
      ? "Ready. Connect opens MetaMask."
      : "Ready. Tap Connect wallet and approve the selected account.",
  );
}

start();
