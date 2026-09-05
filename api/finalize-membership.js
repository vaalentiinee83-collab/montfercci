// api/finalize-membership.js
//
// Called by the site right after a customer has successfully created their
// Shopify account (password set via the Storefront API). Cleans up the
// tags in Shopify Admin: removes "demande-membre" and the one-time
// "code-XXXXXX" tag, and adds "membre".
//
// This is a tidiness step only — if it fails for any reason, the customer's
// account has already been created successfully and they are not blocked.

const { shopifyAdmin, allowCors } = require("./_shopify");

module.exports = async (req, res) => {
  allowCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  try {
    const { email, code } = req.body || {};
    if (!email) return res.status(400).json({ ok: false });

    const cleanCode = String(code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    const query = `
      query FindCustomer($search: String!) {
        customers(first: 1, query: $search) {
          edges { node { id tags } }
        }
      }`;
    const data = await shopifyAdmin(query, { search: `email:${email}` });
    const customer = data.customers.edges[0]?.node;
    if (!customer) return res.status(200).json({ ok: true });

    const newTags = (customer.tags || [])
      .filter((t) => t !== "demande-membre" && t !== `code-${cleanCode}`)
      .concat("membre");

    const mutation = `
      mutation UpdateCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`;
    await shopifyAdmin(mutation, {
      input: { id: customer.id, tags: Array.from(new Set(newTags)) }
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    // Non-blocking: the account already exists even if tag cleanup failed.
    return res.status(200).json({ ok: true });
  }
};
