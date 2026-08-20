/**
 * GLOBALTRANZ ADAPTER
 *
 * The only file that knows GlobalTranz's request/response shape. When the real
 * API docs are read, corrections happen here and nowhere else.
 *
 * ⚠ The request and response shapes below are BEST GUESSES. The doc links in the
 *   PDF weren't machine-readable, so `toGtzRequest` and `fromGtzResponse` must be
 *   checked against the real Rate V2 documentation before production.
 *   Everything else in this app is shape-independent.
 */

import { GTZ, CONFIG } from './freight-data.js';

/* -------------------------------------------------------------------------- */
/* Build the outbound request                                                  */
/* -------------------------------------------------------------------------- */
export function toGtzRequest(shipment) {
  return {
    origin: {
      postalCode: shipment.origin.zip,
      stateProvince: shipment.origin.state,
      country: 'USA'
    },
    destination: {
      postalCode: shipment.destination.zip,
      stateProvince: shipment.destination.state,
      country: 'USA'
    },
    items: shipment.items.map((it) => ({
      description: it.description,
      weight: it.weightLb,
      weightUnit: 'LBS',
      freightClass: it.freightClass,
      nmfc: it.nmfc,
      quantity: it.quantity,
      packageType: it.handlingUnit,
      length: it.lengthIn,
      width: it.widthIn,
      height: it.heightIn,
      dimensionUnit: 'IN',
      stackable: it.stackable
    })),
    accessorials: shipment.accessorials,
    pickupDate: nextBusinessDay()
  };
}

/* -------------------------------------------------------------------------- */
/* Normalise the response into our own shape                                   */
/* -------------------------------------------------------------------------- */
export function fromGtzResponse(body) {
  const raw = body?.quotes || body?.rates || body?.Results || [];
  return raw
    .map((q) => ({
      quoteId: q.quoteId ?? q.QuoteId ?? q.id ?? null,
      carrier: q.carrierName ?? q.CarrierName ?? q.carrier ?? 'LTL Carrier',
      scac: q.scac ?? q.SCAC ?? null,
      totalUsd: Number(q.totalCost ?? q.TotalCost ?? q.total ?? 0),
      transitDays: Number(q.transitDays ?? q.TransitDays ?? q.transit ?? 5)
    }))
    .filter((q) => q.totalUsd > 0);
}

/* -------------------------------------------------------------------------- */
/* Call the API (or simulate it)                                               */
/* -------------------------------------------------------------------------- */
export async function getRates(shipment) {
  if (GTZ.mockMode) return mockRates(shipment);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.gtzTimeoutMs);

  try {
    const auth = Buffer.from(`${GTZ.username}:${GTZ.password}`).toString('base64');
    const res = await fetch(`${GTZ.baseUrl}/rates/v2`, {   // TODO confirm path
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
        'X-Access-Key': GTZ.accessKey        // TODO confirm header name
      },
      body: JSON.stringify(toGtzRequest(shipment))
    });

    if (!res.ok) throw new Error(`GlobalTranz ${res.status}: ${await res.text()}`);
    return fromGtzResponse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Mock — plausible LTL maths so the whole pipeline runs without credentials   */
/* -------------------------------------------------------------------------- */
function mockRates(shipment) {
  const miles = estimateMiles(shipment.origin.zip, shipment.destination.zip);
  const weight = shipment.items.reduce((s, i) => s + i.weightLb * i.quantity, 0);
  const classMult = { 50: 0.85, 65: 0.93, 70: 1.0, 85: 1.18, 100: 1.3, 125: 1.45, 250: 2.1 };
  const cls = classMult[Number(shipment.items[0]?.freightClass)] ?? 1.0;

  const distMult = 1 + Math.min(miles, 3000) / 2000;
  const base = (38 + weight * 0.62) * distMult * cls;
  const fuel = base * 0.28;

  const accCost = shipment.accessorials.reduce((sum, a) => {
    if (a.includes('RESIDENTIAL')) return sum + 65;
    if (a.includes('LIFTGATE')) return sum + 95;
    if (a.includes('LIMITED')) return sum + 110;
    if (a.includes('APPOINTMENT')) return sum + 45;
    return sum;
  }, 0);

  const carriers = [
    { carrier: 'Saia LTL Freight', scac: 'SAIA', f: 0.94, days: 6 },
    { carrier: 'Estes Express', scac: 'EXLA', f: 1.0, days: 5 },
    { carrier: 'XPO Logistics', scac: 'CNWY', f: 1.09, days: 4 },
    { carrier: 'Old Dominion', scac: 'ODFL', f: 1.21, days: 3 }
  ];

  return carriers.map((c, i) => ({
    quoteId: `MOCK-${Date.now()}-${i}`,
    carrier: c.carrier,
    scac: c.scac,
    totalUsd: Number(((base * c.f) + fuel + accCost).toFixed(2)),
    transitDays: c.days
  }));
}

/* Rough distance from zip3 centroids — mock only, good enough to show spread. */
const ZIP3_APPROX = {   // lat/lon by first 3 digits, sampled
  '295': [34.06, -78.89],  // Loris SC
  '100': [40.71, -74.00],  // New York NY
  '303': [33.75, -84.39],  // Atlanta GA
  '900': [34.05, -118.24], // Los Angeles CA
  '606': [41.88, -87.63],  // Chicago IL
  '770': [29.76, -95.37],  // Houston TX
  '981': [47.61, -122.33], // Seattle WA
  '331': [25.76, -80.19]   // Miami FL
};
function estimateMiles(a, b) {
  const A = ZIP3_APPROX[String(a).slice(0, 3)];
  const B = ZIP3_APPROX[String(b).slice(0, 3)];
  if (!A || !B) {                       // unknown zip → fall back to zone maths
    const zoneOf = (z) => Number(String(z).charAt(0));
    return Math.abs(zoneOf(a) - zoneOf(b)) * 380 + 60;
  }
  const R = 3959, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(B[0] - A[0]), dLon = toRad(B[1] - A[1]);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(A[0])) * Math.cos(toRad(B[0])) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)) * 1.18);  // 1.18 ≈ road vs straight line
}

function nextBusinessDay() {
  const d = new Date();
  do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}
