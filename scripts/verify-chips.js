import { readFileSync } from "node:fs";

import { Wallet, getAddress } from "ethers";

// The constructor pairing is permanent: Season1byMazh has no way to re-pair a
// chip after deployment, so an address that does not match its key leaves that
// token unclaimable forever. Run this before every deploy.
const keys = [
  ...readFileSync("chips.md", "utf8").matchAll(
    /Private key of the wallet:\s+(0x[0-9a-fA-F]{64})/g,
  ),
].map((match) => match[1]);

const listed = [
  ...readFileSync("ignition/modules/Season1byMazh.ts", "utf8").matchAll(
    /"(0x[0-9a-fA-F]{40})"/g,
  ),
].map((match) => match[1]);

// The module may list fewer chips than chips.md holds, which is how the
// 3-token trial run deploys. Anything beyond the keys on file is a mistake.
let ok = listed.length > 0 && listed.length <= keys.length;

if (!ok) {
  console.error(
    `The module lists ${listed.length} addresses but chips.md holds ${keys.length} keys.`,
  );
}

// A typo can break the checksum rather than just point elsewhere, and
// getAddress throws on that, so normalising has to be allowed to fail.
function normalise(address) {
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

listed.forEach((address, index) => {
  const key = keys[index];
  const derived = key === undefined ? null : new Wallet(key).address;
  const matches = derived !== null && normalise(address) === derived;

  if (!matches) {
    ok = false;
  }

  console.log(
    `${matches ? "ok      " : "MISMATCH"} token ${index + 1}  ${address}` +
      (matches ? "" : `  key derives ${derived ?? "nothing, no key on file"}`),
  );
});

if (ok) {
  const scope =
    listed.length === keys.length
      ? `All ${listed.length} chips`
      : `The ${listed.length} chips in the module (of ${keys.length} on file)`;
  console.log(`\n${scope} pair correctly.`);
} else {
  console.error("\nDO NOT DEPLOY: the module does not match chips.md.");
  process.exitCode = 1;
}
