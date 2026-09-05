// api/setup-storefront-token.js
//
// ONE-TIME USE. Visit this URL once in your browser after deploying with
// the Shopify environment variables configured:
//
//   https://montfercci.com/api/setup-storefront-token
//
// It creates a Storefront API access token (a PUBLIC token, safe to put in
// shopify-config.js) using your Admin API credentials. Shopify's newer app
// dashboard doesn't display this token anywhere in the UI — generating it
// via the API is the documented way to get one.
//
// Copy the token you get back into shopify-config.js
// (SHOPIFY_STOREFRONT_TOKEN), then delete this file and redeploy — it has
// no further use once you have the token, and there's no reason to leave
// a token-generating endpoint lying around.

const { shopifyAdmin, allowCors } = require("./_shopify");

const ADMIN_API_VERSION = "2025-01";

module.exports = async (req, res) => {
  allowCors(req, res);

  try {
    const domain = process.env.SHOPIFY_STORE_DOMAIN;

    // Reuse the same client-credentials token used everywhere else.
    // (shopifyAdmin() only exposes GraphQL, so we grab a token the same
    // way and make a plain REST call — Storefront tokens are REST-only.)
    const probe = await shopifyAdmin(`query { shop { name } }`);
    if (!probe) throw new Error("Impossible de vérifier les identifiants Shopify.");

    const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SHOPIFY_ADMIN_CLIENT_ID,
        client_secret: process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });
    const tokenJson = await tokenRes.json();
    const adminToken = tokenJson.access_token;

    const createRes = await fetch(
      `https://${domain}/admin/api/${ADMIN_API_VERSION}/storefront_access_tokens.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken
        },
        body: JSON.stringify({
          storefront_access_token: { title: "Site Montfercci (Vercel)" }
        })
      }
    );
    const createJson = await createRes.json();

    if (!createRes.ok) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(`
        <pre>Erreur Shopify : ${JSON.stringify(createJson, null, 2)}

Causes possibles :
- Les portées "unauthenticated_read_customers" et "unauthenticated_write_customers"
  ne sont pas encore publiées sur l'app (Configuration → Portées → nouvelle version → Publier).
- Les variables d'environnement Vercel ne sont pas encore actives (Redeploy nécessaire).
        </pre>
      `);
    }

    const token = createJson.storefront_access_token.access_token;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`
      <div style="font-family:monospace;max-width:700px;margin:60px auto;line-height:1.6">
        <h2>Token Storefront créé ✅</h2>
        <p>Copiez cette valeur dans <code>shopify-config.js</code>
        (remplacez <code>SHOPIFY_STOREFRONT_TOKEN</code>) :</p>
        <p style="background:#f2f2f2;padding:16px;word-break:break-all;font-size:1.1em">
          ${token}
        </p>
        <p>Une fois copié, supprimez ce fichier <code>api/setup-storefront-token.js</code>
        (ou dites-le à Claude) et redéployez — il n'a plus d'utilité après ça.</p>
      </div>
    `);
  } catch (err) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("Erreur : " + err.message);
  }
};
