// Throwaway mailbox + signup with backoff against Supabase's email rate limit,
// then follow the confirmation link and prove the account can sign in.
// Helper only; this folder is deleted when the investigation is done.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MAIL = "https://api.mail.tm";
const SUPABASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const APP_PASSWORD = "ProbeOrg2026!";
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

async function mail(path, options = {}) {
  const res = await fetch(`${MAIL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const domains = await mail("/domains");
const domainList = Array.isArray(domains) ? domains : domains["hydra:member"] || [];
const domain = domainList.find((d) => d.isActive)?.domain;
const address = `probe${Date.now().toString(36)}@${domain}`;
const mailboxPassword = `ProbeMail${Date.now()}!`;

await mail("/accounts", { method: "POST", body: JSON.stringify({ address, password: mailboxPassword }) });
const mailboxToken = (await mail("/token", {
  method: "POST",
  body: JSON.stringify({ address, password: mailboxPassword }),
})).token;
log("mailbox", address);

// Retry the signup: Supabase answers 429 over_email_send_rate_limit until the
// window passes.
let signedUp = false;
const waits = [0, 30, 60, 90, 120, 180, 240, 300, 300, 300];
for (const wait of waits) {
  if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
  const res = await fetch(`${SUPABASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: APP_PASSWORD, data: { full_name: "Probe Org" } }),
  });
  const body = await res.text();
  log("signup", res.status, body.slice(0, 160));
  if (res.ok) {
    signedUp = true;
    break;
  }
}
if (!signedUp) {
  log("FATAL signup never succeeded");
  process.exit(2);
}

const deadline = Date.now() + 5 * 60 * 1000;
let link = null;
while (Date.now() < deadline && !link) {
  const inbox = await mail("/messages", { headers: { Authorization: `Bearer ${mailboxToken}` } });
  const messages = Array.isArray(inbox) ? inbox : inbox["hydra:member"] || [];
  for (const message of messages) {
    const full = await mail(`/messages/${message.id}`, { headers: { Authorization: `Bearer ${mailboxToken}` } });
    const html = [].concat(full.html || []).join("\n");
    const found = (html.match(/https?:\/\/[^\s"'<>]+/g) || []).find((u) => /verify|confirm|auth/i.test(u));
    if (found) {
      link = found.replace(/&amp;/g, "&");
      break;
    }
  }
  if (!link) {
    log("waiting for confirmation mail…");
    await new Promise((r) => setTimeout(r, 5000));
  }
}
if (!link) {
  log("FATAL no confirmation link");
  process.exit(3);
}
log("confirm link received");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => log("confirm-nav", e.message));
await new Promise((r) => setTimeout(r, 2500));
log("confirm page:", (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))) || "(empty)");
await browser.close();

const loginRes = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: address, password: APP_PASSWORD }),
});
log("password login:", loginRes.status, (await loginRes.text()).slice(0, 120));

// Credentials for the next step of the investigation.
const fs = await import("node:fs");
fs.writeFileSync(
  new URL("./creds.env", import.meta.url),
  `PROBE_EMAIL=${address}\nPROBE_PASSWORD="${APP_PASSWORD}"\nPROBE_NAME="Probe Org"\n`,
);
log("wrote .tmp-probe/creds.env");
