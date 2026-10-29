// One-off helper: throwaway mailbox -> app signup -> follow the confirmation
// link, so a test organization account can be logged into. Not part of the app;
// this whole folder is deleted when the investigation is done.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:5173";
const MAIL = "https://api.mail.tm";
const SUPABASE = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

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
const appPassword = process.env.PROBE_PASSWORD || "ProbeOrg2026!";

await mail("/accounts", { method: "POST", body: JSON.stringify({ address, password: mailboxPassword }) });
const mailboxToken = (await mail("/token", {
  method: "POST",
  body: JSON.stringify({ address, password: mailboxPassword }),
})).token;
console.log(`[mailbox] ${address}`);

const signupRes = await fetch(`${SUPABASE}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: address, password: appPassword, data: { full_name: "Probe Org" } }),
});
const signupBody = await signupRes.text();
console.log(`[signup] ${signupRes.status} ${signupBody.slice(0, 300)}`);

const deadline = Date.now() + 4 * 60 * 1000;
let link = null;
while (Date.now() < deadline && !link) {
  process.stdout.write(`[poll ${new Date().toISOString()}] `);
  const inbox = await mail("/messages", { headers: { Authorization: `Bearer ${mailboxToken}` } });
  const messages = Array.isArray(inbox) ? inbox : inbox["hydra:member"] || [];
  for (const message of messages) {
    const full = await mail(`/messages/${message.id}`, { headers: { Authorization: `Bearer ${mailboxToken}` } });
    const html = [].concat(full.html || []).join("\n");
    link = (html.match(/https?:\/\/[^\s"'<>]+/g) || []).find((u) => /verify|confirm|auth/i.test(u));
    if (link) break;
  }
  if (!link) {
    console.log("no message yet");
    await new Promise((r) => setTimeout(r, 5000));
  } else {
    console.log("message found");
  }
}
if (!link) throw new Error("No confirmation link arrived");
link = link.replace(/&amp;/g, "&");
console.log(`[confirm] ${link.slice(0, 120)}…`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.goto(link, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => console.log(`[confirm-nav] ${e.message}`));
await new Promise((r) => setTimeout(r, 2500));
const confirmed = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300));
console.log(`[confirm-page] ${confirmed}`);

// Prove the account can sign in.
const loginRes = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: address, password: appPassword }),
});
console.log(`[login] ${loginRes.status}`);
console.log(JSON.stringify({ address, appPassword }));
await browser.close();
