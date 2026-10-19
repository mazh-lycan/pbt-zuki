# The payable transfer question
My honest opinion: don't make payment mandatory on the transfer path. Keep it as a second, opt-in path alongside the free chip transfer.

The reason is that the free transfer is your core premise. Items get gifted, inherited, traded at conventions, sold for cash, or moved between a gallery and a warehouse. If moving the PBT requires an on-chain payment, people simply won't move it — they'll hand over the object and leave the token behind. Your provenance record goes stale, and a stale record is worth nothing, which kills the exact property that made royalties plausible in the first place.

So the scheme I'd hold in my head is two paths over the same chip signature. Path A is what you have now: scan, transfer, no price, always available. Path B is a payable settlement function where the buyer pays, the contract splits the creator's royalty and forwards the rest to the seller, moves the token, and emits a Sale event carrying price and parties. Path B is atomic in a way an off-chain deal never is: the buyer can't pay without receiving, the seller can't be paid without releasing.

That reframes royalties from enforcement to incentive, which is uncomfortable but true — you cannot compel a royalty while a free path exists, and closing the free path breaks the product. So the real design question becomes: why would anyone choose Path B? Plausible answers are on-chain proof of purchase price (which matters for insurance and for the next resale), creator-granted perks or warranty tied to registered sales, and a provenance history that visibly distinguishes "verified sale" from "unrecorded transfer." Those are product decisions, not contract decisions.

On the money side, I'd separate three layers that people usually conflate:

The wallet layer is where the biggest UX win is, and it's independent of payments. An embedded wallet with email or passkey login (Privy, Dynamic, Coinbase Smart Wallet) plus an ERC-4337 paymaster means your sofubi buyer never sees a seed phrase and never needs to hold ETH for gas, because you sponsor it. That alone converts most of your non-crypto audience.

The money-in layer is an on-ramp widget — Stripe's crypto on-ramp, Coinbase Onramp, MoonPay, Transak — turning a card payment into USDC in that embedded wallet, with KYC sitting on the provider rather than on you. I'd favour USDC over USDT specifically because USDC supports EIP-2612 permit, so a buyer can approve and pay in one signature and one transaction; USDT has no permit on mainnet and forces a clunky two-step approve.

The money-out layer is the one people forget and the one that will hurt: your seller ends up holding USDC and needs an off-ramp with its own KYC to turn it into rent money. A toy collector selling a piece for €200 will not enjoy that.

Which is why the genuine fork in the road is whether you go custodial. If you take fiat through Stripe and your backend performs the settlement and pays the creator, the experience becomes as smooth as any normal shop, and the seller gets a bank transfer. The costs are real though: the on-chain price becomes your attestation rather than a trustless fact, and handling other people's money for resale puts you in money-transmitter territory. Everything downstream in your architecture depends on that choice, so it's worth deciding early even if the answer is "not yet."

Two smaller notes. Gas economics make an L2 close to mandatory — splitting a royalty on a €150 sale on mainnet is farcical, and Base has both cheap execution and the smoothest fiat path today. And ERC-2981 is cheap to add as a signal, but it's essentially decorative for you, since transferFrom reverts and no external marketplace can execute a sale on these tokens at all. Your royalty logic has to live in your own settlement function.

## SECURITY HIGHLIGHT

One subtlety for whenever you build Path B: the chip signs to and extras, and the chip is in the seller's hands at handover, so the chip signature is effectively the seller's consent. Encoding price and split into extras therefore makes the terms part of what the seller signed, which is exactly what you want. But decide what happens when the on-chain owner and the physical holder have diverged — someone bought the object and never claimed the token — because paying ownerOf(tokenId) would send the money to the wrong person.

I'd get Path A working end to end with real people scanning real tags before designing Path B. What you learn from watching someone scan a toy in a shop will change the settlement design more than any amount of upfront modelling.