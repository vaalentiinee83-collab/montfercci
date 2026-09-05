// shopify-config.js
//
// Loaded by index.html and vitrine.html. Talks directly to Shopify's
// Storefront API from the browser for account creation, login, and order
// history — this is safe because the Storefront API access token is a
// PUBLIC token by design (the same kind used by any headless Shopify
// storefront). It can only do customer self-service actions (create their
// own account, log themselves in, see their own orders) — it can never
// read or modify another customer, and it can't touch store settings.
//
// This is different from the Admin API token used in /api/*.js, which is
// secret and must never appear in this file or anywhere in the browser.
//
// ── SETUP ──────────────────────────────────────────────────────────────
// 1. In Shopify Admin: Settings → Apps and sales channels → Develop apps
//    → create an app (or reuse one) → Configuration → Storefront API →
//    enable it → Install app → copy the "Storefront API access token".
// 2. Paste that token below, replacing "REMPLACER_PAR_VOTRE_TOKEN".
// ──────────────────────────────────────────────────────────────────────

const SHOPIFY_STOREFRONT_DOMAIN = "paxcyt-ct.myshopify.com";
const SHOPIFY_STOREFRONT_TOKEN = "efad0d04fa289a191aebad78d4b32747";
const SHOPIFY_STOREFRONT_API_VERSION = "2025-01";

async function shopifyStorefront(query, variables) {
  if (!SHOPIFY_STOREFRONT_TOKEN || SHOPIFY_STOREFRONT_TOKEN.indexOf("REMPLACER") !== -1) {
    throw new Error(
      "Le token Storefront Shopify n'est pas configuré (voir shopify-config.js)."
    );
  }
  const res = await fetch(
    `https://${SHOPIFY_STOREFRONT_DOMAIN}/api/${SHOPIFY_STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN
      },
      body: JSON.stringify({ query, variables })
    }
  );
  const json = await res.json();
  if (json.errors) {
    throw new Error("Erreur Shopify Storefront API : " + JSON.stringify(json.errors));
  }
  return json.data;
}

// Creates the real Shopify customer account (this is where the password is
// actually stored, securely, by Shopify — never by our own code).
async function shopifyCustomerCreate({ email, password, firstName, lastName }) {
  const mutation = `
    mutation CustomerCreate($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        customer { id email }
        customerUserErrors { field message code }
      }
    }`;
  const data = await shopifyStorefront(mutation, {
    input: { email, password, firstName, lastName }
  });
  return data.customerCreate;
}

// Logs a customer in against Shopify's own authentication and returns an
// access token to use for subsequent requests (e.g. order history).
async function shopifyCustomerLogin({ email, password }) {
  const mutation = `
    mutation CustomerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken { accessToken expiresAt }
        customerUserErrors { field message code }
      }
    }`;
  const data = await shopifyStorefront(mutation, { input: { email, password } });
  return data.customerAccessTokenCreate;
}

// Fetches the logged-in customer's profile + order history.
async function shopifyCustomerOrders(customerAccessToken) {
  const query = `
    query CustomerOrders($token: String!) {
      customer(customerAccessToken: $token) {
        firstName
        lastName
        email
        orders(first: 20, sortKey: PROCESSED_AT, reverse: true) {
          edges {
            node {
              id
              name
              processedAt
              financialStatus
              fulfillmentStatus
              currentTotalPrice { amount currencyCode }
              lineItems(first: 10) {
                edges { node { title quantity } }
              }
            }
          }
        }
      }
    }`;
  const data = await shopifyStorefront(query, { token: customerAccessToken });
  return data.customer;
}
