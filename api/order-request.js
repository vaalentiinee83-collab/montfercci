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
      itemsJson // JSON string: [{ name, size, pack?, included? }]
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

    // Les prix sont fixés ICI, côté serveur : on ne fait jamais confiance au
    // prix envoyé par le navigateur. Seules les tenues (pack) sont payables
    // en ligne ; les pièces de la tenue sont "incluses" (0 €).
    const PACK_PRICES = { full: 590, notie: 630 };
    const PRODUCT_PRICES = {
      "blazer-large": 370, "blazer-cintre": 370, "blazer-ballon": 370,
      "pantalon-large": 280, "pantalon-patte": 280, "pantalon-ballon": 280
    };
    const priceOf = (it) => PACK_PRICES[it.pack] || PRODUCT_PRICES[it.pid] || 0;
    const paid = items.filter((it) => priceOf(it) > 0);
    const packs = items.filter((it) => PACK_PRICES[it.pack]);
    const included = items.filter((it) => priceOf(it) === 0 && it.included);
    const others = items.filter((it) => priceOf(it) === 0 && !it.included);
    const payable =
      paid.length > 0 && others.length === 0 && included.length <= packs.length * 3;

    const lineItems = items.map((item) => ({
      title: item.size ? `${item.name} (Taille : ${item.size})` : item.name,
      quantity: 1,
      originalUnitPriceWithCurrency: {
        amount: priceOf(item).toFixed(2),
        currencyCode: "EUR"
      }
    }));

    const noteParts = [
      payable ? `Commande reçue via le site (paiement en ligne).` : `Commande reçue via le site (sur devis).`,
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
          draftOrder { id name invoiceUrl }
          userErrors { field message }
        }
      }`;
    const draftData = await shopifyAdmin(draftMutation, { input: draftInput });
    const errors = draftData.draftOrderCreate.userErrors;
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors[0].message });
    }

    const draftOrder = draftData.draftOrderCreate.draftOrder;
    return res.status(200).json({
      ok: true,
      draftOrder,
      payable,
      paymentUrl: payable ? draftOrder.invoiceUrl : null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Erreur serveur." });
  }
};
