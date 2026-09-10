import { appendFileSync } from "node:fs";
import { ethers } from "ethers";

// Generates a fresh, random Ethereum keypair and appends it directly to
// .env -- never prints the private key to stdout, only the address, so it
// never ends up in a terminal scrollback or a session transcript. Used for
// identities that need to actually SIGN (e.g. the Approver), unlike
// addresses such as ENS_CERTIFIER_ADDRESS that only ever get checked via
// hasRoles and so never need a key at all.
//
// Usage: node generate-keypair.mjs <ENV_VAR_PREFIX>
// Writes <PREFIX>_ADDRESS and <PREFIX>_KEY to .env (relative to cwd).
const [, , prefix] = process.argv;
if (!prefix) {
  throw new Error("Usage: node generate-keypair.mjs <ENV_VAR_PREFIX>");
}

const wallet = ethers.Wallet.createRandom();
appendFileSync(".env", `${prefix}_ADDRESS=${wallet.address}\n${prefix}_KEY=${wallet.privateKey}\n`);
console.log(`${prefix}_ADDRESS=${wallet.address}`);
console.log(`(${prefix}_KEY written to .env, not printed here)`);
