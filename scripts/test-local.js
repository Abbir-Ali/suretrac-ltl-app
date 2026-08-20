/**
 * Local test runner — no server, no network, no credentials needed.
 *   node scripts/test-local.js
 */
import handler from '../api/rates.js';

const CASES = [
  { name: '1 axle → New York (residential)',
    zip: '10003', province: 'NY', qty: 1, residential: true },
  { name: '1 axle → Atlanta',
    zip: '30303', province: 'GA', qty: 1, residential: true },
  { name: '1 axle → Los Angeles',
    zip: '90001', province: 'CA', qty: 1, residential: true },
  { name: '2 axles → Chicago',
    zip: '60601', province: 'IL', qty: 2, residential: true },
  { name: '1 axle → Anchorage (excluded zip)',
    zip: '99501', province: 'AK', qty: 1, residential: true },
  { name: 'unknown SKU → Atlanta (fallback spec)',
    zip: '30303', province: 'GA', qty: 1, residential: true, sku: 'ST-MYSTERY-PART' }
];

function reqFor(c) {
  return {
    method: 'POST',
    body: {
      rate: {
        origin: { postal_code: '29569', province: 'SC', country: 'US' },
        destination: { postal_code: c.zip, province: c.province, country: 'US', residential: c.residential },
        items: [{
          name: '3.5K Straight Axle - 3,500 lbs Idler',
          sku: c.sku || 'ST-AXLE-35K-IDLER',
          quantity: c.qty,
          grams: 61235,
          requires_shipping: true
        }],
        currency: 'USD'
      }
    }
  };
}

function resStub() {
  return {
    _code: null, _json: null,
    status(c) { this._code = c; return this; },
    json(b) { this._json = b; return this; }
  };
}

console.log('\nLTL rate endpoint — local test (mock mode)\n' + '='.repeat(62));
for (const c of CASES) {
  const res = resStub();
  await handler(reqFor(c), res);
  const rates = res._json?.rates || [];
  console.log(`\n▸ ${c.name}`);
  if (!rates.length) { console.log('   no rates returned (expected for excluded zips)'); continue; }
  for (const r of rates) {
    console.log(`   ${r.service_name.padEnd(42)} $${(Number(r.total_price)/100).toFixed(2)}`);
  }
}
console.log('\n' + '='.repeat(62) + '\n');
