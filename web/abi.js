export const SEASON_ABI = [
  "function tokenIdFor(address chipId) view returns (uint256)",
  "function chipNonce(address chipId) view returns (bytes32)",
  "function isChipSignatureForToken(uint256 tokenId, bytes data, bytes signature) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function baseURI() view returns (string)",
  "function mint(address to, address chipId, bytes chipSignature, uint256 signatureTimestamp, bytes extras) returns (uint256)",
  "function transferToken(address to, address chipId, bytes chipSignature, uint256 signatureTimestamp, bool useSafeTransfer, bytes extras) returns (uint256)",
];
