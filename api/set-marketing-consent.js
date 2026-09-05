// api/set-marketing-consent.js
//
// Called right after a new member's account is created, if they checked
// the newsletter box. Shopify's Storefront API "acceptsMarketing" flag
// does NOT update the email marketing subscription status shown in
// Shopify Admin (a known Storefront API limitation) — only the Admin API
// can do that, which is why this goes through our secure backend.

const { shopifyAdmin, findCustomerByEmail, allowCors } = require("./_shopify");

module.exports = async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  }

  try {
    const { email, accepts } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, error: "Email manquant." });
    if (!accepts) return res.status(200).json({ ok: true, skipped: true });

    const customer = await findCustomerByEmail(email);
    if (!customer) return res.status(404).json({ ok: false, error: "Client introuvable." });

    const mutation = `
      mutation UpdateConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
        customerEmailMarketingConsentUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`;
    const data = await shopifyAdmin(mutation, {
      input: {
        customerId: customer.id,
        emailMarketingConsent: {
          marketingState: "SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN"
        }
      }
    });

    const errors = data.customerEmailMarketingConsentUpdate.userErrors;
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
};
