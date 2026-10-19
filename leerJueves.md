I’ll walk through Blaze’s chip swap against the actual mint and pairing code so the hole (and the extra check) is concrete.

Blaze is token 2. At deploy the contract stores two facts:

“The figure Blaze currently wears chip OldBlaze.” (_chipIds[2] → OldBlaze)
“Chip OldBlaze is the tag for token 2.” (_tokenIds[OldBlaze] → 2)
Brocken and Fang are the same idea for tokens 1 and 3. None of them have to be minted yet — pairing is just “this sofubi ↔ this sticker.”

Something happens to Blaze’s tag. The NFC peels off the foot, the chip dies, or you find the #k= key was leaked. You glue a new sticker on Blaze and, as owner, call updateChip(2, NewBlaze).

_setChip only writes the new pair:

Blaze now wears NewBlaze (_chipIds[2] → NewBlaze)
NewBlaze is token 2 (_tokenIds[NewBlaze] → 2)
It does not erase the old row. _tokenIds[OldBlaze] is still 2. The peeled sticker still “remembers” it is Blaze.

Without the extra check, mint does this:

Does OldBlaze’s signature check out? Yes — the old key still signs.
Which token is this chip? Look up _tokenIds[OldBlaze] → 2 (Blaze).
Does Blaze have some chip assigned? _chipIds[2] is NewBlaze, not zero, so PBTSimple says OK.
Then it mints token 2. The dead/leaked sticker can still claim Blaze if nobody has minted him yet. You would have two physical keys for one figure: the new one on the toy, and the old one in someone’s pocket.

tokenIdFor (used on transfer) is stricter: it also asks “is this chip still the one glued on that token?” OldBlaze fails that, so after a swap the old tag cannot move Blaze. The hole was only first mint.

The override is that last question after PBTSimple’s checks:


Season1byMazh.sol
Lines 99-99
        if (_chipIds[tokenId] != chipId) revert NoMappedTokenForChip();
In the story: “Is OldBlaze still the sticker on Blaze?” No — Blaze wears NewBlaze. Revert. Only a scan of the new tag can mint Brocken’s sibling.

Brocken and Fang are untouched. Their chips never went through updateChip, so both mappings still match.

Once Blaze is minted, even the library path is safe for transfers. The extra check matters for the window after you restick Blaze and before anyone claims him — which is exactly when you’d replace a tag on an unclaimed piece.

