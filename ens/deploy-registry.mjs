import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { VERIFIABLE_FACTORY, USER_REGISTRY_IMPL } from "./addresses.mjs";
import { REGISTRY_ROLES, bitmap } from "./roles.mjs";

const abi = (name) => JSON.parse(readFileSync(new URL(`./abi/${name}.abi.json`, import.meta.url)));

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.SEPOLIA_DEPLOYER_KEY, provider);
const factory = new ethers.Contract(VERIFIABLE_FACTORY, abi("VerifiableFactory"), wallet);
const registryImplIface = new ethers.Interface(abi("UserRegistryImpl"));

const rootAccount = process.argv[2] || wallet.address;

const roleBitmap = bitmap(
  REGISTRY_ROLES.REGISTRAR,
  REGISTRY_ROLES.REGISTRAR_ADMIN,
  REGISTRY_ROLES.SET_SUBREGISTRY,
  REGISTRY_ROLES.SET_SUBREGISTRY_ADMIN,
  REGISTRY_ROLES.SET_RESOLVER,
  REGISTRY_ROLES.SET_RESOLVER_ADMIN,
  REGISTRY_ROLES.RENEW,
  REGISTRY_ROLES.UNREGISTER,
);
const initData = registryImplIface.encodeFunctionData("initialize", [rootAccount, roleBitmap]);
const salt = BigInt(ethers.hexlify(ethers.randomBytes(32)));

const tx = await factory.deployProxy(USER_REGISTRY_IMPL, salt, initData);
const receipt = await tx.wait();
const event = receipt.logs
  .map((l) => {
    try {
      return factory.interface.parseLog(l);
    } catch {
      return null;
    }
  })
  .find((e) => e?.name === "ProxyDeployed");

console.log(event.args.proxyAddress);
