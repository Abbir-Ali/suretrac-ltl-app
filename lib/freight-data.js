/**
 * FREIGHT DATA  —  the only file you need to change when the client sends real values.
 *
 * Everything here is DUMMY data chosen to be plausible. Each field is marked
 * with who supplies the real value. Nothing else in the app needs editing.
 */

// ---------------------------------------------------------------------------
// Per-SKU freight profile.  Key = the SKU on the Shopify variant.
// ---------------------------------------------------------------------------
export const FREIGHT_ITEMS = {
  'ST-AXLE-35K-IDLER': {
    description: '3.5K Straight Idler Axle',
    freightClass: '70',        // DUMMY — freight agent supplies. Crated steel ≈ 70
    nmfc: '63140',             // DUMMY — freight agent supplies
    handlingUnit: 'Crate',     // DUMMY — crate or pallet?
    lengthIn: 96,              // DUMMY — measure the packed crate
    widthIn: 8,                // DUMMY
    heightIn: 8,               // DUMMY
    crateWeightLb: 10,         // DUMMY — empty crate weight, added to product weight
    stackable: false
  }

  // Add more heavy SKUs here as the catalogue grows.
};

// ---------------------------------------------------------------------------
// Used when a SKU reaches this app but isn't in the table above.
// Better to quote something conservative than to fail the checkout.
// ---------------------------------------------------------------------------
export const FALLBACK_ITEM = {
  description: 'Uncategorised freight item',
  freightClass: '85',          // higher class = higher price = safer to over-quote
  nmfc: '63140',
  handlingUnit: 'Pallet',
  lengthIn: 48,
  widthIn: 40,
  heightIn: 40,
  crateWeightLb: 40,
  stackable: false
};

// ---------------------------------------------------------------------------
// Accessorials.  See README — this is the decision the client has to make.
//   'always'    → every shipment quoted residential + liftgate  (never undercharge)
//   'detect'    → residential flag from Shopify, liftgate always
//   'commercial'→ dock-to-dock only, someone phones the customer afterwards
// ---------------------------------------------------------------------------
export const ACCESSORIAL_MODE = 'always';

export const ACCESSORIAL_CODES = {
  residential: 'RESIDENTIAL_DELIVERY',   // TODO confirm exact code with GlobalTranz
  liftgate: 'LIFTGATE_DELIVERY',         // TODO confirm
  limitedAccess: 'LIMITED_ACCESS_DELIVERY', // TODO confirm
  appointment: 'DELIVERY_APPOINTMENT'     // TODO confirm
};

// ---------------------------------------------------------------------------
// Commercial settings
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Added on top of the carrier's price. Covers crating, labour, margin.
  markupPercent: 12,
  markupFlatUsd: 0,

  // Show every carrier, or only the cheapest?
  //   'cheapest' → one line at checkout, simplest for the customer
  //   'all'      → customer picks carrier and transit time
  quoteDisplay: 'cheapest',

  // Never quote below this, whatever the API returns.
  floorUsd: 120,

  // If GlobalTranz fails or times out, fall back to this flat rate so
  // checkout never dead-ends. Set null to show nothing instead.
  fallbackRateUsd: 249,

  // Zips we refuse to quote (AK, HI, PR handled by prefix).
  excludedZipPrefixes: ['995', '996', '997', '998', '999', '967', '968', '006', '007', '009'],

  // Shopify drops the request after ~10s. Give ourselves room to fall back.
  gtzTimeoutMs: 7000
};

// ---------------------------------------------------------------------------
// GlobalTranz credentials.  Development values from the API PDF.
// Move to environment variables before going anywhere near production.
// ---------------------------------------------------------------------------
export const GTZ = {
  baseUrl: process.env.GTZ_BASE_URL || 'https://api.gtzintegrate.com',
  accessKey: process.env.GTZ_ACCESS_KEY || 'DEV_KEY_FROM_PDF',
  username: process.env.GTZ_USERNAME || 'apitesting',
  password: process.env.GTZ_PASSWORD || 'DEV_PASSWORD_FROM_PDF',

  // true  → no network calls, returns simulated quotes. Use until the real key lands.
  // false → calls GlobalTranz for real.
  mockMode: process.env.GTZ_MOCK !== 'false'
};
