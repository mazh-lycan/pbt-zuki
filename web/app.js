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
  return error.shortMessage ?? error.message ?? String(error);
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
    ui.tokenState.textContent = "Unclaimed. The artwork is revealed on mint.";
    ui.artwork.src = config.placeholderImage;
    return;
  }

  ui.tokenState.textContent = `Held by ${short(holder)}`;

  try {
    const response = await fetch(gatewayUrl(await readContract.tokenURI(tokenId)));
    const metadata = await response.json();
    ui.artwork.src = gatewayUrl(metadata.image);
  } catch {
    ui.artwork.src = config.placeholderImage;
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
  if (window.ethereum === undefined) {
    // On a phone the tag opens the system browser, where no injected provider
    // exists. This hands the same URL, fragment included, to MetaMask's own
    // browser instead.
    const { host, pathname, hash } = window.location;
    window.location.href = `https://metamask.app.link/dapp/${host}${pathname}${hash}`;
    return;
  }

  ui.connect.disabled = true;

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const wanted = `0x${config.chainId.toString(16)}`;
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (current !== wanted) {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: wanted }],
      });
    }

    const signer = await new BrowserProvider(window.ethereum).getSigner();
    wallet = await signer.getAddress();
    writeContract = new Contract(config.contractAddress, SEASON_ABI, signer);

    ui.connect.textContent = `Connected ${short(wallet)}`;
    refreshClaimButton();
    setStatus("Wallet connected.");
  } catch (error) {
    setStatus(`Wallet connection failed: ${describeError(error)}`);
  } finally {
    ui.connect.disabled = false;
  }
}

async function claim() {
  ui.claim.disabled = true;

  try {
    setStatus("Asking the tag to sign for your address…");

    // The chain's own clock, not the phone's: a device running a few seconds
    // fast would produce a timestamp the contract rejects as being in the
    // future.
    const block = await readProvider.getBlock("latest");
    const signatureTimestamp = BigInt(block.timestamp);
    const nonce = await readContract.chipNonce(chip.address);

    // The digest commits to the recipient, which is why the tag can only sign
    // once a wallet is connected, and why the signature cannot be redirected.
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

    setStatus("Confirm the transaction in your wallet…");
    const transaction =
      holder === null
        ? await writeContract.mint(
            wallet,
            chip.address,
            signature,
            signatureTimestamp,
            NO_EXTRAS,
          )
        : await writeContract.transferToken(
            wallet,
            chip.address,
            signature,
            signatureTimestamp,
            false,
            NO_EXTRAS,
          );

    setStatus("Waiting for the transaction…");
    await transaction.wait();

    await loadHolderAndArtwork();
    refreshClaimButton();
    setStatus("Done. The token is yours.");
  } catch (error) {
    setStatus(`Claim failed: ${describeError(error)}`);
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
  setStatus("Ready.");
}

start();
