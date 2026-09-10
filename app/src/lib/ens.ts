import { ethers } from "ethers";
import { ENS_BRONTE_REGISTRY_ADDRESS, ENS_EVENTS_START_BLOCK, MINTER_ROLE, SEPOLIA_RPC_URL, TEXT_RECORD_KEYS } from "./constants";

const REGISTRY_ABI = [
  "function getResolver(string label) view returns (address)",
  "function findExpiry(string label) view returns (uint64)",
  "function findTokenId(string label) view returns (uint256)",
  "function hasRoles(uint256 anyId, uint256 roleBitmap, address account) view returns (bool)",
  "event EACRolesChanged(uint256 indexed resource, address indexed account, uint256 oldRoleBitmap, uint256 newRoleBitmap)",
];

const RESOLVER_ABI = ["function text(bytes32 node, string key) view returns (string)"];

let provider: ethers.JsonRpcProvider | null = null;
function getProvider(): ethers.JsonRpcProvider {
  if (!provider) provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  return provider;
}

export class EnsReadError extends Error {}

export type SeasonEnsState = {
  name: string;
  label: string;
  node: string;
  resolves: boolean;
  resolverAddress: string;
  expiry: bigint;
  textRecords: Record<string, string>;
  minterHolders: string[];
};

// Role holders aren't enumerable directly -- hasRoles only answers "does
// this ONE account hold this role." So this reconstructs the candidate set
// from every EACRolesChanged event this registry has ever emitted (the
// `account` an event names is a fixed, indexed topic, cheap to filter on),
// then confirms CURRENT status for each with a live hasRoles call rather
// than trying to reimplement the registry's own expiry/version-shift logic
// client-side -- the same _constructResource subtlety documented in
// CLAUDE.md ("Making retirement permanent") is exactly why that logic
// belongs to the contract, not a reimplementation here.
async function findCurrentMinterHolders(registry: ethers.Contract, tokenId: bigint): Promise<string[]> {
  const logs = await registry.queryFilter(registry.filters.EACRolesChanged(), ENS_EVENTS_START_BLOCK);
  const candidates = new Set<string>();
  for (const log of logs) {
    if ("args" in log && log.args) candidates.add(log.args.account as string);
  }
  const checks = await Promise.all(
    [...candidates].map(async (account) => {
      const has = await registry.hasRoles(tokenId, MINTER_ROLE, account);
      return { account, has };
    }),
  );
  return checks.filter((c) => c.has).map((c) => c.account);
}

// A single text record, read live -- no caching, no event scan. Lighter
// than readSeasonEnsState for a caller (the Demo tab's transform ceiling
// display) that only needs one value, read once, not the season's whole
// ENS state including a role-holder event scan.
export async function readTextRecord(label: string, key: string): Promise<string> {
  const p = getProvider();
  const registry = new ethers.Contract(ENS_BRONTE_REGISTRY_ADDRESS, REGISTRY_ABI, p);
  const node = ethers.namehash(`${label}.bronte.quota.eth`);
  const resolverAddress: string = await registry.getResolver(label);
  if (resolverAddress === ethers.ZeroAddress) {
    throw new EnsReadError(`"${label}.bronte.quota.eth" does not currently resolve.`);
  }
  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, p);
  return resolver.text(node, key);
}

export async function readSeasonEnsState(label: string): Promise<SeasonEnsState> {
  const p = getProvider();
  const registry = new ethers.Contract(ENS_BRONTE_REGISTRY_ADDRESS, REGISTRY_ABI, p);
  const name = `${label}.bronte.quota.eth`;
  const node = ethers.namehash(name);

  let resolverAddress: string;
  let expiry: bigint;
  let tokenId: bigint;
  try {
    [resolverAddress, expiry, tokenId] = await Promise.all([
      registry.getResolver(label),
      registry.findExpiry(label),
      registry.findTokenId(label),
    ]);
  } catch {
    throw new EnsReadError(`Could not read "${name}" from the Sepolia registry.`);
  }

  const resolves = resolverAddress !== ethers.ZeroAddress;

  let textRecords: Record<string, string> = {};
  if (resolves) {
    const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, p);
    const entries = await Promise.all(
      TEXT_RECORD_KEYS.map(async (key) => {
        try {
          const value: string = await resolver.text(node, key);
          return [key, value] as const;
        } catch {
          return [key, ""] as const;
        }
      }),
    );
    textRecords = Object.fromEntries(entries.filter(([, v]) => v !== ""));
  }

  const minterHolders = await findCurrentMinterHolders(registry, tokenId);

  return { name, label, node, resolves, resolverAddress, expiry, textRecords, minterHolders };
}
