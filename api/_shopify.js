// api/_shopify.js
//
// Internal helper used by the other files in /api. Never imported by any
// browser-facing code. Talks to the Shopify Admin GraphQL API using the
// secret access token, which must be set as a Vercel environment variable
// and must NEVER be placed in index.html / vitrine.html / any client file.
//
// Required environment variables (set in Vercel → Project → Settings →
// Environment Variables):
//   SHOPIFY_STORE_DOMAIN        e.g. "paxcyt-ct.myshopify.com"
//   SHOPIFY_ADMIN_ACCESS_TOKEN  the secret Admin API access token

const ADMIN_API_VERSION = "2025-01";

async function shopifyAdmin(query, variables = {}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;

  if (!domain || !token) {
    throw new Error(
      "Configuration Shopify manquante : définissez SHOPIFY_STORE_DOMAIN et " +
        "SHOPIFY_ADMIN_ACCESS_TOKEN dans les variables d'environnement Vercel."
    );
  }

  const response = await fetch(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({ query, variables })
    }
  );

  const json = await response.json();

  if (!response.ok || json.errors) {
    throw new Error(
      "Erreur Shopify Admin API : " + JSON.stringify(json.errors || json)
    );
  }

  return json.data;
}

// Finds a Shopify customer by exact email address. Returns null if none.
async function findCustomerByEmail(email) {
  const query = `
    query FindCustomer($search: String!) {
      customers(first: 1, query: $search) {
        edges {
          node {
            id
            defaultEmailAddress { emailAddress }
            firstName
            lastName
            tags
          }
        }
      }
    }`;
  const data = await shopifyAdmin(query, { search: `email:${email}` });
  const node = data.customers.edges[0]?.node || null;
  if (!node) return null;
  return { ...node, email: node.defaultEmailAddress?.emailAddress || email };
}

// Allows simple, permissive CORS for the site calling these functions.
// Since the site and the API live on the same Vercel domain this is mostly
// a safety net (e.g. previews on a different subdomain).
function allowCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = { shopifyAdmin, findCustomerByEmail, allowCors };
