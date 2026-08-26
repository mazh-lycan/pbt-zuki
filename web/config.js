export const config = {
  // Filled in after deploying Season1byMazh to Sepolia.
  contractAddress: "0x0000000000000000000000000000000000000000",

  chainId: 11155111,
  chainName: "Sepolia",

  // Only ever used for reads, so a public endpoint is enough. Swap for an
  // Alchemy or Infura URL if the public one rate-limits during the demo.
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",

  // Browsers cannot fetch ipfs:// directly, so every URI the contract returns
  // is rewritten through this gateway. A Pinata dedicated gateway looks like
  // https://<name>.mypinata.cloud/ipfs/ and will be faster than the shared one.
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",

  // Shown while a token is unclaimed, since tokenURI reverts before mint.
  placeholderImage: "./placeholder.svg",
};
