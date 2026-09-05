// api/_shopify.js
//
// Internal helper used by the other files in /api. Never imported by any
// browser-facing code. Talks to the Shopify Admin GraphQL API.
//
// Shopify apps created since January 2026 no longer get a permanent static
// Admin API token. Instead, we exchange the app's Client ID + Client Secret
// for a short-lived (24h) access token using the "client credentials grant"
// — this works because the app and the store are in the same Shopify
// organization (your own store's own app). The token is cached in memory
// for the life of the serverless instance and refreshed automatically.
//
// Required environment variables (set in Vercel → Project → Settings →
// Environment Variables):
//   SHOPIFY_STORE_DOMAIN          e.g. "paxcyt-ct.myshopify.com"
//   SHOPIFY_ADMIN_CLIENT_ID       "ID client" from Paramètres de l'appli
//   SHOPIFY_ADMIN_CLIENT_SECRET   "Secret" from Paramètres de l'appli
//
// These must NEVER be placed in index.html / vitrine.html / any client file.

const ADMIN_API_VERSION = "2025-01";

let cachedToken = null;
let cachedTokenExpiryMs = 0;

async function getAccessToken() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_ADMIN_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    throw new Error(
      "Configuration Shopify manquante : définissez SHOPIFY_STORE_DOMAIN, " +
        "SHOPIFY_ADMIN_CLIENT_ID et SHOPIFY_ADMIN_CLIENT_SECRET dans les " +
        "variables d'environnement Vercel."
    );
  }

  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiryMs - 60000) {
    return cachedToken;
  }

  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });
  const tokenJson = await tokenRes.json();

  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(
      "Impossible d'obtenir un token Shopify (vérifiez SHOPIFY_ADMIN_CLIENT_ID / " +
        "SHOPIFY_ADMIN_CLIENT_SECRET) : " + JSON.stringify(tokenJson)
    );
  }

  cachedToken = tokenJson.access_token;
  cachedTokenExpiryMs = now + (tokenJson.expires_in || 86399) * 1000;
  return cachedToken;
}

async function shopifyAdmin(query, variables = {}) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = await getAccessToken();

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
