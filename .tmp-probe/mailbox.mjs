// One-off helper: creates a throwaway mailbox, signs the app up with it,
// follows the Supabase confirmation link, then prints the confirmed address.
// Nothing here is part of the app; it is deleted with this folder.
const BASE = "https://api.mail.tm";

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": options.headers?.["Content-Type"] || "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return body;
}

const domains = await api("/domains");
const domain = domains["hydra:member"].find((d) => d.isActive)?.domain;
if (!domain) throw new Error("No active mailbox domain");
const local = `probe${Date.now().toString(36)}`;
const address = `${local}@${domain}`;
const password = `ProbeMail${Date.now()}!`;

await api("/accounts", { method: "POST", body: JSON.stringify({ address, password }) });
const token = (await api("/token", { method: "POST", body: JSON.stringify({ address, password }) })).token;
console.log(JSON.stringify({ address, password, token: token.slice(0, 12) + "…" }));

// Poll for the Supabase confirmation email (10 minutes max).
const deadline = Date.now() + 10 * 60 * 1000;
let link = null;
while (Date.now() < deadline && !link) {
  const inbox = await api("/messages", { headers: { Authorization: `Bearer ${token}` } });
  const message = inbox["hydra:member"]?.[0];
  if (message) {
    const full = await api(`/messages/${message.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const html = String(full.html || "").join("\n");
    const match = html.match(/https?:\/\/[^\s"'<>]+/g)?.find((u) => /confirm|verify|auth/i.test(u));
    if (match) link = match.replace(/&amp;/g, "&");
  }
  if (!link) await new Promise((r) => setTimeout(r, 5000));
}
console.log(JSON.stringify({ address, password, link }));
