# TradersScope Learn & Paper mode guide

This document explains **Paper mode** and every **Learn** simulator in plain language. You do not need prior trading knowledge.

Paper trading here means **practice with fake money** on the same ASX desk prices you see in Markets and charts. It is **not** a real brokerage and does **not** send live orders.

---

## What is Paper mode?

TradersScope has two desk modes in the header:

| Mode | Meaning |
|------|---------|
| **Live** | Research view of shared desk data (markets, breadth, and paid patterns if unlocked). |
| **Paper** | Practice switch. Buy/Sell uses a fake **A$100,000** account saved on your signed-in user. |

Prices for practice fills come from desk data (latest available price, or a simulator bar close) — not from a broker.

**Important**

- Paper does **not** unlock paid Patterns / Create / Alerts by itself.
- Orders are **market buy/sell only** (no limit, stop, or short-sell yet).
- Your paper portfolio is **per signed-in account** and shared across Markets tickets, charts, and all Learn tools.

### How to turn Paper on

1. Sign in.
2. Click **Paper** in the header Live | Paper toggle.
3. Trade from **Markets**, a **stock chart**, or **Learn → Portfolio**.
4. Watch cash, holdings, and P&L on the Learn hub (and the header equity chip when shown).

---

## Learn hub

Open **Learn** in the top navigation (signed-in). Tabs:

1. Guide (this content in-app)
2. Portfolio
3. Session replay
4. Risk sizing
5. Pattern drill
6. What-if

---

### Portfolio

**What it is:** Your practice account statement — cash, holdings value, equity, total P&L vs A$100,000 start, recent trades.

**How to use**

1. Open Learn → Portfolio.
2. Enter ticker and quantity; choose Buy or Sell.
3. Submit; the fill uses the desk’s latest price for that name.
4. Optional: **Reset** restores A$100,000 cash and clears holdings/trades.

**Does not:** charge real money; model fees/slippage.

---

### Session replay

**What it is:** Play back an ASX session bar-by-bar (intraday 5m / 15m / 1h by default) and practice trading as the simulated clock moves. Fills go into the **same** paper portfolio.

**How to use**

1. Open Learn → Session replay (labelled Day replay / Session replay in the UI).
2. Tick the acknowledgement that fills update your paper portfolio.
3. Pick ticker, session date, and interval; click **Load session**.
4. Use Play / Pause / Step; Buy or Sell at the current bar’s close.
5. If intraday is empty, use **Daily fallback** (~last 60 daily bars).

**Does not:** replace a full charting package; guarantee intraday history for every ticker/date; use a separate replay-only wallet.

---

### Risk sizing

**What it is:** A long-trade calculator: given account size, risk %, entry, and stop, how many shares should you buy? Optionally paper-buy that size.

**How to use**

1. Open Learn → Risk sizing.
2. Enter ticker, account A$, risk %, entry, stop (entry must be above stop).
3. Read suggested shares / notional.
4. Optional: paper-buy that quantity.

**Does not:** place a real broker stop; size shorts; replace your own risk rules.

---

### Pattern drill

**What it is:** A quiz from the desk’s daily pattern scan. Context (ticker, sector, RS, RVOL, RSI, last) is shown; **pattern name and bias are hidden** until you choose.

**Scoring**

| Pattern bias | Expected choice |
|--------------|-----------------|
| Bullish | Buy |
| Bearish | Sell / avoid |
| Neutral | Skip |

Skip is **only** correct for neutral patterns.

**How to use**

1. Open Learn → Pattern drill.
2. Choose Buy, Skip, or Sell / avoid.
3. Review match vs bias; Next hit or optional Paper buy (qty editable).

**Does not:** give financial advice; replace reading a full chart; work if the daily pattern job has no hits yet.

---

### What-if

**What it is:** Read-only calculator — “If I bought N shares on date D, what is that worth at the latest desk close?”

**How to use**

1. Open Learn → What-if.
2. Enter ticker, buy date, quantity (buy price optional override).
3. Click **Mark to market**.
4. Entry uses the close on/before your buy date; mark uses the latest close.

**Does not:** place paper or live trades; model dividends/fees/corporate actions beyond simple prices.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Ticker** | Short code for a listed company (e.g. BHP). |
| **Fill** | Accepted practice buy/sell at a price. |
| **Mark** | Current price used to value a holding. |
| **P&L** | Profit and loss vs cost or starting cash. |
| **Equity** | Cash + market value of holdings. |
| **Stop** | Planned exit if the trade goes against you; used in risk sizing. |
| **Bias** | Bullish / bearish / neutral tag on a scanned pattern. |
| **Session** | A trading day window used by session replay. |

---

## Related in-product pages

- In-app: **Learn → Guide**
- Public: **How it works** → Practice tools section
