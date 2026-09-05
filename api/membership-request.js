// api/membership-request.js
//
// Replaces the old Google Apps Script endpoint for the "Devenir membre" form.
// Creates a Shopify customer tagged "demande-membre" (or adds that tag to an
// existing customer). No password is set here — once you decide to accept an
// applicant, open their profile in Shopify Admin and click
// "Send account invite" to let them create their own password.

const { shopifyAdmin, findCustomerByEmail, allowCors } = require("./_shopify");

module.exports = async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  }

  try {
    const { prenom, nom, email } = req.body || {};

    if (!prenom || !nom || !email || !String(email).includes("@")) {
      return res.status(400).json({ ok: false, error: "Champs invalides." });
    }

    const existing = await findCustomerByEmail(email);

    if (existing) {
      const newTags = Array.from(
        new Set([...(existing.tags || []), "demande-membre"])
      );
      const mutation = `
        mutation UpdateCustomer($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }`;
      const data = await shopifyAdmin(mutation, {
        input: { id: existing.id, tags: newTags }
      });
      const errors = data.customerUpdate.userErrors;
      if (errors.length) {
        return res.status(400).json({ ok: false, error: errors[0].message });
      }
      return res.status(200).json({ ok: true });
    }

    const mutation = `
      mutation CreateCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`;
    const data = await shopifyAdmin(mutation, {
      input: {
        firstName: prenom,
        lastName: nom,
        email: email,
        tags: ["demande-membre"],
        note:
          "Demande d'adhésion reçue via le formulaire \"Devenir membre\" du site."
      }
    });
    const errors = data.customerCreate.userErrors;
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
};
