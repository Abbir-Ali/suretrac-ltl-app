/**
 * SHOPIFY CARRIER SERVICE ENDPOINT
 *
 * Shopify POSTs here during checkout when the cart contains a freight item.
 * We must answer within ~10 seconds with rates, or Shopify shows nothing.
 *
 * Deployed at:  https://<your-app>.vercel.app/api/rates
 */

import {
  FREIGHT_ITEMS, FALLBACK_ITEM, CONFIG,
  ACCESSORIAL_MODE, ACCESSORIAL_CODES
} from '../lib/freight-data.js';
import { getRates } from '../lib/globaltranz.js';

const GRAMS_PER_LB = 453.59237;

export default async function handler(req, res) {
  // GET → self-test page, so you can confirm the deployment works in a browser
  if (req.method === 'GET') {
    const sample = {
      rate: {
        origin: { postal_code: '29569', province: 'SC', country: 'US' },
        destination: { postal_code: '10003', province: 'NY', country: 'US', residential: true },
        items: [{ name: '3.5K Straight Axle', sku: 'ST-AXLE-35K-IDLER',
                  quantity: 1, grams: 61235, requires_shipping: true }],
        currency: 'USD'
      }
    };
    const shipment = buildShipment(sample.rate);
    let quotes = [];
    try { quotes = await getRates(shipment); } catch (e) { /* ignore in self-test */ }
    return res.status(200).json({
      status: 'ok',
      message: 'LTL rate endpoint is live. Shopify POSTs here during checkout.',
      mockMode: process.env.GTZ_MOCK !== 'false',
      accessorialMode: ACCESSORIAL_MODE,
      sampleRequest: sample,
      sampleShipment: shipment,
      sampleRates: toShopifyRates(quotes)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST or GET only' });
  }

  const started = Date.now();

  try {
    const rate = req.body?.rate;
    if (!rate) return res.status(400).json({ error: 'missing rate object' });

    const destZip = String(rate.destination?.postal_code || '');

    // 1 ── refuse zips we can't serve, rather than quoting something wrong
    if (CONFIG.excludedZipPrefixes.some((p) => destZip.startsWith(p))) {
      log('excluded zip', { destZip });
      return res.status(200).json({ rates: [] });
    }

    // 2 ── turn Shopify's cart into a freight shipment
    const shipment = buildShipment(rate);
    if (!shipment.items.length) {
      log('no freight items in cart');
      return res.status(200).json({ rates: [] });
    }

    // 3 ── ask GlobalTranz
    let quotes = [];
    try {
      quotes = await getRates(shipment);
    } catch (err) {
      log('GTZ failed', { message: err.message });
      return res.status(200).json({ rates: fallbackRate() });
    }

    if (!quotes.length) {
      log('GTZ returned no quotes');
      return res.status(200).json({ rates: fallbackRate() });
    }

    // 4 ── price it up and hand back to Shopify
    const out = toShopifyRates(quotes);
    log('ok', { ms: Date.now() - started, quotes: quotes.length, cheapest: out[0]?.total_price });
    return res.status(200).json({ rates: out });

  } catch (err) {
    log('unhandled', { message: err.message });
    return res.status(200).json({ rates: fallbackRate() });
  }
}

/* -------------------------------------------------------------------------- */
/* Shopify cart  →  freight shipment                                          */
/* -------------------------------------------------------------------------- */
export function buildShipment(rate) {
  const items = (rate.items || [])
    .map((line) => {
      const spec = FREIGHT_ITEMS[line.sku];
      if (!spec && !line.requires_shipping) return null;
      const s = spec || FALLBACK_ITEM;

      const productLb = (line.grams || 0) / GRAMS_PER_LB;
      return {
        sku: line.sku,
        description: s.description || line.name,
        quantity: line.quantity || 1,
        weightLb: Math.round((productLb + s.crateWeightLb) * 10) / 10,
        freightClass: s.freightClass,
        nmfc: s.nmfc,
        handlingUnit: s.handlingUnit,
        lengthIn: s.lengthIn,
        widthIn: s.widthIn,
        heightIn: s.heightIn,
        stackable: s.stackable,
        known: Boolean(spec)
      };
    })
    .filter(Boolean);

  return {
    origin: {
      zip: rate.origin?.postal_code,
      state: rate.origin?.province
    },
    destination: {
      zip: rate.destination?.postal_code,
      state: rate.destination?.province,
      residential: rate.destination?.residential !== false
    },
    items,
    accessorials: accessorialsFor(rate)
  };
}

export function accessorialsFor(rate) {
  const a = [];
  const residential = rate.destination?.residential !== false;

  if (ACCESSORIAL_MODE === 'always') {
    a.push(ACCESSORIAL_CODES.residential, ACCESSORIAL_CODES.liftgate);
  } else if (ACCESSORIAL_MODE === 'detect') {
    if (residential) a.push(ACCESSORIAL_CODES.residential);
    a.push(ACCESSORIAL_CODES.liftgate);
  }
  // 'commercial' → nothing; someone phones the customer
  return a;
}

/* -------------------------------------------------------------------------- */
/* Quotes  →  Shopify rate objects                                            */
/* -------------------------------------------------------------------------- */
export function toShopifyRates(quotes) {
  const priced = quotes
    .map((q) => {
      let total = q.totalUsd * (1 + CONFIG.markupPercent / 100) + CONFIG.markupFlatUsd;
      total = Math.max(total, CONFIG.floorUsd);
      return { ...q, customerUsd: Math.round(total * 100) / 100 };
    })
    .sort((a, b) => a.customerUsd - b.customerUsd);

  const chosen = CONFIG.quoteDisplay === 'cheapest' ? priced.slice(0, 1) : priced;

  return chosen.map((q) => ({
    service_name:
      CONFIG.quoteDisplay === 'cheapest'
        ? `LTL Freight (${q.transitDays} business days)`
        : `LTL Freight — ${q.carrier} (${q.transitDays} business days)`,
    service_code: `LTL_${q.scac || 'STD'}`,
    total_price: String(Math.round(q.customerUsd * 100)),   // Shopify wants cents
    currency: 'USD',
    description: 'Curbside delivery by freight carrier. Carrier will call to arrange delivery.',
    min_delivery_date: addBusinessDays(q.transitDays).toISOString(),
    max_delivery_date: addBusinessDays(q.transitDays + 2).toISOString(),
    // quoteId travels back with the order so booking can reference it
    phone_required: true
  }));
}

function fallbackRate() {
  if (CONFIG.fallbackRateUsd == null) return [];
  return [{
    service_name: 'LTL Freight (5-7 business days)',
    service_code: 'LTL_FALLBACK',
    total_price: String(Math.round(CONFIG.fallbackRateUsd * 100)),
    currency: 'USD',
    description: 'Curbside freight delivery. We will confirm details after your order.',
    phone_required: true
  }];
}

function addBusinessDays(n) {
  const d = new Date();
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d;
}

function log(msg, data = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...data }));
}
