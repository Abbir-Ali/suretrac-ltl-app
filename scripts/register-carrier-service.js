/**
 * REGISTER THE CARRIER SERVICE WITH SHOPIFY
 *
 * Run this once, after the app is deployed to Vercel. It tells Shopify
 * "call this URL for shipping rates".
 *
 *   SHOP=p844an-5c \
 *   TOKEN=shpat_xxx \
 *   CALLBACK=https://your-app.vercel.app/api/rates \
 *   node scripts/register-carrier-service.js
 *
 * TOKEN comes from a custom app in Shopify admin with the write_shipping scope:
 *   Settings → Apps and sales channels → Develop apps → Create an app
 *   → Configure Admin API scopes → tick write_shipping → Install → copy token
 */

const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;
const CALLBACK = process.env.CALLBACK;
const VERSION = '2025-07';

if (!SHOP || !TOKEN || !CALLBACK) {
  console.error('Set SHOP, TOKEN and CALLBACK environment variables. See header.');
  process.exit(1);
}

const endpoint = `https://${SHOP}.myshopify.com/admin/api/${VERSION}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

/* 1 ── what's already registered? */
const existing = await gql(`
  query {
    carrierServices(first: 20) {
      nodes { id name callbackUrl active formattedName }
    }
  }
`);

console.log('\nCurrently registered carrier services:');
if (!existing.carrierServices.nodes.length) console.log('   (none)');
existing.carrierServices.nodes.forEach((c) =>
  console.log(`   ${c.formattedName}  →  ${c.callbackUrl}  ${c.active ? '[active]' : '[inactive]'}`)
);

const already = existing.carrierServices.nodes.find((c) => c.name === 'SureTrac LTL Freight');

/* 2 ── create or update */
if (already) {
  const data = await gql(`
    mutation Update($input: DeliveryCarrierServiceUpdateInput!) {
      carrierServiceUpdate(input: $input) {
        carrierService { id name callbackUrl active }
        userErrors { field message }
      }
    }
  `, { input: { id: already.id, callbackUrl: CALLBACK, active: true } });
  report('updated', data.carrierServiceUpdate);
} else {
  const data = await gql(`
    mutation Create($input: DeliveryCarrierServiceCreateInput!) {
      carrierServiceCreate(input: $input) {
        carrierService { id name callbackUrl active }
        userErrors { field message }
      }
    }
  `, {
    input: {
      name: 'SureTrac LTL Freight',
      callbackUrl: CALLBACK,
      supportsServiceDiscovery: true,
      active: true
    }
  });
  report('created', data.carrierServiceCreate);
}

function report(verb, payload) {
  if (payload.userErrors?.length) {
    console.error(`\n✗ ${verb} failed:`);
    payload.userErrors.forEach((e) => console.error(`   ${e.field}: ${e.message}`));
    process.exit(1);
  }
  const c = payload.carrierService;
  console.log(`\n✓ Carrier service ${verb}`);
  console.log(`   ${c.name}`);
  console.log(`   ${c.callbackUrl}`);
  console.log(`\nNext: Settings → Shipping and delivery → Freight profile → your zone`);
  console.log(`      → Add shipping option → Use carrier or app → "SureTrac LTL Freight"`);
  console.log(`      Then remove the $249 flat rate.\n`);
}
