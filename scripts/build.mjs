// Bygger landingssiden til dist/:
// 1. kopierer de statiske filer fra site/
// 2. henter repos fra GitHub og lægger sites.config.json ovenpå
// 3. tjekker om hvert site svarer, og tager et skærmbillede af dem der gør
// 4. skriver det hele til dist/data/sites.json, som siden læser ved indlæsning
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const config = JSON.parse(await readFile(path.join(root, "sites.config.json"), "utf8"));
const skipShots = process.argv.includes("--no-shots");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 villadsclaes-landingpage";

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, "site"), dist, { recursive: true });
await mkdir(path.join(dist, "data"), { recursive: true });
await mkdir(path.join(dist, "shots"), { recursive: true });

// ---------- GitHub ----------
async function gh(url) {
  const headers = { "User-Agent": UA, Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${url}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${url}: ${res.status} ${await res.text()}`);
  return res.json();
}

let repos = [];
try {
  for (let page = 1; ; page++) {
    const batch = await gh(`/users/${config.owner}/repos?per_page=100&page=${page}&sort=pushed`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
} catch (err) {
  console.warn(`⚠ Kunne ikke hente repos: ${err.message}`);
}
repos = repos.filter((r) => !r.private);

// Sprogfordeling pr. repo (bytes), bruges til de farvede sprog-barer
async function languages(repo) {
  try {
    return await gh(`/repos/${config.owner}/${repo}/languages`);
  } catch {
    return {};
  }
}

// ---------- Tjek af sites ----------
async function fetchPage(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const html = (await res.text()).slice(0, 300000);
    return { ok: true, status: res.status, finalUrl: res.url, html, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.cause?.code || err.message), ms: Date.now() - started };
  }
}

const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&aacute;/gi, "á").replace(/&aelig;/g, "æ").replace(/&oslash;/g, "ø").replace(/&aring;/g, "å")
    .replace(/\s+/g, " ")
    .trim();

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2]) : "";
}

const titleOf = (html) => decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
const fingerprint = (html) => createHash("sha1").update(titleOf(html) + html.length).digest("hex");

// Domænet har wildcard-DNS: ukendte underdomæner viser bare roden. Vi henter et
// underdomæne der ikke findes, så vi kan genkende den "falske" side bagefter.
const baseline = await fetchPage(`http://zz-findes-ikke-${Date.now()}.${config.domain}/`);
const baselinePrint = baseline.ok ? fingerprint(baseline.html) : null;
const baselineTitle = baseline.ok ? titleOf(baseline.html) : null;

async function probe(url) {
  let page = await fetchPage(url);
  // Underdomæner uden eget certifikat fejler over https, så prøv http
  if (!page.ok && url.startsWith("https://")) {
    const insecure = await fetchPage(url.replace("https://", "http://"));
    if (insecure.ok) page = { ...insecure, insecure: true };
  }
  if (!page.ok) return { state: "offline", error: page.error, ms: page.ms };

  const title = titleOf(page.html);
  // Kun underdomæner af vores eget domæne kan ramme wildcard-siden
  const hostname = new URL(url).hostname;
  const isSubdomain = hostname.endsWith(`.${config.domain}`) && hostname !== `www.${config.domain}`;
  const isWildcard = isSubdomain && baselinePrint && (fingerprint(page.html) === baselinePrint || title === baselineTitle);
  let state = "online";
  if (page.status >= 400) state = "fejl";
  else if (isWildcard) state = "ingen";
  else if (/is hosted by Simply\.com|Default Web Site Page|IIS Windows Server/i.test(title)) state = "parkeret";

  return {
    state,
    status: page.status,
    ms: page.ms,
    finalUrl: page.finalUrl,
    pageTitle: title,
    description: meta(page.html, "description") || meta(page.html, "og:description"),
    themeColor: meta(page.html, "theme-color"),
  };
}

// ---------- Saml listen ----------
const sites = [];

for (const repo of repos) {
  const extra = config.repos?.[repo.name] ?? {};
  if (extra.hidden) continue;
  if (repo.fork && !config.includeForks && !extra.url && !extra.include) continue;
  if (repo.archived && !extra.url) continue;

  // Url: fra config, ellers repoets "Website"-felt på GitHub, ellers gæt på <navn>.villadsclaes.dk
  const guessed = `https://${repo.name.toLowerCase()}.${config.domain}`;
  const url = extra.url || (repo.homepage && !/github\.com|apress|lab\.github/i.test(repo.homepage) ? repo.homepage : null);

  sites.push({
    id: repo.name.toLowerCase(),
    title: extra.title || repo.name,
    repo: repo.name,
    repoUrl: repo.html_url,
    url,
    guess: url ? null : guessed,
    tagline: extra.tagline || repo.description || "",
    language: extra.language || repo.language || null,
    topics: repo.topics ?? [],
    stars: repo.stargazers_count,
    fork: repo.fork,
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    featured: !!extra.featured,
    accent: extra.accent || null,
  });
}

for (const extra of config.extra ?? []) {
  sites.push({ repo: null, repoUrl: null, topics: [], featured: false, accent: null, pushedAt: null, ...extra });
}

console.log(`Tjekker ${sites.length} projekter …`);
await Promise.all(
  sites.map(async (site) => {
    if (site.repo) site.languages = await languages(site.repo);
    if (site.url) {
      site.probe = await probe(site.url);
    } else if (site.guess) {
      const p = await probe(site.guess);
      if (p.state === "online") {
        site.url = site.guess;
        site.probe = p;
      }
    }
    delete site.guess;
    if (!site.tagline && site.probe?.description) site.tagline = site.probe.description;
    console.log(`  ${(site.probe?.state ?? "repo").padEnd(9)} ${site.title} ${site.url ?? ""}`);
  })
);

// ---------- Sortering ----------
const rank = (s) => (s.probe?.state === "online" ? 0 : s.url ? 1 : 2);
sites.sort((a, b) => b.featured - a.featured || rank(a) - rank(b) || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));

// ---------- Skærmbilleder og delingsbillede ----------
if (!skipShots) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.warn("⚠ Playwright er ikke installeret, så der tages ingen skærmbilleder.");
  }
  // Playwrights egen Chromium, ellers en installeret Chrome/Edge
  let browser;
  for (const opts of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    if (!chromium || browser) break;
    browser = await chromium.launch(opts).catch(() => null);
  }
  if (chromium && !browser) console.warn("⚠ Kunne ikke starte en browser, så der tages ingen skærmbilleder.");
  if (browser) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
      userAgent: UA,
      locale: "da-DK",
    });
    for (const site of sites.filter((s) => s.probe?.state === "online")) {
      const page = await context.newPage();
      try {
        await page.goto(site.probe.finalUrl || site.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const file = `shots/${site.id}.jpg`;
        await page.screenshot({ path: path.join(dist, file), type: "jpeg", quality: 72 });
        site.shot = `${file}?v=${Date.now().toString(36)}`;
        console.log(`  📸 ${site.title}`);
      } catch (err) {
        console.warn(`  ⚠ Skærmbillede af ${site.title} fejlede: ${err.message}`);
      } finally {
        await page.close();
      }
    }
    await shareImage(context);
    await browser.close();
  }
}

// ---------- Output ----------

const languageTotals = {};
for (const s of sites) for (const [lang, bytes] of Object.entries(s.languages ?? {})) languageTotals[lang] = (languageTotals[lang] ?? 0) + bytes;

const data = {
  generatedAt: new Date().toISOString(),
  owner: config.owner,
  stats: {
    repos: repos.filter((r) => !r.fork).length,
    online: sites.filter((s) => s.probe?.state === "online").length,
    languages: languageTotals,
    firstYear: repos.reduce((y, r) => Math.min(y, new Date(r.created_at).getFullYear()), new Date().getFullYear()),
  },
  sites,
};

await writeFile(path.join(dist, "data", "sites.json"), JSON.stringify(data, null, 2));
console.log(`✔ dist/ bygget: ${data.stats.online} sites online, ${sites.length} projekter i alt.`);

// Delingsbilledet (og.jpg, 1200×630) til Facebook, LinkedIn, Slack osv.
// Tegnes som en lille HTML-side med de friske skærmbilleder og fotograferes.
async function shareImage(context) {
  const shots = sites.filter((s) => s.shot).slice(0, 4);
  const online = sites.filter((s) => s.probe?.state === "online").length;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cards = shots
    .map((s, i) => `<figure style="--i:${i}"><div class="bar"><i></i><i></i><i></i><span>${esc(new URL(s.url).host.replace(/^www\./, ""))}</span></div><img src="${s.shot.split("?")[0]}"></figure>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>
    *{box-sizing:border-box;margin:0}
    body{width:1200px;height:630px;overflow:hidden;background:#07060f;color:#f3f1ff;font-family:Inter,sans-serif;position:relative}
    .bg{position:absolute;inset:0;background:radial-gradient(50% 60% at 15% 20%,rgba(124,92,255,.45),transparent 70%),radial-gradient(45% 55% at 90% 90%,rgba(255,92,138,.35),transparent 70%),radial-gradient(35% 40% at 70% 0%,rgba(33,199,245,.25),transparent 70%)}
    .stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 20% 30%,#fff8,transparent),radial-gradient(1px 1px at 70% 20%,#fff9,transparent),radial-gradient(1.5px 1.5px at 40% 80%,#fff6,transparent),radial-gradient(1px 1px at 85% 55%,#fff8,transparent),radial-gradient(1px 1px at 10% 70%,#fff7,transparent);background-size:300px 300px}
    .text{position:absolute;left:72px;top:92px;width:560px;z-index:2}
    .pill{display:inline-flex;align-items:center;gap:10px;padding:8px 16px;border:1px solid #ffffff22;border-radius:99px;background:#ffffff0d;font:500 18px 'JetBrains Mono',monospace;color:#c9c5e6}
    .pill b{width:10px;height:10px;border-radius:50%;background:#3ee08f;box-shadow:0 0 12px #3ee08f}
    h1{margin-top:28px;font:800 132px/.86 'Bricolage Grotesque',sans-serif;letter-spacing:-.055em}
    h1 span{display:block;background:linear-gradient(100deg,#7c5cff,#ff5c8a 45%,#ffb35c 75%,#21c7f5);-webkit-background-clip:text;color:transparent}
    p{margin-top:30px;font:500 26px/1.35 Inter,sans-serif;color:#c9c5e6}
    .url{position:absolute;left:72px;bottom:56px;font:600 22px 'JetBrains Mono',monospace;color:#f3f1ff;z-index:2}
    .stack{position:absolute;right:-40px;top:70px;width:640px;height:520px;perspective:1600px}
    figure{position:absolute;width:520px;border-radius:16px;overflow:hidden;background:#0b0a17;border:1px solid #ffffff26;box-shadow:0 40px 80px -20px #000c;
      transform:translate(calc(var(--i)*-44px),calc(var(--i)*92px)) rotateY(-22deg) rotateX(8deg) rotateZ(-4deg);left:120px;z-index:calc(10 - var(--i))}
    .bar{display:flex;align-items:center;gap:6px;padding:10px 12px;background:#ffffff0a;border-bottom:1px solid #ffffff1a}
    .bar i{width:10px;height:10px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
    .bar span{margin-left:10px;font:13px 'JetBrains Mono',monospace;color:#a19dbd}
    img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top}
  </style></head><body><div class="bg"></div><div class="stars"></div>
  <div class="text"><div class="pill"><b></b>${online} sites online</div><h1>Villads<span>Claes</span></h1><p>Alle mine sites og projekter samlet ét sted.</p></div>
  <div class="url">villadsclaes.dk</div><div class="stack">${cards}</div></body></html>`;
  const tmp = path.join(dist, "_og.html");
  await writeFile(tmp, html);
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dist, "og.jpg"), type: "jpeg", quality: 85 });
    console.log("  🖼  Delingsbillede (og.jpg)");
  } catch (err) {
    console.warn(`  ⚠ Delingsbilledet fejlede: ${err.message}`);
  } finally {
    await page.close();
    await rm(tmp, { force: true });
  }
}
