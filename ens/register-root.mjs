import { readFileSync, appendFileSync } from "node:fs";
import { ethers } from "ethers";
import {
  ETH_REGISTRAR,
  MOCK_DAI,
  VERIFIABLE_FACTORY,
  USER_REGISTRY_IMPL,
  PERMISSIONED_RESOLVER_IMPL,
} from "./addresses.mjs";
import { REGISTRY_ROLES, RESOLVER_ROLES, bitmap } from "./roles.mjs";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);

const registrar = new ethers.Contract(ETH_REGISTRAR, abi("ETHRegistrar"), wallet);
const dai = new ethers.Contract(MOCK_DAI, abi("MockDAI"), wallet);
const factory = new ethers.Contract(VERIFIABLE_FACTORY, abi("VerifiableFactory"), wallet);
const registryImplIface = new ethers.Interface(abi("UserRegistryImpl"));
const resolverImplIface = new ethers.Interface(abi("PermissionedResolverImpl"));

const LABEL = "quota";

console.log(`Checking availability of ${LABEL}.eth...`);
const available = await registrar.isAvailable(LABEL);
if (!available) throw new Error(`${LABEL}.eth is not available`);
console.log("Available.");

const duration = await registrar.MIN_REGISTER_DURATION();
const [base, premium] = await registrar.getRegisterPrice(LABEL, duration, MOCK_DAI);
const price = base + premium;
console.log(`Price: ${ethers.formatUnits(price, 18)} MockDAI for ${duration}s (${Number(duration) / 86400} days)`);

const daiBalance = await dai.balanceOf(wallet.address);
if (daiBalance < price) {
  console.log("Minting MockDAI (testnet mock token, public mint function)...");
  const mintTx = await dai.mint(wallet.address, price * 2n);
  await mintTx.wait();
}
console.log("MockDAI balance:", ethers.formatUnits(await dai.balanceOf(wallet.address), 18));

console.log("Approving registrar to spend MockDAI...");
const approveTx = await dai.approve(ETH_REGISTRAR, price);
await approveTx.wait();

// Deploy our own registry instance to hold quota.eth's subnames (bronte,
// and future consortia). We grant ourselves the registry-management roles
// on ROOT_RESOURCE of this instance -- they cascade to every name in it.
console.log("Deploying quota.eth's subregistry...");
const registryRoleBitmap = bitmap(
  REGISTRY_ROLES.REGISTRAR,
  REGISTRY_ROLES.REGISTRAR_ADMIN,
  REGISTRY_ROLES.SET_SUBREGISTRY,
  REGISTRY_ROLES.SET_SUBREGISTRY_ADMIN,
  REGISTRY_ROLES.SET_RESOLVER,
  REGISTRY_ROLES.SET_RESOLVER_ADMIN,
  REGISTRY_ROLES.RENEW,
  REGISTRY_ROLES.UNREGISTER,
);
const registryInitData = registryImplIface.encodeFunctionData("initialize", [
  wallet.address,
  registryRoleBitmap,
]);
const registrySalt = BigInt(ethers.hexlify(ethers.randomBytes(32)));
const deployRegistryTx = await factory.deployProxy(USER_REGISTRY_IMPL, registrySalt, registryInitData);
const registryReceipt = await deployRegistryTx.wait();
const registryDeployedEvent = registryReceipt.logs
  .map((l) => {
    try {
      return factory.interface.parseLog(l);
    } catch {
      return null;
    }
  })
  .find((e) => e?.name === "ProxyDeployed");
const quotaRegistryAddress = registryDeployedEvent.args.proxyAddress;
console.log("quota.eth subregistry deployed:", quotaRegistryAddress);

// Deploy one shared resolver instance -- text() takes `node` as a parameter,
// so a single resolver can serve every node in the whole quota.eth tree.
console.log("Deploying shared resolver...");
const resolverRoleBitmap = bitmap(
  RESOLVER_ROLES.SET_ADDR,
  RESOLVER_ROLES.SET_TEXT,
  RESOLVER_ROLES.SET_TEXT_ADMIN,
);
const resolverInitData = resolverImplIface.encodeFunctionData("initialize", [
  wallet.address,
  resolverRoleBitmap,
  [],
]);
const resolverSalt = BigInt(ethers.hexlify(ethers.randomBytes(32)));
const deployResolverTx = await factory.deployProxy(
  PERMISSIONED_RESOLVER_IMPL,
  resolverSalt,
  resolverInitData,
);
const resolverReceipt = await deployResolverTx.wait();
const resolverDeployedEvent = resolverReceipt.logs
  .map((l) => {
    try {
      return factory.interface.parseLog(l);
    } catch {
      return null;
    }
  })
  .find((e) => e?.name === "ProxyDeployed");
const resolverAddress = resolverDeployedEvent.args.proxyAddress;
console.log("Shared resolver deployed:", resolverAddress);

// Commit-reveal registration of quota.eth itself.
const secret = ethers.hexlify(ethers.randomBytes(32));
const commitment = await registrar.makeCommitment(
  LABEL,
  wallet.address,
  secret,
  quotaRegistryAddress,
  resolverAddress,
  duration,
  ethers.ZeroHash,
);
console.log("Committing...");
const commitTx = await registrar.commit(commitment);
await commitTx.wait();

const minAge = await registrar.MIN_COMMITMENT_AGE();
console.log(`Waiting ${minAge}s for commitment to mature...`);
await new Promise((resolve) => setTimeout(resolve, Number(minAge) * 1000 + 5000));

console.log(`Registering ${LABEL}.eth...`);
const registerTx = await registrar.register(
  LABEL,
  wallet.address,
  secret,
  quotaRegistryAddress,
  resolverAddress,
  duration,
  MOCK_DAI,
  ethers.ZeroHash,
);
const registerReceipt = await registerTx.wait();
console.log("quota.eth registered. Tx:", registerReceipt.hash);

appendFileSync(
  new URL("../.env", import.meta.url),
  `ENS_QUOTA_REGISTRY_ADDRESS=${quotaRegistryAddress}\nENS_RESOLVER_ADDRESS=${resolverAddress}\n`,
);
console.log("Recorded ENS_QUOTA_REGISTRY_ADDRESS and ENS_RESOLVER_ADDRESS in .env");
