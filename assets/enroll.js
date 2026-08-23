const dataLayer = window.dataLayer = window.dataLayer || [];

function sendAnalyticsEvent(name, params) {
  if (typeof window.gtag === "function") window.gtag("event", name, params);
}

function checkoutItem(plan) {
  const items = {
    "deposit-august": { item_id: plan, item_name: "Code the Future fall seat deposit", price: 10 },
    "module-1": { item_id: plan, item_name: "Code the Future Module 1", price: 75 },
    "all-four": { item_id: plan, item_name: "Code the Future four-module journey", price: 225 },
  };
  return items[plan] || { item_id: plan, item_name: "Code the Future enrollment" };
}

document.querySelectorAll(".checkout-form[data-plan]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".checkout-status");
    const originalButton = button?.innerHTML || "Continue to Stripe";
    const field = (name) => form.elements.namedItem(name);
    const plan = form.dataset.plan;
    const item = checkoutItem(plan);
    if (plan === "module-1") {
      const addOnCount = Math.max(0, Math.min(2, Number.parseInt(field("additionalModules")?.value || "0", 10) || 0));
      item.price = 75 * (1 + addOnCount);
    }

    status?.classList.remove("error");
    if (status) status.textContent = "Opening secure Stripe checkout…";
    if (button) {
      button.disabled = true;
      button.textContent = "Opening Stripe…";
    }

    dataLayer.push({
      event: "ctf_checkout_started",
      plan,
      source_page: window.location.pathname,
    });
    sendAnalyticsEvent("begin_checkout", {
      currency: "USD",
      value: item.price,
      items: [item],
    });

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          customerEmail: field("email")?.value || "",
          studentFirstName: field("studentFirstName")?.value || "",
          studentLastName: field("studentLastName")?.value || "",
          heardAbout: field("heardAbout")?.value || "",
          additionalModules: field("additionalModules")?.value || 0,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Checkout could not start. Please try again.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      if (status) {
        status.classList.add("error");
        status.textContent = error instanceof Error ? error.message : "Checkout could not start. Please try again.";
      }
      if (button) {
        button.disabled = false;
        button.innerHTML = originalButton;
      }
      if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
    }
  });
});

const leadForm = document.getElementById("leadForm");

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = leadForm.querySelector('button[type="submit"]');
  const status = leadForm.querySelector(".form-status");
  const originalButton = button?.innerHTML || "Send my question";

  status?.classList.remove("error");
  if (status) status.textContent = "Sending…";
  if (button) {
    button.disabled = true;
    button.textContent = "Sending…";
  }

  try {
    const formData = new FormData(leadForm);
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString(),
    });
    if (!response.ok) throw new Error("Your note did not send. Please try again.");

    leadForm.classList.add("is-success");
    dataLayer.push({
      event: "ctf_lead_submitted",
      source_page: window.location.pathname,
    });
    sendAnalyticsEvent("generate_lead", { method: "website_interest_form" });
  } catch (error) {
    if (status) {
      status.classList.add("error");
      status.textContent = error instanceof Error ? error.message : "Your note did not send. Please try again.";
    }
    if (button) {
      button.disabled = false;
      button.innerHTML = originalButton;
    }
    if (window.lucide?.createIcons) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }
});

const requestedAudience = new URLSearchParams(window.location.search).get("audience");
if (requestedAudience === "teen" || requestedAudience === "adult") {
  const audience = document.getElementById("interest-audience");
  const program = document.getElementById("interest-session");
  if (audience) audience.value = requestedAudience === "adult" ? "Older adult" : "Young teen · ages 12–15";
  if (program) program.value = requestedAudience === "adult" ? "Older adult AI workshops" : "Young teen track · ages 12–15";
}
