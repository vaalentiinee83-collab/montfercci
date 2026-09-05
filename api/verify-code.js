// api/verify-code.js
//
// Replaces the Google Apps Script "action=verify" call.
//
// How access codes work now: when you decide to accept a "Devenir membre"
// applicant, open their customer profile in Shopify Admin and add a tag of
// the form  code-XXXXXX  (choose any code you like, letters/numbers only —
// e.g. code-MTF294). Then email that code to the applicant yourself (or
// however you currently do it). When they type it into the site, this
// endpoint looks up the customer with that tag and confirms the match.

const { shopifyAdmin, allowCors } = require("./_shopify");

module.exports = async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, error: "Méthode non autorisée." });
  }

  try {
    const { code } = req.body || {};
    const cleanCode = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!cleanCode) {
      return res.status(400).json({ valid: false });
    }

    const query = `
      query FindByTag($search: String!) {
        customers(first: 1, query: $search) {
          edges {
            node { id defaultEmailAddress { emailAddress } firstName lastName tags }
          }
        }
      }`;
    const data = await shopifyAdmin(query, {
      search: `tag:code-${cleanCode}`
    });
    const customer = data.customers.edges[0]?.node;

    if (!customer) {
      return res.status(200).json({ valid: false });
    }

    return res.status(200).json({
      valid: true,
      email: customer.defaultEmailAddress?.emailAddress || "",
      prenom: customer.firstName || "",
      nom: customer.lastName || "",
      code: cleanCode
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ valid: false, error: "Erreur serveur." });
  }
};
