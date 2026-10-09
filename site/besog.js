// Besøgstælleren på forsiden: registrerer besøget (uden cookies) og tegner
// verdenskortet over, hvor de besøgende kommer fra. Se api/besog.ashx.
const API = "api/besog.ashx";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel) => document.querySelector(sel);
const regionNames = new Intl.DisplayNames(["da"], { type: "region" });
const countryName = (code) => {
  if (code === "--" || code === "ZZ") return "Ukendt";
  try { return regionNames.of(code); } catch { return code; }
};
// Landekode i stedet for flag-emoji, som Windows ikke kan vise
const badge = (code) => (/^[A-Z]{2}$/.test(code) && code !== "ZZ" ? code : "?");
const nf = new Intl.NumberFormat("da-DK");

// Tæl kun rigtige besøg på det rigtige domæne (ikke lokalt eller via Google Oversæt)
const countable = () =>
  /(^|\.)villadsclaes\.dk$/.test(location.hostname) && !navigator.webdriver && document.visibilityState !== "prerender";

async function register() {
  if (!countable()) return;
  try {
    await fetch(API, { method: "POST", keepalive: true, credentials: "omit" });
  } catch { /* tælleren må aldrig ødelægge siden */ }
}

async function loadStats() {
  // ?demo-besog viser eksempeldata, så kortet kan afprøves lokalt
  if (new URLSearchParams(location.search).has("demo-besog")) {
    return {
      besogende: 1287, visninger: 2410, idag: 23, siden: "2026-10-09",
      lande: { DK: 702, SE: 96, NO: 88, DE: 121, GB: 54, US: 61, NL: 22, FR: 19, ES: 14, PL: 9, FI: 17, IS: 4, IT: 8, CA: 6, AU: 3, BR: 2, ZA: 1, IN: 2, JP: 1, "--": 5 },
      dage: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), Math.round(20 + Math.sin(i / 3) * 12 + i)])),
    };
  }
  const res = await fetch(API, { cache: "no-store", credentials: "omit" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function countUp(el, to) {
  if (reduceMotion) { el.textContent = nf.format(to); return; }
  // Sikkerhedsnet hvis animationsrammer er sat på pause (fx skjult fane)
  setTimeout(() => (el.textContent = nf.format(to)), 2000);
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 1600);
    el.textContent = nf.format(Math.round(to * (1 - Math.pow(1 - p, 4))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const SVG = "http://www.w3.org/2000/svg";
const el = (name, attrs = {}) => {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

function drawMap(world, lande) {
  const svg = $("#world");
  const tip = $("#world-tip");
  svg.setAttribute("viewBox", `0 0 ${world.w} ${world.h}`);

  const defs = el("defs");
  defs.innerHTML = `<radialGradient id="pulse-fill"><stop offset="0" stop-color="#ff5c8a" stop-opacity=".9"/><stop offset="1" stop-color="#ff5c8a" stop-opacity="0"/></radialGradient>
    <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="#21c7f5" stop-opacity="0"/><stop offset=".5" stop-color="#21c7f5" stop-opacity=".18"/><stop offset="1" stop-color="#21c7f5" stop-opacity="0"/></linearGradient>`;
  svg.append(defs);
  svg.append(el("path", { d: world.grid, class: "grid" }));

  const max = Math.max(1, ...Object.entries(lande).filter(([c]) => c !== "--").map(([, v]) => v));
  const group = el("g", { class: "countries" });
  for (const shape of world.countries) {
    const count = lande[shape.c] ?? 0;
    const p = el("path", { d: shape.d, class: count ? "land hit" : "land" });
    p.style.setProperty("--delay", `${(shape.x / world.w) * 900}ms`);
    if (count) p.style.setProperty("--v", (0.25 + 0.75 * Math.log1p(count) / Math.log1p(max)).toFixed(3));
    p.dataset.c = shape.c ?? "";
    group.append(p);
  }
  svg.append(group);

  // Pulserende ringe over de lande, hvor flest kommer fra
  const pulses = el("g", { class: "pulses" });
  const top = world.countries
    .filter((s) => lande[s.c])
    .sort((a, b) => lande[b.c] - lande[a.c])
    .slice(0, 12);
  top.forEach((s, i) => {
    const r = 4 + 10 * (Math.log1p(lande[s.c]) / Math.log1p(max));
    const g = el("g", { transform: `translate(${s.x} ${s.y})` });
    g.style.setProperty("--i", i);
    g.append(el("circle", { r: r * 2.6, class: "glow", fill: "url(#pulse-fill)" }));
    g.append(el("circle", { r, class: "ring" }));
    g.append(el("circle", { r: Math.max(2.2, r / 3), class: "dot" }));
    pulses.append(g);
  });
  svg.append(pulses);
  svg.append(el("rect", { class: "scan", x: -300, y: 0, width: 300, height: world.h, fill: "url(#scan)" }));

  // Værktøjstip med landets navn og antal
  const wrap = svg.parentElement;
  svg.addEventListener("pointermove", (e) => {
    const code = e.target.dataset?.c;
    if (!code) { tip.hidden = true; return; }
    const count = lande[code] ?? 0;
    tip.textContent = `${countryName(code)} · ${nf.format(count)} besøgende`;
    const r = wrap.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.hidden = false;
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));

  new IntersectionObserver(([entry], obs) => {
    if (!entry.isIntersecting) return;
    svg.classList.add("drawn");
    obs.disconnect();
  }, { threshold: 0.25 }).observe(svg);
}

function drawDays(dage) {
  const box = $("#world-days");
  const entries = Object.entries(dage).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  if (entries.length < 2) { box.remove(); return; }
  const max = Math.max(...entries.map(([, v]) => v));
  for (const [day, v] of entries) {
    const bar = document.createElement("span");
    bar.style.setProperty("--h", `${Math.max(6, (v / max) * 100)}%`);
    bar.title = `${new Date(day).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}: ${v}`;
    box.append(bar);
  }
}

function drawList(lande) {
  const list = $("#country-list");
  const entries = Object.entries(lande).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const max = entries[0]?.[1] ?? 1;
  entries.forEach(([code, v], i) => {
    const li = document.createElement("li");
    li.style.setProperty("--w", `${(v / max) * 100}%`);
    li.style.setProperty("--d", `${i * 60}ms`);
    li.innerHTML = `<span class="flag" aria-hidden="true" translate="no"></span><span class="name"></span><span class="count"></span>`;
    li.querySelector(".flag").textContent = badge(code);
    li.querySelector(".name").textContent = countryName(code);
    li.querySelector(".count").textContent = `${nf.format(v)} · ${Math.round((v / total) * 100)} %`;
    list.append(li);
  });
}

export async function visitors(observe) {
  await register();
  let stats, world;
  try {
    [stats, world] = await Promise.all([loadStats(), fetch("data/world.json").then((r) => r.json())]);
  } catch {
    return; // ingen tæller (fx lokalt) – sektionen forbliver skjult
  }
  if (!stats.besogende) return;

  const section = $("#besog");
  section.hidden = false;
  const lande = stats.lande ?? {};
  const known = Object.keys(lande).filter((c) => c !== "--" && c !== "ZZ");

  drawMap(world, lande);
  drawDays(stats.dage ?? {});
  drawList(lande);
  observe();

  let counted = false;
  new IntersectionObserver(([entry], obs) => {
    if (!entry.isIntersecting || counted) return;
    counted = true;
    countUp($('[data-visit="besogende"]'), stats.besogende);
    countUp($('[data-visit="lande"]'), known.length);
    countUp($('[data-visit="idag"]'), stats.idag ?? 0);
    obs.disconnect();
  }, { threshold: 0.3 }).observe($(".visit-stats"));
}
