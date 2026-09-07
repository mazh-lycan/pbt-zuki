import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Derived from the ten chip keys in chips.md, which stays out of git. These
// addresses are public by nature, but they are also permanent: the contract
// exposes no way to re-pair a chip after construction, so a wrong address here
// leaves that token unclaimable for good. Check them against the keys before
// deploying, see DEPLOY.md.
const CHIP_ADDRESSES: string[] = [
  "0xbF2CC3a338e618a17aD170ab4AC121c4d6e53a97",
  "0x16454468A26EFe74329cD67242A6a397FA049E6D",
  "0x6B1Be2380b74c0D189C10337AdeDCD262065EB0A",
];

// Positional: chip #1 in chips.md is paired to token 1, and token 1 resolves to
// the metadata file named `1`. Zero is not allowed, it is what an unpaired chip
// maps to. Chips 4–10 stay in chips.md for the full-set redeploy.
const TOKEN_IDS: bigint[] = [1n, 2n, 3n];

// One hour. The chip signs at the moment the claim button is pressed, so this
// only has to cover the gap until the transaction is mined, but a generous
// window means a collector fumbling with MetaMask in front of an audience does
// not watch the signature expire.
const MAX_DURATION_WINDOW: bigint = 3600n;

export default buildModule("Season1byMazh", (m) => {
  const chipAddresses = m.getParameter("chipAddresses", CHIP_ADDRESSES);
  const tokenIds = m.getParameter("tokenIds", TOKEN_IDS);
  const maxDurationWindow = m.getParameter(
    "maxDurationWindow",
    MAX_DURATION_WINDOW,
  );

  // Deliberately without a default. The metadata CID does not exist until the
  // folder is pinned, and deploying a placeholder by accident costs an owner
  // transaction to undo.
  const baseURI = m.getParameter("baseURI");

  const season = m.contract("Season1byMazh", [
    chipAddresses,
    tokenIds,
    maxDurationWindow,
    baseURI,
  ]);

  return { season };
});
