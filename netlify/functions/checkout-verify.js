// Verify a Stripe Checkout session before emitting a purchase conversion.
// Returns transaction facts only; customer and student data never reach the browser.

export default async (req) => {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Server is missing STRIPE_SECRET_KEY." }, 500);

  const sessionId = new URL(req.url).searchParams.get("session_id") || "";
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ error: "Invalid checkout session." }, 400);
  }

  try {
    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
      { headers: { Authorization: "Bearer " + key } }
    );
    const session = await response.json().catch(() => ({}));

    if (!response.ok) return json({ error: "Checkout session could not be verified." }, 502);
    if (session.payment_status !== "paid") return json({ verified: false }, 200);

    return json({
      verified: true,
      transactionId: session.id,
      amount: Number(session.amount_total || 0) / 100,
      currency: String(session.currency || "usd").toUpperCase(),
      plan: session.metadata && session.metadata.plan ? session.metadata.plan : "unknown"
    });
  } catch {
    return json({ error: "Could not reach Stripe." }, 502);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
