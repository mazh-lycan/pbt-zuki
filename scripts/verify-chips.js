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

let ok = keys.length === listed.length && keys.length > 0;

keys.forEach((key, index) => {
  const derived = new Wallet(key).address;
  const matches =
    listed[index] !== undefined && getAddress(listed[index]) === derived;

  if (!matches) {
    ok = false;
  }

  console.log(
    `${matches ? "ok      " : "MISMATCH"} token ${index + 1}  ${derived}` +
      (matches ? "" : `  module has ${listed[index]}`),
  );
});

if (ok) {
  console.log(`\nAll ${keys.length} chips pair correctly.`);
} else {
  console.error("\nDO NOT DEPLOY: the module does not match chips.md.");
  process.exitCode = 1;
}
