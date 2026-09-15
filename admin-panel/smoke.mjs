/**
 * Browser smoke test — `npm run smoke`.
 *
 * Signs in for real against a running API, then walks every route checking that
 * each one actually paints, that no console error or failed request occurs, that
 * both accents resolve in both modes, and that a Support Staff session is kept
 * out of Admin & Roles.
 *
 * It is worth having rather than trusting a type-check: two defects that both
 * compiled cleanly and looked fine in review only showed up here — a session
 * that was discarded on every reload, and detail screens that rendered to a
 * blank column because a ported `display: none` had no counterpart override.
 *
 * Needs both servers up:
 *   API     — npm run dev   (in blacknexa-backend)
 *   console — npm run dev   (here)
 *
 * Point CHROME_PATH at a Chrome or Chromium binary if the default is wrong.
 */

import puppeteer from "puppeteer-core";

const CHROME =
  process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5174";
const API = process.env.SMOKE_API_URL ?? "http://localhost:3010/api/v1";
/** Seeded by `npm run db:seed:admin` in the backend. */
const PASSWORD = process.env.SMOKE_PASSWORD ?? "BlackNexa2026!";

const problems = [];
const shots = [];

/** Sign in through the API so the browser can be handed a live session. */
async function apiSignIn(email, password) {
  const loginRes = await fetch(`${API}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login = await loginRes.json();
  if (login.success !== 1) throw new Error(`login failed: ${login.error ?? login.message}`);

  const verifyRes = await fetch(`${API}/admin/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: login.result.challengeId,
      code: login.result.devCode,
    }),
  });
  const session = await verifyRes.json();
  if (session.success !== 1) throw new Error(`mfa failed: ${session.error ?? session.message}`);
  return session.result;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });

  let currentRoute = "(startup)";
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // React Router logs a benign future-flag notice on some versions.
    if (text.includes("React Router Future Flag")) return;
    problems.push(`[console] ${currentRoute}: ${text}`);
  });
  page.on("pageerror", (err) => problems.push(`[pageerror] ${currentRoute}: ${err.message}`));
  page.on("requestfailed", (req) => {
    problems.push(`[request] ${currentRoute}: ${req.url()} — ${req.failure()?.errorText}`);
  });

  // ── 1. The login screen renders ──────────────────────────────────────────
  currentRoute = "/login";
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector("#loginStepCredentials", { timeout: 20_000 });

  const loginTitle = await page.$eval(".login-title", (el) => el.textContent.trim());
  console.log(`login screen: "${loginTitle}"`);
  shots.push(["login", await page.screenshot({ encoding: "base64" })]);

  // ── 2. Sign in for real, through the form ────────────────────────────────
  await page.type("#loginStepCredentials input[type=email]", "superadmin@blacknexa.com");
  await page.type("#loginStepCredentials input[type=password]", PASSWORD);
  await page.click(".login-submit-btn");

  await page.waitForSelector("#loginStepMfa", { timeout: 20_000 });
  console.log("mfa step reached");

  // The dev build shows the generated code, which is what makes this walkable.
  const devCode = await page.$eval(".login-info-alert strong", (el) => el.textContent.trim());
  console.log(`dev code shown on screen: ${devCode}`);
  shots.push(["mfa", await page.screenshot({ encoding: "base64" })]);

  await page.type(".mfa-digit-input", devCode);
  await page.waitForSelector(".side", { timeout: 30_000 });
  console.log("signed in — console shell rendered");

  const operator = await page.$eval(".user-name", (el) => el.textContent.trim());
  const roleLabel = await page.$eval(".user-role", (el) => el.textContent.trim());
  console.log(`sidebar shows: ${operator} / ${roleLabel}`);

  const navLabels = await page.$$eval(".side-menu .nav-label", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  console.log(`nav items (${navLabels.length}): ${navLabels.join(", ")}`);

  // ── 3. Walk every route ──────────────────────────────────────────────────
  const routes = [
    "/dashboard",
    "/incidents",
    "/incidents/INC-20481",
    "/incidents/assigned",
    "/moderation",
    "/moderation/CMT-90412",
    "/moderation/keywords",
    "/resources",
    "/resources/RES-101",
    "/resources/new",
    "/news",
    "/news/categories",
    "/news/tags",
    "/news/daily-briefing",
    "/notifications",
    "/content/articles",
    "/content/faqs",
    "/content/legal",
    "/content/legal/terms",
    "/users",
    "/admin-roles",
    "/settings",
  ];

  for (const route of routes) {
    currentRoute = route;
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle0", timeout: 45_000 });
    await page.waitForSelector("#main-content", { timeout: 20_000 });

    /*
     * Presence in the DOM is not enough: a shell left at `display: none` still
     * contains its heading, which is exactly how a blank screen slips through.
     * Measure the painted box instead.
     */
    const heading = await page
      .$eval("#main-content h1", (el) => {
        const box = el.getBoundingClientRect();
        return { text: el.textContent.trim(), visible: box.width > 0 && box.height > 0 };
      })
      .catch(() => null);
    const denied = await page.$("#accessDeniedView");

    // Total painted area of the content column, to catch a screen that renders
    // a heading and nothing else.
    const painted = await page.$eval("#main-content", (el) => {
      const box = el.getBoundingClientRect();
      return Math.round(box.width * box.height);
    });

    const state = denied
      ? "ACCESS DENIED"
      : !heading
        ? "NO HEADING"
        : !heading.visible
          ? "HEADING HIDDEN"
          : `"${heading.text}"`;
    console.log(`  ${route.padEnd(30)} ${state.padEnd(52)} painted ${painted}px²`);

    if (!denied) {
      if (!heading) problems.push(`[render] ${route}: no <h1> rendered`);
      else if (!heading.visible) problems.push(`[render] ${route}: <h1> is in the DOM but not visible`);
      if (painted < 50_000) problems.push(`[render] ${route}: content column painted only ${painted}px²`);
    }
  }

  // ── 4. Themes ────────────────────────────────────────────────────────────
  currentRoute = "/admin-roles (themes)";
  await page.goto(`${BASE}/admin-roles`, { waitUntil: "networkidle0" });

  for (const [accent, mode] of [
    ["blue", "light"],
    ["blue", "dark"],
    ["gold", "light"],
    ["gold", "dark"],
  ]) {
    await page.evaluate(
      (a, m) => {
        document.documentElement.dataset.accent = a;
        document.documentElement.dataset.mode = m;
        document.body.classList.toggle("dark", m === "dark");
      },
      accent,
      mode,
    );
    const resolved = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        accent: s.getPropertyValue("--accent").trim(),
        bg: getComputedStyle(document.body).backgroundColor,
      };
    });
    console.log(`  ${accent}/${mode}: --accent ${resolved.accent}, body ${resolved.bg}`);
    shots.push([`theme-${accent}-${mode}`, await page.screenshot({ encoding: "base64" })]);
  }

  // ── 5. RBAC in the browser: sign in as Support Staff ─────────────────────
  currentRoute = "/ (support staff)";
  const staffSession = await apiSignIn("staff@blacknexa.com", PASSWORD);
  await page.evaluate((refresh) => {
    localStorage.setItem("bn_admin_refresh", refresh);
    localStorage.setItem("bn_admin_remember", "1");
  }, staffSession.tokens.refreshToken);

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".side", { timeout: 30_000 });

  const staffNav = await page.$$eval(".side-menu .nav-label", (els) =>
    els.map((e) => e.textContent.trim()),
  );
  const staffRole = await page.$eval(".user-role", (el) => el.textContent.trim());
  console.log(`support staff sees role "${staffRole}" and nav: ${staffNav.join(", ")}`);
  shots.push(["staff-nav", await page.screenshot({ encoding: "base64" })]);

  currentRoute = "/admin-roles (support staff)";
  await page.goto(`${BASE}/admin-roles`, { waitUntil: "networkidle0" });
  const blocked = await page.$("#accessDeniedView");
  console.log(`support staff on /admin-roles: ${blocked ? "BLOCKED (correct)" : "ALLOWED (WRONG)"}`);
  if (!blocked) problems.push("[rbac] support staff could open /admin-roles");
  shots.push(["staff-denied", await page.screenshot({ encoding: "base64" })]);

  await browser.close();

  // ── Report ───────────────────────────────────────────────────────────────
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("smoke-shots", { recursive: true });
  for (const [name, data] of shots) {
    writeFileSync(`smoke-shots/${name}.png`, Buffer.from(data, "base64"));
  }
  console.log(`\nsaved ${shots.length} screenshots to smoke-shots/`);

  if (problems.length === 0) {
    console.log("\nNO PROBLEMS DETECTED");
  } else {
    console.log(`\n${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log("  " + p);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  process.exitCode = 1;
});
