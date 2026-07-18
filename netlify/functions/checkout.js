// ============================================================================
// Code the Future — Stripe Checkout proxy (Netlify Function)
//
// POST /api/checkout
//   { plan:"module-1", additionalModules?:0..2, customerEmail?:"parent@example.com", studentFirstName, studentLastName, heardAbout }
//   { plan:"all-four", customerEmail?:"parent@example.com", studentFirstName, studentLastName, heardAbout }
//     → { url:"https://checkout.stripe.com/..." }
//
// The Stripe secret key stays server-side. Set STRIPE_SECRET_KEY in Netlify env
// vars. Optional: STRIPE_CHECKOUT_ORIGIN (defaults to the request origin, then
// https://codethefuture.net).
// ============================================================================

const SITE_ORIGIN = "https://codethefuture.net";
const MAX_ADDITIONAL_MODULES = 3;
const MAX_MODULE1_ADDONS = 2;

const LINE_ITEMS = {
  module1: {
    name: "Code the Future — Module 1",
    description: "Module 1: What Is AI? Includes platform access, the in-person library session, and the cohort experience.",
    amount: 7500
  },
  additional: {
    name: "Code the Future — Additional Module",
    description: "Add-on module for a camper already enrolled in Module 1.",
    amount: 7500
  },
  bundle: {
    name: "Code the Future — All Four Modules",
    description: "Best value: all four modules — save $75 vs. buying each module separately.",
    amount: 22500
  },
  depositAugust: {
    name: "Code the Future — Fall Session Seat Deposit",
    description: "Holds one of 15 seats for Session 2 (starts Sept 28; Saturday library sessions 10am-12pm). Fully credited toward tuition at enrollment.",
    amount: 1000
  }
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Server is missing STRIPE_SECRET_KEY." }, 500);

  let body = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }

  const plan = clean(body.plan);
  const email = clean(body.customerEmail);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter a valid email address." }, 400);
  const studentFirstName = clean(body.studentFirstName).slice(0, 80);
  const studentLastName = clean(body.studentLastName).slice(0, 80);
  const heardAbout = clean(body.heardAbout).slice(0, 80);
  if (!studentFirstName) return json({ error: "Please enter the student's first name." }, 400);
  if (!studentLastName) return json({ error: "Please enter the student's last name." }, 400);
  if (!heardAbout) return json({ error: "Please tell us how you heard about Code the Future." }, 400);

  const items = buildLineItems(plan, body.additionalModules);
  if (!items.ok) return json({ error: items.error }, 400);

  const origin = checkoutOrigin(req);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", origin + "/checkout-success.html?session_id={CHECKOUT_SESSION_ID}" + (plan === "deposit-august" ? "&plan=deposit" : ""));
  form.set("cancel_url", origin + "/#checkout");
  form.set("phone_number_collection[enabled]", "true");
  form.set("billing_address_collection", "auto");
  form.set("allow_promotion_codes", "true");
  if (email) form.set("customer_email", email);
  form.set("custom_text[submit][message]", plan === "deposit-august"
    ? "Your $10 holds a seat for Session 2 (starts Sept 28). It's fully credited toward tuition — enrollment details land in your inbox soon."
    : "After checkout, Code the Future will email your camper's login details and cohort next steps.");

  form.set("metadata[program]", "Code the Future Summer 2026");
  form.set("metadata[plan]", plan);
  form.set("metadata[additional_modules]", String(items.additionalModules));
  form.set("metadata[parent_email]", email);
  form.set("metadata[student_first_name]", studentFirstName);
  form.set("metadata[student_last_name]", studentLastName);
  form.set("metadata[student_name]", (studentFirstName + " " + studentLastName).trim());
  form.set("metadata[heard_about]", heardAbout);

  items.lines.forEach((item, index) => {
    form.set(`line_items[${index}][quantity]`, String(item.quantity));
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(item.amount));
    form.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    form.set(`line_items[${index}][price_data][product_data][description]`, item.description);
  });

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : "Stripe checkout request failed (" + r.status + ").";
      return json({ error: message }, 502);
    }

    if (!data.url) return json({ error: "Stripe did not return a checkout URL." }, 502);
    return json({ url: data.url });
  } catch (e) {
    return json({ error: "Could not reach Stripe.", detail: String(e).slice(0, 200) }, 502);
  }
};

function buildLineItems(plan, rawAdditionalModules) {
  const additionalModules = clampInt(rawAdditionalModules, 0, MAX_MODULE1_ADDONS);

  if (plan === "module-1") {
    const lines = [{ ...LINE_ITEMS.module1, quantity: 1 }];
    if (additionalModules > 0) lines.push({ ...LINE_ITEMS.additional, quantity: additionalModules });
    return { ok: true, lines, additionalModules };
  }

  if (plan === "all-four") {
    return { ok: true, lines: [{ ...LINE_ITEMS.bundle, quantity: 1 }], additionalModules: MAX_ADDITIONAL_MODULES };
  }

  if (plan === "deposit-august") {
    return { ok: true, lines: [{ ...LINE_ITEMS.depositAugust, quantity: 1 }], additionalModules: 0 };
  }

  return { ok: false, error: "Unknown checkout plan." };
}

function checkoutOrigin(req) {
  const configured = clean(process.env.STRIPE_CHECKOUT_ORIGIN).replace(/\/$/, "");
  if (configured) return configured;
  const origin = clean(req.headers.get("origin")).replace(/\/$/, "");
  if (origin && /^https?:\/\//.test(origin)) return origin;
  return SITE_ORIGIN;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clean(s) { return String(s == null ? "" : s).trim(); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
