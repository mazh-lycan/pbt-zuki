import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  stringToHex,
  toFunctionSelector,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

type Chip = ReturnType<typeof privateKeyToAccount>;

const MAX_DURATION_WINDOW = 3600n;
const PAIRED_TOKEN_IDS = [1n, 2n, 3n];
const NO_EXTRAS: Hex = "0x";

// Shaped like the directory CID a folder upload returns. The trailing slash is
// what makes `base + tokenId` address a child of the directory instead of a
// sibling of it, and nothing on-chain can enforce it.
const BASE_URI =
  "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/";
const REPINNED_BASE_URI =
  "ipfs://bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku/";

const ERC165_INTERFACE_ID: Hex = "0x01ffc9a7";
const ERC721_INTERFACE_ID: Hex = "0x80ac58cd";

function xorSelectors(selectors: Hex[]): Hex {
  const combined = selectors.reduce((acc, selector) => acc ^ BigInt(selector), 0n);
  return `0x${combined.toString(16).padStart(8, "0")}`;
}

// Constructor reverts surface as an RPC error rather than a decoded contract
// call, so the assertions match the reason EDR reports instead of using the
// viem assertion helpers.
function revertedWithCustomError(name: string): RegExp {
  return new RegExp(`reverted with custom error '${name}\\(\\)'`);
}

const IPBT_INTERFACE_ID = xorSelectors([
  toFunctionSelector("function tokenIdFor(address)"),
  toFunctionSelector("function isChipSignatureForToken(uint256,bytes,bytes)"),
  toFunctionSelector("function transferToken(address,address,bytes,uint256,bool,bytes)"),
]);

describe("Season1byMazh", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [collector, buyer] = await viem.getWalletClients();
  const chainId = BigInt(await publicClient.getChainId());

  // A chip is only ever a keypair that signs; it never holds funds or sends
  // transactions, so a local viem account models a physical tag exactly.
  function newChip(): Chip {
    return privateKeyToAccount(generatePrivateKey());
  }

  async function deployPairedTo(chips: Chip[], baseURI: string = BASE_URI) {
    return viem.deployContract("Season1byMazh", [
      chips.map((chip) => chip.address),
      PAIRED_TOKEN_IDS.slice(0, chips.length),
      MAX_DURATION_WINDOW,
      baseURI,
    ]);
  }

  type Contract = Awaited<ReturnType<typeof deployPairedTo>>;

  async function signAsChip(
    chip: Chip,
    contract: Contract,
    to: Address,
    signatureTimestamp: bigint,
    extras: Hex = NO_EXTRAS,
  ): Promise<Hex> {
    const chipNonce = await contract.read.chipNonce([chip.address]);

    const digest = keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "address, uint256, bytes32, address, uint256, bytes32",
        ),
        [
          contract.address,
          chainId,
          chipNonce,
          to,
          signatureTimestamp,
          keccak256(extras),
        ],
      ),
    );

    return chip.signMessage({ message: { raw: digest } });
  }

  async function now(): Promise<bigint> {
    return BigInt(await networkHelpers.time.latest());
  }

  async function mintWithChip(
    contract: Contract,
    chip: Chip,
    to: Address,
  ): Promise<void> {
    const timestamp = await now();
    const signature = await signAsChip(chip, contract, to, timestamp);
    await contract.write.mint([to, chip.address, signature, timestamp, NO_EXTRAS]);
  }

  describe("constructor validation", function () {
    it("refuses to pair a chip to token id 0, which is what an unpaired chip maps to", async function () {
      await assert.rejects(
        viem.deployContract("Season1byMazh", [
          [newChip().address],
          [0n],
          MAX_DURATION_WINDOW,
          BASE_URI
        ]),
        revertedWithCustomError("TokenIdIsZero"),
      );
    });

    it("refuses a token id 0 hidden among valid ones", async function () {
      await assert.rejects(
        viem.deployContract("Season1byMazh", [
          [newChip().address, newChip().address, newChip().address],
          [1n, 0n, 3n],
          MAX_DURATION_WINDOW,
          BASE_URI
        ]),
        revertedWithCustomError("TokenIdIsZero"),
      );
    });

    it("refuses mismatched chip and token id arrays", async function () {
      await assert.rejects(
        viem.deployContract("Season1byMazh", [
          [newChip().address, newChip().address],
          [1n],
          MAX_DURATION_WINDOW,
          BASE_URI
        ]),
        revertedWithCustomError("ArrayLengthMismatch"),
      );
    });

    it("refuses a season with no chips", async function () {
      await assert.rejects(
        viem.deployContract("Season1byMazh", [[], [], MAX_DURATION_WINDOW, BASE_URI]),
        revertedWithCustomError("NoChipsProvided"),
      );
    });

    it("refuses a duration window of zero, which would reject every scan", async function () {
      await assert.rejects(
        viem.deployContract("Season1byMazh", [
          [newChip().address],
          [PAIRED_TOKEN_IDS[0]],
          0n,
          BASE_URI
        ]),
        revertedWithCustomError("MaxDurationWindowIsZero"),
      );
    });
  });

  describe("chip pairing", function () {
    it("pairs each chip to its token id at construction", async function () {
      const chips = [newChip(), newChip(), newChip()];
      const season = await deployPairedTo(chips);

      for (const [index, chip] of chips.entries()) {
        assert.equal(
          await season.read.tokenIdFor([chip.address]),
          PAIRED_TOKEN_IDS[index],
        );
      }
    });

    it("announces each pairing so indexers can follow the chips", async function () {
      const chip = newChip();

      const { contract, deploymentTransaction } =
        await viem.sendDeploymentTransaction("Season1byMazh", [
          [chip.address],
          [PAIRED_TOKEN_IDS[0]],
          MAX_DURATION_WINDOW,
          BASE_URI
        ]);

      await viem.assertions.emitWithArgs(
        deploymentTransaction.hash,
        contract,
        "ChipSet",
        [PAIRED_TOKEN_IDS[0], chip.address],
      );
    });

    it("has no token for a chip that was never paired", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWithCustomError(
        season.read.tokenIdFor([newChip().address]),
        season,
        "NoMappedTokenForChip",
      );
    });

    it("rejects the zero address as a chip", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWithCustomError(
        season.read.tokenIdFor([zeroAddress]),
        season,
        "ChipIdIsZeroAddress",
      );
    });
  });

  describe("minting", function () {
    it("mints the paired token to whoever the chip signed for", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);

      await mintWithChip(season, chip, collector.account.address);

      assert.equal(
        await season.read.ownerOf([PAIRED_TOKEN_IDS[0]]),
        getAddress(collector.account.address),
      );
    });

    it("lets anyone submit the transaction, since the chip is what authorizes it", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        collector.account.address,
        timestamp,
      );

      // The chip signed for the collector, but the buyer pays the gas.
      await season.write.mint(
        [
          collector.account.address,
          chip.address,
          signature,
          timestamp,
          NO_EXTRAS,
        ],
        { account: buyer.account },
      );

      assert.equal(
        await season.read.ownerOf([PAIRED_TOKEN_IDS[0]]),
        getAddress(collector.account.address),
      );
    });

    it("rejects a signature from a key that is not the paired chip", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = await now();
      const forged = await signAsChip(
        newChip(),
        season,
        collector.account.address,
        timestamp,
      );

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          collector.account.address,
          chip.address,
          forged,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "InvalidSignature",
      );
    });

    it("rejects a signature redirected to a different recipient", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = await now();
      const signedForCollector = await signAsChip(
        chip,
        season,
        collector.account.address,
        timestamp,
      );

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          buyer.account.address,
          chip.address,
          signedForCollector,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "InvalidSignature",
      );
    });

    it("rejects a scan replayed after it was already used", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        collector.account.address,
        timestamp,
      );

      await season.write.mint([
        collector.account.address,
        chip.address,
        signature,
        timestamp,
        NO_EXTRAS,
      ]);

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          collector.account.address,
          chip.address,
          signature,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "InvalidSignature",
      );
    });

    it("rejects a chip that signs correctly but has no paired token", async function () {
      const season = await deployPairedTo([newChip()]);
      const stranger = newChip();
      const timestamp = await now();
      const signature = await signAsChip(
        stranger,
        season,
        collector.account.address,
        timestamp,
      );

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          collector.account.address,
          stranger.address,
          signature,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "NoMappedTokenForChip",
      );
    });

    it("rejects a timestamp from the future", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = (await now()) + 3600n;
      const signature = await signAsChip(
        chip,
        season,
        collector.account.address,
        timestamp,
      );

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          collector.account.address,
          chip.address,
          signature,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "SignatureTimestampInFuture",
      );
    });

    it("rejects a scan older than the duration window", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        collector.account.address,
        timestamp,
      );

      await networkHelpers.time.increase(MAX_DURATION_WINDOW + 60n);

      await viem.assertions.revertWithCustomError(
        season.write.mint([
          collector.account.address,
          chip.address,
          signature,
          timestamp,
          NO_EXTRAS,
        ]),
        season,
        "SignatureTimestampTooOld",
      );
    });
  });

  describe("transferring by scanning the chip", function () {
    it("moves the token to a new holder without the owner's consent", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        buyer.account.address,
        timestamp,
      );

      await season.write.transferToken(
        [buyer.account.address, chip.address, signature, timestamp, false, NO_EXTRAS],
        { account: buyer.account },
      );

      assert.equal(
        await season.read.ownerOf([PAIRED_TOKEN_IDS[0]]),
        getAddress(buyer.account.address),
      );
    });

    it("rejects a transfer scan that is replayed", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        buyer.account.address,
        timestamp,
      );

      await season.write.transferToken([
        buyer.account.address,
        chip.address,
        signature,
        timestamp,
        false,
        NO_EXTRAS,
      ]);

      await viem.assertions.revertWithCustomError(
        season.write.transferToken([
          buyer.account.address,
          chip.address,
          signature,
          timestamp,
          false,
          NO_EXTRAS,
        ]),
        season,
        "InvalidSignature",
      );
    });
  });

  describe("read-only ERC-721 surface", function () {
    it("refuses approvals and owner-initiated transfers", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const tokenId = PAIRED_TOKEN_IDS[0];
      const from = collector.account.address;
      const to = buyer.account.address;

      await viem.assertions.revertWith(
        season.write.approve([to, tokenId]),
        "ERC721 public approve not allowed",
      );
      await viem.assertions.revertWith(
        season.write.setApprovalForAll([to, true]),
        "ERC721 public setApprovalForAll not allowed",
      );
      await viem.assertions.revertWith(
        season.write.transferFrom([from, to, tokenId]),
        "ERC721 public transferFrom not allowed",
      );
      await viem.assertions.revertWith(
        season.write.safeTransferFrom([from, to, tokenId]),
        "ERC721 public safeTransferFrom not allowed",
      );
      await viem.assertions.revertWith(
        season.write.safeTransferFrom([from, to, tokenId, "0x"]),
        "ERC721 public safeTransferFrom not allowed",
      );
    });

    it("reports no approvals for a minted token", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      assert.equal(
        await season.read.getApproved([PAIRED_TOKEN_IDS[0]]),
        zeroAddress,
      );
      assert.equal(
        await season.read.isApprovedForAll([
          collector.account.address,
          buyer.account.address,
        ]),
        false,
      );
    });
  });

  describe("metadata", function () {
    it("exposes the base URI it was deployed with", async function () {
      const season = await deployPairedTo([newChip()]);

      assert.equal(await season.read.baseURI(), BASE_URI);
    });

    it("announces the base URI at deployment", async function () {
      const { contract, deploymentTransaction } =
        await viem.sendDeploymentTransaction("Season1byMazh", [
          [newChip().address],
          [PAIRED_TOKEN_IDS[0]],
          MAX_DURATION_WINDOW,
          BASE_URI,
        ]);

      await viem.assertions.emitWithArgs(
        deploymentTransaction.hash,
        contract,
        "NewBaseURI",
        [BASE_URI],
      );
    });

    it("joins the base URI to the token id once minted", async function () {
      const chips = [newChip(), newChip()];
      const season = await deployPairedTo(chips);

      await mintWithChip(season, chips[0], collector.account.address);
      await mintWithChip(season, chips[1], collector.account.address);

      // Asserted in full rather than by prefix, so a base URI missing its
      // trailing slash fails here instead of at a gateway.
      assert.equal(
        await season.read.tokenURI([PAIRED_TOKEN_IDS[0]]),
        `${BASE_URI}1`,
      );
      assert.equal(
        await season.read.tokenURI([PAIRED_TOKEN_IDS[1]]),
        `${BASE_URI}2`,
      );
    });

    it("withholds the artwork of a paired token until it is minted", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWith(
        season.read.tokenURI([PAIRED_TOKEN_IDS[0]]),
        "ERC721: invalid token ID",
      );
    });

    it("has no metadata for a token id that was never paired", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWith(
        season.read.tokenURI([9999n]),
        "ERC721: invalid token ID",
      );
    });

    it("stays silent rather than serving a bare token id when no base URI is set", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip], "");
      await mintWithChip(season, chip, collector.account.address);

      assert.equal(await season.read.tokenURI([PAIRED_TOKEN_IDS[0]]), "");
    });

    it("keeps the artwork with the token when it changes hands by scan", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const timestamp = await now();
      const signature = await signAsChip(
        chip,
        season,
        buyer.account.address,
        timestamp,
      );
      await season.write.transferToken([
        buyer.account.address,
        chip.address,
        signature,
        timestamp,
        false,
        NO_EXTRAS,
      ]);

      assert.equal(
        await season.read.tokenURI([PAIRED_TOKEN_IDS[0]]),
        `${BASE_URI}1`,
      );
    });

    it("lets the owner repoint every token to a newly pinned directory", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      await viem.assertions.emitWithArgs(
        season.write.setBaseURI([REPINNED_BASE_URI]),
        season,
        "NewBaseURI",
        [REPINNED_BASE_URI],
      );

      assert.equal(await season.read.baseURI(), REPINNED_BASE_URI);
      assert.equal(
        await season.read.tokenURI([PAIRED_TOKEN_IDS[0]]),
        `${REPINNED_BASE_URI}1`,
      );
    });

    it("refuses a base URI change from anyone but the owner", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWith(
        season.write.setBaseURI([REPINNED_BASE_URI], {
          account: buyer.account,
        }),
        "Ownable: caller is not the owner",
      );

      assert.equal(await season.read.baseURI(), BASE_URI);
    });
  });

  describe("ownership", function () {
    it("makes the deployer the owner", async function () {
      const season = await deployPairedTo([newChip()]);

      assert.equal(
        await season.read.owner(),
        getAddress(collector.account.address),
      );
    });

    it("refuses to be left ownerless, which would freeze the metadata forever", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWith(
        season.write.renounceOwnership(),
        "Ownable: renounceOwnership is not allowed",
      );

      assert.equal(
        await season.read.owner(),
        getAddress(collector.account.address),
      );
    });

    it("refuses to renounce for a non-owner too", async function () {
      const season = await deployPairedTo([newChip()]);

      await viem.assertions.revertWith(
        season.write.renounceOwnership({ account: buyer.account }),
        "Ownable: renounceOwnership is not allowed",
      );
    });

    it("still hands ownership over, along with control of the metadata", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      await season.write.transferOwnership([buyer.account.address]);
      assert.equal(
        await season.read.owner(),
        getAddress(buyer.account.address),
      );

      await season.write.setBaseURI([REPINNED_BASE_URI], {
        account: buyer.account,
      });
      assert.equal(
        await season.read.tokenURI([PAIRED_TOKEN_IDS[0]]),
        `${REPINNED_BASE_URI}1`,
      );
    });
  });

  describe("provenance checks", function () {
    it("confirms a challenge signed by the token's own chip", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const challenge = stringToHex("prove you are holding the sofubi");
      const signature = await chip.signMessage({
        message: { raw: keccak256(challenge) },
      });

      assert.equal(
        await season.read.isChipSignatureForToken([
          PAIRED_TOKEN_IDS[0],
          challenge,
          signature,
        ]),
        true,
      );
    });

    it("rejects a challenge signed by any other key", async function () {
      const chip = newChip();
      const season = await deployPairedTo([chip]);
      await mintWithChip(season, chip, collector.account.address);

      const challenge = stringToHex("prove you are holding the sofubi");
      const signature = await newChip().signMessage({
        message: { raw: keccak256(challenge) },
      });

      assert.equal(
        await season.read.isChipSignatureForToken([
          PAIRED_TOKEN_IDS[0],
          challenge,
          signature,
        ]),
        false,
      );
    });
  });

  describe("interface support", function () {
    it("advertises IPBT alongside ERC-721", async function () {
      const season = await deployPairedTo([newChip()]);

      assert.equal(await season.read.supportsInterface([IPBT_INTERFACE_ID]), true);
      assert.equal(
        await season.read.supportsInterface([ERC721_INTERFACE_ID]),
        true,
      );
      assert.equal(
        await season.read.supportsInterface([ERC165_INTERFACE_ID]),
        true,
      );
      assert.equal(await season.read.supportsInterface(["0xdeadbeef"]), false);
    });
  });
});
