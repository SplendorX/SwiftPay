# Arc House / Discord / X — SwiftPay update session

Suggested Arc House board: Architects Lounge or Circle products and developer tooling.
Forum: https://community.arc.io/home/forum

---

## Arc House forum post

**Title:** SwiftPay build log — landing, payment requests, and Arc-native sign-in

Hey Arc House,

Sharing a SwiftPay update from this week’s build session. SwiftPay is a stablecoin payments app on **Arc Testnet** — send, request, swap, batch, save, and schedule USDC/EURC. Gas is paid in USDC, so the amount you see is the amount you spend.

**What shipped**

- **Landing page.** Replaced the dashboard mock with a welcome write-up and a side-by-side preview: SwiftPay wordmark + USDC → EURC motion on the left, and a framed in-app board on the right that cycles Swap, Send, and Request. After sign-in, **Launch App** opens the dashboard.
- **Sign-in.** Google (Circle user-controlled wallet) and external wallets stay as separate paths. A Google account now gets its own SwiftPay username/profile on first login. Disconnecting a wallet returns you to the landing page immediately.
- **Payment requests.** Request history was creating many versions of the same request. That’s fixed, and existing duplicate drafts are collapsed so only the latest copy remains.
- **Footer / presence.** X is now [getswiftpay](https://x.com/getswiftpay?s=11). Tagline: *The stablecoin payment layer.*

**Stack (unchanged)**

Arc Testnet (chain 5042002) · USDC-native gas · Circle W3S Google login · Circle-powered USDC/EURC swap · ArcScan receipts

Repo: https://github.com/SplendorX/SwiftPay

If you’re building payments or wallet UX on Arc, I’d like feedback on the landing preview and the request-collection flow. Happy to walk through any of it.

— Splendor / SwiftPay

---

## Discord

**SwiftPay update (Arc Testnet)**

Shipped a landing + sign-in pass this week.

- Welcome write-up + side-by-side preview (USDC → EURC + Swap/Send/Request board)
- Launch App goes to the dashboard after sign-in
- Wallet disconnect returns to landing immediately
- Payment request history no longer duplicates the same request
- Google (Circle W3S) and external wallets stay as separate accounts; Google login now creates its own username

USDC is gas on Arc, so what you see is what you spend.

Repo: https://github.com/SplendorX/SwiftPay
X: https://x.com/getswiftpay?s=11

Feedback welcome on the landing preview and request flow.

---

## X

SwiftPay update on Arc Testnet.

New landing: welcome copy + USDC→EURC preview beside Swap / Send / Request.

Launch App opens the dashboard after sign-in. Disconnect returns you home. Payment request history no longer duplicates.

Google (Circle) and external wallets stay separate. USDC is gas — what you see is what you spend.

https://github.com/SplendorX/SwiftPay
https://x.com/getswiftpay?s=11
