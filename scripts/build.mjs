// Bygger landingssiden til dist/:
// 1. kopierer de statiske filer fra site/
// 2. henter repos fra GitHub og lægger sites.config.json ovenpå
// 3. tjekker om hvert site svarer, og tager et skærmbillede af dem der gør
// 4. skriver det hele til dist/data/sites.json, som siden læser ved indlæsning
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// ---------- Skærmbilleder ----------
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
    await browser.close();
  }
}

// ---------- Sortering og output ----------
const rank = (s) => (s.probe?.state === "online" ? 0 : s.url ? 1 : 2);
sites.sort((a, b) => b.featured - a.featured || rank(a) - rank(b) || (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));

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
