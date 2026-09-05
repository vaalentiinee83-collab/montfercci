// api/order-request.js
//
// Replaces the old Google Apps Script "action=commande" call made at
// checkout. Creates a Shopify Draft Order so the request shows up directly
// in Shopify Admin → Orders → Drafts, ready for you to price, invoice or
// contact the customer about — matching the site's current "nous vous
// recontacterons pour confirmer" flow. No payment is taken automatically.

const { shopifyAdmin, findCustomerByEmail, allowCors } = require("./_shopify");

module.exports = async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Méthode non autorisée." });
  }

  try {
    const {
      prenom,
      nom,
      email,
      telephone,
      adresse,
      notes,
      articles, // human-readable summary string
      itemsJson // JSON string: [{ name, size }]
    } = req.body || {};

    if (!prenom || !nom || !email || !telephone || !adresse) {
      return res.status(400).json({ ok: false, error: "Champs manquants." });
    }

    // Make sure a Shopify customer exists for this order request.
    let customerId = null;
    const existing = await findCustomerByEmail(email);
    if (existing) {
      customerId = existing.id;
    } else {
      const createMutation = `
        mutation CreateCustomer($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }`;
      const created = await shopifyAdmin(createMutation, {
        input: {
          firstName: prenom,
          lastName: nom,
          email: email,
          phone: telephone || undefined,
          tags: ["commande-site"]
        }
      });
      if (!created.customerCreate.userErrors.length) {
        customerId = created.customerCreate.customer.id;
      }
      // If customer creation fails (e.g. phone already used elsewhere),
      // we still proceed and create the draft order without a linked
      // customer — the contact details are in the note either way.
    }

    let items = [];
    try {
      items = JSON.parse(itemsJson || "[]");
    } catch (_) {
      items = [];
    }
    if (!items.length) {
      return res.status(400).json({ ok: false, error: "Panier vide." });
    }

    const lineItems = items.map((item) => ({
      title: item.size ? `${item.name} (Taille : ${item.size})` : item.name,
      quantity: 1,
      originalUnitPriceWithCurrency: { amount: "0.00", currencyCode: "EUR" }
    }));

    const noteParts = [
      `Commande reçue via le site (sur devis).`,
      `Client : ${prenom} ${nom}`,
      `Téléphone : ${telephone}`,
      `Adresse de livraison : ${adresse}`,
      notes ? `Notes du client : ${notes}` : null,
      articles ? `Articles : ${articles}` : null
    ].filter(Boolean);

    const draftInput = {
      email,
      phone: telephone || undefined,
      lineItems,
      note: noteParts.join("\n"),
      tags: ["commande-site"]
    };
    if (customerId) draftInput.purchasingEntity = { customerId };

    const draftMutation = `
      mutation CreateDraftOrder($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id name }
          userErrors { field message }
        }
      }`;
    const draftData = await shopifyAdmin(draftMutation, { input: draftInput });
    const errors = draftData.draftOrderCreate.userErrors;
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    return res.status(200).json({
      ok: true,
      draftOrder: draftData.draftOrderCreate.draftOrder
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
};
