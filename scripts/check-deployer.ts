import { network } from "hardhat";
import { formatEther } from "viem";

const { viem } = await network.create("arbitrumSepolia");
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const address = wallet.account.address;
const [balance, chainId] = await Promise.all([
  publicClient.getBalance({ address }),
  publicClient.getChainId(),
]);

console.log(`network: ${chainId}`);
console.log(`deployer: ${address}`);
console.log(`balance: ${formatEther(balance)} ETH`);
