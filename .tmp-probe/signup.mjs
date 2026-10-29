import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5173";
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
const NAME = process.env.PROBE_NAME || "Probe Org";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--window-size=1400,900"],
});
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log(`  [console.${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));

await page.goto(`${BASE}/signup?as=organization`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 800));

// Make sure the Organization tab is active.
const tabs = await page.$$(".auth-audience-option");
for (const tab of tabs) {
  const text = await tab.evaluate((el) => el.textContent.trim());
  if (/organization/i.test(text)) await tab.click();
}
await new Promise((r) => setTimeout(r, 300));

await page.type('input[name="name"]', NAME);
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASSWORD);
await page.click('input[type="checkbox"]');
await page.click('button[type="submit"]');
await new Promise((r) => setTimeout(r, 4000));

const state = await page.evaluate(() => ({
  url: location.pathname + location.search,
  message: document.querySelector(".form-message")?.innerText || "",
  text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 500),
}));
console.log(JSON.stringify(state, null, 2));

await browser.close();
