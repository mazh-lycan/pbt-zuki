import { ethers } from "ethers";
const wallet = ethers.Wallet.createRandom();

console.log("Address of the wallet: ", wallet.address);
console.log("Public key of the wallet: ", wallet.publicKey);
console.log("Private key of the wallet: ", wallet.privateKey);