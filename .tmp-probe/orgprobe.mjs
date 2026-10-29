// Diagnostic harness (app code untouched): opens the real app in headless
// Chrome with a forged signed-in session and mocked Supabase REST answers that
// mirror what the live project returns today, so the organizer routes render
// and their console errors can be read. Deleted with this folder afterwards.
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:5173";
const SUPABASE = process.env.VITE_SUPABASE_URL;
const REF = new URL(SUPABASE).hostname.split(".")[0];
const STORAGE_KEY = `sb-${REF}-auth-token`;

const USER_ID = "893433b4-165c-49bb-a8f7-7a1560e473ca";
const ORG_ID = "38e0e152-3fee-4b63-b5fc-47dcc6c75b99";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = [
  b64({ alg: "HS256", typ: "JWT" }),
  b64({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "probe@paradox.example",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Probe Org" },
    aal: "aal1",
    amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
    session_id: "00000000-0000-0000-0000-000000000000",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    iat: Math.floor(Date.now() / 1000),
  }),
  "forged-signature",
].join(".");

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "probe@paradox.example",
  email_confirmed_at: new Date().toISOString(),
  phone: "",
  confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Probe Org" },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const session = {
  access_token: jwt,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "forged-refresh",
  user,
};

const ORG = {
  id: ORG_ID,
  owner_id: USER_ID,
  org_name: "Paradox",
  org_type: "college_club",
  contact_email: "nu26a06@nmamit.in",
  phone: "+91 8075280447",
  city: "Mangalore",
  address: "padhvinangady",
  website: "https://nitte.edu.in/",
  description: "college club",
  proof_url: null,
  coordinator_name: "Probe",
  coordinator_email: "probe@paradox.example",
  signed_name: "Probe",
  agreed_at: new Date().toISOString(),
  status: process.env.ORG_STATUS || "approved",
  review_note: null,
  created_at: new Date().toISOString(),
};

// Same shape the live project returns for the organizer's event list.
const EVENT = {
  id: "45e37f62-35d0-4eaf-836f-11bfcd9fa0a5",
  slug: "next-billion",
  title: "Build for the next billion",
  venue_name: "Online",
  city: "Online",
  address: null,
  maps_url: null,
  capacity: 120,
  price: 0,
  starts_at: "2026-10-24T09:00:00+00:00",
  ends_at: "2026-10-26T18:00:00+00:00",
  status: "upcoming",
  approval_status: "approved",
  tier: null,
  claimed_tier: null,
  review_note: null,
  organization_id: ORG_ID,
};

const pgrst202 = (fn) => ({
  code: "PGRST202",
  details: `Searched for the function public.${fn}, but no matches were found in the schema cache.`,
  hint: null,
  message: `Could not find the function public.${fn} in the schema cache`,
});

function route(url) {
  const u = new URL(url);
  const path = u.pathname.replace("/rest/v1", "");
  const json = (body, status = 200) => ({ body: JSON.stringify(body), status });

  if (path.startsWith("/rpc/")) {
    const fn = path.slice(5);
    // The live project: these four are missing, everything else is unknown here.
    if (["get_organization_rating", "get_hackathon_rating", "list_hackathon_reviews", "get_my_review_state"].includes(fn)) {
      return json(pgrst202(fn), 404);
    }
    if (fn === "get_my_profile") return json({ full_name: "Probe Org", username: "probe", bio: "", skills: [] });
    return json(pgrst202(fn), 404);
  }
  if (path.startsWith("/organizations")) return json([ORG]);
  if (path.startsWith("/hackathons") && path.includes("organization_id")) return json([EVENT]);
  if (path.startsWith("/hackathons")) return json([EVENT]);
  if (path.startsWith("/registrations")) return json([]);
  if (path.startsWith("/event_reviews")) return json({ code: "PGRST205", message: "Could not find the table 'public.event_reviews' in the schema cache" }, 404);
  if (path.startsWith("/")) return json([]);
  return json([]);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
});
const page = await browser.newPage();

await page.evaluateOnNewDocument((key, value) => {
  try {
    window.localStorage.setItem(key, value);
    window.localStorage.setItem("hackmate.authMode", "organization");
  } catch {}
}, STORAGE_KEY, JSON.stringify(session));

let routeName = "?";
page.on("console", (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const text = m.text();
  if (/CORS policy|Failed to load resource|net::ERR_FAILED/.test(text)) return;
  console.log(`  [console.${m.type()}] ${text}`);
});
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 8).join("\n")}`));
page.on("requestfailed", (r) => console.log(`  [requestfailed] ${r.url()} ${r.failure()?.errorText}`));

await page.setRequestInterception(true);
page.on("request", (req) => {
  const url = req.url();
  if (url.startsWith(`${SUPABASE}/`)) {
    const origin = new URL(APP).origin;
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers":
        req.headers()["access-control-request-headers"] ||
        "authorization, x-client-info, apikey, content-type, accept, accept-profile, content-profile, x-retry-count, x-profile-name",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Expose-Headers": "content-profile, x-total-count, pgrst-truncated",
      Vary: "Origin, Access-Control-Request-Headers",
    };
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
    const wantsObject = String(req.headers()["accept"] || "").includes("pgrst.object");
    const routed = route(url);
    let body = routed.body;
    let status = routed.status;
    if (wantsObject && status === 200) {
      const rows = JSON.parse(body);
      if (Array.isArray(rows)) {
        if (!rows.length) {
          body = JSON.stringify({ code: "PGRST116", details: "Results contain 0 rows", hint: null, message: "JSON object requested, multiple (or no) rows returned" });
          status = 406;
        } else {
          body = JSON.stringify(rows[0]);
        }
      }
    }
    console.log(
      `  [mock ${status} obj=${wantsObject} accept=${req.headers()["accept"] || ""}] ${req.method()} ${url
        .replace(SUPABASE, "")
        .slice(0, 70)} -> ${String(body).slice(0, 80)}`,
    );
    return req.respond({ status, headers: { ...cors, "Content-Type": "application/json" }, body });
  }
  return req.continue();
});

// Land on the home page first so the session and organization context resolve
// the way they do for a signed-in user clicking around the app.
await page.goto(`${APP}/`, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => console.log(`  [nav] ${e.message}`));
await new Promise((r) => setTimeout(r, 2000));

for (const route of process.argv.slice(2)) {
  routeName = route;
  console.log(`== ${route}`);
  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, route);
  await new Promise((r) => setTimeout(r, 3000));
  const info = await page.evaluate(() => ({
    url: location.pathname + location.search,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 1500),
    rootChildren: document.getElementById("root")?.childElementCount ?? -1,
  }));
  console.log(`  [url] ${info.url}`);
  console.log(`  [root children] ${info.rootChildren}`);
  console.log(`  [text] ${info.text || "(EMPTY)"}`);
}

await browser.close();
