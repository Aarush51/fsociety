import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.BASE || "http://localhost:5173";
const routes = process.argv.slice(2);
const login = process.env.PROBE_EMAIL ? { email: process.env.PROBE_EMAIL, password: process.env.PROBE_PASSWORD } : null;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
});

const page = await browser.newPage();
page.on("console", (msg) => {
  const type = msg.type();
  if (type === "log" && process.env.VERBOSE !== "1") return;
  console.log(`  [console.${type}] ${msg.text()}`);
});
page.on("pageerror", (err) => console.log(`  [pageerror] ${err.message}\n${(err.stack || "").split("\n").slice(0, 6).join("\n")}`));
page.on("requestfailed", (req) => console.log(`  [requestfailed] ${req.url()} ${req.failure()?.errorText}`));
page.on("response", (res) => {
  const url = res.url();
  if (url.includes("/rest/v1/") && res.status() >= 400) {
    console.log(`  [api ${res.status()}] ${url.replace(BASE, "")}`);
  }
});

if (login) {
  console.log(`== logging in as ${login.email}`);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"], input[name="email"]', login.email);
  await page.type('input[type="password"], input[name="password"]', login.password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {}),
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`  [after login] url=${page.url()}`);
}

for (const route of routes) {
  console.log(`== ${route}`);
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => console.log(`  [nav] ${e.message}`));
  await new Promise((r) => setTimeout(r, 2500));
  const info = await page.evaluate(() => ({
    url: location.pathname + location.search,
    text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 1200),
    rootChildren: document.getElementById("root")?.childElementCount ?? -1,
    rootHTML: (document.getElementById("root")?.innerHTML || "").slice(0, 300),
  }));
  console.log(`  [url] ${info.url}`);
  console.log(`  [root children] ${info.rootChildren}`);
  console.log(`  [text] ${info.text || "(EMPTY)"}`);
  if (!info.rootChildren) console.log(`  [root html] ${info.rootHTML || "(EMPTY)"}`);
}

await browser.close();
