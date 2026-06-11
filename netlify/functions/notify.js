// ==========================================================================
// Code the Future — staff inbox notifier
//
// POST /api/notify  { kind:"dm"|"help", from, to, cohort, body }
// Called by a Supabase database trigger (see migrations/..._staff_notify.sql)
// when a kid DMs a staff member or posts in the Help channel.
//
// Relays to whichever channels are configured in Netlify env vars:
//   NOTIFY_SECRET      — must match the x-ctf-secret header from the trigger
//   SLACK_WEBHOOK_URL  — Slack incoming webhook (Slack app → Incoming Webhooks)
//   RESEND_API_KEY + NOTIFY_EMAIL — email via resend.com (optional)
// Unset channels are skipped silently, so this never breaks chat.
// ==========================================================================

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = process.env.NOTIFY_SECRET;
  if (!secret || req.headers.get("x-ctf-secret") !== secret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let p = {};
  try { p = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const from = clean(p.from) || "Explorer";
  const cohort = clean(p.cohort) || "your cohort";
  const body = clean(p.body).slice(0, 300);
  const title = p.kind === "dm"
    ? `💬 ${from} sent ${clean(p.to) || "you"} a private message`
    : `❓ ${from} posted in Help & Questions`;
  const text = `${title}\n> ${body}\nCohort: ${cohort}\nReply: https://codethefuture.net/platform/board.html${p.kind === "dm" ? "#chat" : ""}`;

  const sent = { slack: false, email: false };

  if (process.env.SLACK_WEBHOOK_URL) {
    try {
      const r = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      sent.slack = r.ok;
    } catch {}
  }

  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.RESEND_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || "Code the Future <onboarding@resend.dev>",
          to: [process.env.NOTIFY_EMAIL],
          subject: title,
          text
        })
      });
      sent.email = r.ok;
    } catch {}
  }

  return json({ ok: true, sent });
};

function clean(s) { return String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim(); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
