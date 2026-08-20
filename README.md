# SureTrac LTL Freight Rates

A small Shopify carrier service that puts live GlobalTranz LTL rates into checkout.

Runs on Vercel's free tier. **Currently in mock mode** — it produces plausible
freight quotes without calling anything, so the whole pipeline can be built and
tested before the client sends real data.

---

## What it does

```
Customer checks out with an axle in the cart
        │
        ▼
Shopify POSTs the cart + address  ──►  /api/rates   (this app)
                                            │
                                            ▼
                                   GlobalTranz Rate V2
                                            │
                                            ▼
                          rates reformatted, marked up, returned
        │
        ▼
"LTL Freight (5 business days) — $392.41" appears at checkout
```

Shopify only accepts rates from a registered *carrier service*. That's the whole
reason this app exists — there's no way to point Shopify at GlobalTranz directly.

---

## Files

| File | What it's for |
|---|---|
| `api/rates.js` | The endpoint Shopify calls. Cart → shipment → quotes → rates. |
| `lib/freight-data.js` | **All dummy data lives here.** Swap for real values, change nothing else. |
| `lib/globaltranz.js` | The only file that knows GlobalTranz's request/response shape. |
| `scripts/test-local.js` | Runs six scenarios with no server and no network. |
| `scripts/register-carrier-service.js` | Registers the app with Shopify. Run once after deploying. |

---

## Try it now

```bash
node scripts/test-local.js
```

Six scenarios: near, mid and far destinations, a multi-item cart, an excluded
zip, and an unknown SKU falling back to the default freight spec.

---

## Swapping dummy data for real data

Everything marked `DUMMY` in `lib/freight-data.js`:

**From the freight agent**
- `freightClass` — currently `70`
- `nmfc` — currently `63140`
- `lengthIn` / `widthIn` / `heightIn` — currently 96 × 8 × 8
- `crateWeightLb` — currently 10
- `handlingUnit` — currently `Crate`

**From GlobalTranz**
- Production access key and GTZShip username
- Confirm the accessorial codes in `ACCESSORIAL_CODES`
- Confirm the endpoint path and auth header in `lib/globaltranz.js`

⚠ **The request and response shapes in `globaltranz.js` are guesses.** The doc
links in the PDF weren't readable, so `toGtzRequest` and `fromGtzResponse` must
be checked against the real Rate V2 docs. They're isolated in one file so fixing
them touches nothing else.

---

## The decision the client owes us

`ACCESSORIAL_MODE` in `freight-data.js`:

| Mode | Behaviour | Trade-off |
|---|---|---|
| `always` *(default)* | Every shipment quoted residential + liftgate | Never undercharge; slightly over-quotes commercial buyers |
| `detect` | Residential flag from Shopify, liftgate always | Closer to accurate; Shopify's residential flag isn't always right |
| `commercial` | Dock-to-dock only | Cheapest prices shown; someone must phone every residential customer |

Liftgate alone is around $95. Getting this wrong on a real order costs more than
the axle's margin.

---

## Going live

1. **Deploy** — push to GitHub, import into Vercel, or `vercel deploy`
2. **Environment variables** in Vercel:
   ```
   GTZ_MOCK=false
   GTZ_ACCESS_KEY=<production key>
   GTZ_USERNAME=<GTZShip username, not email>
   GTZ_PASSWORD=<GTZShip password>
   ```
3. **Custom app in Shopify** — Settings → Apps → Develop apps → create one with
   the `write_shipping` scope, install it, copy the access token
4. **Register**
   ```bash
   SHOP=p844an-5c TOKEN=shpat_xxx \
   CALLBACK=https://your-app.vercel.app/api/rates \
   node scripts/register-carrier-service.js
   ```
5. **Attach it** — Settings → Shipping → Freight profile → your zone →
   Add shipping option → Use carrier or app → *SureTrac LTL Freight*
6. **Remove the $249 flat rate**
7. **Test checkout** with an axle in the cart

---

## Safety rails already built in

- **Timeout** — GlobalTranz is given 7 seconds; Shopify's limit is about 10
- **Fallback rate** — if the API fails or times out, `$249` is returned so
  checkout never dead-ends
- **Price floor** — never quotes below `$120` regardless of what comes back
- **Excluded zips** — Alaska, Hawaii and Puerto Rico return no rate rather than
  a wrong one
- **Unknown SKUs** — fall back to a conservative freight spec instead of failing

---

## Not built yet

- **Booking** — calling the Shipment API after an order is paid to get a BOL.
  Note a `quoteId` is single-use and expires, so booking should re-quote rather
  than reuse the checkout quote.
- **Tracking** — pushing BOL status into Shopify fulfilments.

Both are worth doing once rating is proven in production.
