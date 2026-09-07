export const config = {
  // Filled in after deploying Season1byMazh to Arbitrum Sepolia.
  contractAddress: "0x74C88f46fC08248c02bbb02ccDD2574310a45e8E",

  chainId: 421614,
  chainName: "Arbitrum Sepolia",
  explorerUrl: "https://sepolia.arbiscan.io",

  // Only ever used for reads, so a public endpoint is enough. Swap for an
  // Alchemy or Infura URL if the public one rate-limits during the demo.
  rpcUrl: "https://arbitrum-sepolia.drpc.org",

  // Browsers cannot fetch ipfs:// directly. The public Pinata gateway is the
  // committed default; a dedicated gateway belongs in gitignored config.local.js.
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",

  // Shown while a token is unclaimed, since tokenURI reverts before mint.
  placeholderImage: "./placeholder.svg",
};

try {
  const { localConfig } = await import("./config.local.js");
  Object.assign(config, localConfig);
} catch {
  // No local override, which is the GitHub Pages case.
}
