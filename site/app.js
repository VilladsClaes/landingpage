const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel, el = document) => el.querySelector(sel);

// GitHubs egne sprogfarver, så alt ligner det man kender
const LANG_COLORS = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", "C#": "#178600", CSS: "#663399", HTML: "#e34c26",
  Python: "#3572A5", Java: "#b07219", PHP: "#4F5D95", SCSS: "#c6538c", Less: "#1d365d", ASP: "#6a40fd",
  "ASP.NET": "#9400ff", PowerShell: "#012456", Shell: "#89e051", Razor: "#512be4", Blog: "#eab308",
  Dockerfile: "#384d54", Vue: "#41b883", Svelte: "#ff3e00", "Classic ASP": "#6a40fd",
};
const langColor = (l) => LANG_COLORS[l] || `hsl(${[...(l || "x")].reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360} 70% 60%)`;

const STATUS_TEXT = { online: "Online", fejl: "Fejler", offline: "Offline", parkeret: "På vej", ingen: "Ikke sat op" };

const rtf = new Intl.RelativeTimeFormat("da", { numeric: "auto" });
function relative(iso) {
  if (!iso) return "";
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return "lige nu";
}
const host = (url) => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; } };
const initials = (t) => t.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// ---------- Opdel overskriften i bogstaver ----------
document.querySelectorAll("[data-split]").forEach((el, w) => {
  const text = el.textContent;
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const s = document.createElement("span");
    s.className = "char";
    s.textContent = ch;
    s.style.setProperty("--i", i + w * 6);
    el.append(s);
  });
  el.dataset.splitDone = "";
});

// ---------- Cursor-glød og magnetiske knapper ----------
const glow = $(".cursor-glow");
addEventListener("pointermove", (e) => {
  glow.style.setProperty("--mx", `${e.clientX}px`);
  glow.style.setProperty("--my", `${e.clientY}px`);
}, { passive: true });

document.querySelectorAll(".magnetic").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
  });
  el.addEventListener("pointerleave", () => (el.style.transform = ""));
});

// ---------- Reveal ved scroll ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -8% 0px" });
const observe = (root = document) => root.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));

// ---------- Tællere ----------
function countUp(el, to) {
  if (reduceMotion) { el.textContent = to; return; }
  const from = el.hasAttribute("data-plain") ? Math.max(0, to - 15) : 0;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 1800);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Skrivemaskine ----------
function typer(words) {
  const el = $("#typer");
  if (reduceMotion || !words.length) return;
  let w = 0, i = el.textContent.length, deleting = true;
  let current = el.textContent;
  const step = () => {
    if (deleting) {
      i--;
      if (i <= 0) { deleting = false; current = words[w++ % words.length]; }
    } else if (i < current.length) i++;
    else { deleting = true; return setTimeout(step, 2200); }
    el.textContent = current.slice(0, i);
    setTimeout(step, deleting ? 35 : 70);
  };
  setTimeout(step, 2400);
}

// ---------- Kosmos: sites som planeter i kredsløb ----------
function cosmos(nodes) {
  const canvas = $("#cosmos");
  const ctx = canvas.getContext("2d");
  let W, H, dpr, stars = [];
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  const planets = nodes.map((n, i) => ({
    label: n.title,
    color: [n.accent, langColor(n.language)].find((c) => c?.startsWith("#")) || "#7c5cff",
    ring: 0.5 + (i % 3) * 0.22 + Math.random() * 0.05,
    angle: (i / nodes.length) * Math.PI * 2,
    speed: (0.00006 + Math.random() * 0.00008) * (i % 2 ? 1 : -1) * 1.2,
    size: n.probe?.state === "online" ? 5 + Math.random() * 3 : 3,
    online: n.probe?.state === "online",
  }));

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((W * H) / 3500) }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.9 + 0.1, t: Math.random() * Math.PI * 2,
    }));
  }
  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", (e) => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  function frame(t) {
    requestAnimationFrame(frame);
    if (!visible) return;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      const x = (s.x - mouse.x * 40 * s.z + W) % W;
      const y = (s.y - mouse.y * 40 * s.z + H) % H;
      ctx.globalAlpha = (0.35 + Math.sin(t * 0.002 + s.t) * 0.3) * s.z;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, s.z * 1.6, s.z * 1.6);
    }
    ctx.globalAlpha = 1;

    const cx = W / 2 + mouse.x * -30, cy = H / 2 + mouse.y * -30;
    const R = Math.min(W, H) * 0.62;
    const tilt = 0.38;

    // Baner
    ctx.lineWidth = 1;
    for (const ring of [0.5, 0.72, 0.94]) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * ring, R * ring * tilt, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const pos = planets.map((p) => {
      p.angle += p.speed * (reduceMotion ? 0 : 16);
      const ex = Math.cos(p.angle) * R * p.ring, ey = Math.sin(p.angle) * R * p.ring * tilt;
      const rot = -0.2;
      return { p, x: cx + ex * Math.cos(rot) - ey * Math.sin(rot), y: cy + ex * Math.sin(rot) + ey * Math.cos(rot), depth: Math.sin(p.angle) };
    });

    // Forbindelser mellem nære planeter
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
        if (d < 220) {
          ctx.strokeStyle = `rgba(160,140,255,${(1 - d / 220) * 0.25})`;
          ctx.beginPath(); ctx.moveTo(pos[i].x, pos[i].y); ctx.lineTo(pos[j].x, pos[j].y); ctx.stroke();
        }
      }

    pos.sort((a, b) => a.depth - b.depth);
    ctx.font = "500 12px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    for (const { p, x, y, depth } of pos) {
      const scale = 0.75 + (depth + 1) * 0.25;
      const r = p.size * scale;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
      g.addColorStop(0, p.color + "aa");
      g.addColorStop(1, p.color + "00");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.online ? "#fff" : p.color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (W > 700) {
        ctx.fillStyle = `rgba(243,241,255,${0.25 + (depth + 1) * 0.25})`;
        ctx.fillText(p.label, x, y - r - 12);
      }
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Kort ----------
function tilt(card) {
  const link = $(".card-link", card);
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    link.style.setProperty("--ry", `${(px - 0.5) * 10}deg`);
    link.style.setProperty("--rx", `${(0.5 - py) * 8}deg`);
    link.style.setProperty("--gx", `${px * 100}%`);
    link.style.setProperty("--gy", `${py * 100}%`);
  });
  card.addEventListener("pointerleave", () => { link.style.setProperty("--rx", "0deg"); link.style.setProperty("--ry", "0deg"); });
}

function siteCard(site, i) {
  const node = $("#site-card").content.firstElementChild.cloneNode(true);
  const state = site.probe?.state ?? "offline";
  node.style.setProperty("--accent", site.accent || langColor(site.language));
  node.style.setProperty("--d", `${(i % 3) * 90}ms`);
  if (site.featured) node.classList.add("featured");
  if (state !== "online") node.classList.add("down");

  const link = $(".card-link", node);
  link.href = site.url;
  $(".browser-url", node).textContent = host(site.url);
  $(".shot-fallback span", node).textContent = initials(site.title);
  if (site.shot) {
    const img = $("img", node);
    img.src = site.shot;
    img.alt = `Skærmbillede af ${site.title}`;
    img.addEventListener("load", () => node.classList.add("has-shot"));
  }
  const status = $(".status", node);
  status.classList.add(state);
  status.textContent = STATUS_TEXT[state] ?? state;
  const lang = $(".lang", node);
  if (site.language) { lang.textContent = site.language; lang.style.setProperty("--lc", langColor(site.language)); } else lang.remove();
  $("h3", node).textContent = site.title;
  $(".tagline", node).textContent = site.tagline || site.probe?.pageTitle || "";

  const repo = $(".repo-link", node);
  if (site.repoUrl) repo.href = site.repoUrl; else repo.remove();
  if (!reduceMotion && matchMedia("(hover: hover)").matches) tilt(node);
  return node;
}

function projectCard(site, i) {
  const a = document.createElement("a");
  a.className = "project reveal";
  a.href = site.repoUrl || site.url;
  a.target = "_blank";
  a.rel = "noopener";
  a.dataset.lang = site.language || "Andet";
  a.style.setProperty("--lc", langColor(site.language));
  a.style.setProperty("--d", `${(i % 4) * 70}ms`);
  a.innerHTML = `<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg><h3></h3><p></p><footer><span class="lang"></span><span class="when"></span></footer>`;
  $("h3", a).textContent = site.title;
  $("p", a).textContent = site.tagline || "Et projekt fra værkstedet.";
  const lang = $(".lang", a);
  lang.textContent = site.language || "Andet";
  lang.style.setProperty("--lc", langColor(site.language));
  $(".when", a).textContent = site.pushedAt ? `opdateret ${relative(site.pushedAt)}` : "";
  return a;
}

function spectrum(langs) {
  const total = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!total) { $("#spectrum").remove(); return; }
  const entries = Object.entries(langs).sort((a, b) => b[1] - a[1]);
  const main = entries.filter(([, v]) => v / total >= 0.01);
  const rest = entries.filter(([, v]) => v / total < 0.01).reduce((s, [, v]) => s + v, 0);
  if (rest) main.push(["Andet", rest]);
  const bar = $("#spectrum-bar"), legend = $("#spectrum-legend");
  main.forEach(([lang, bytes], i) => {
    const pct = (bytes / total) * 100;
    const s = document.createElement("span");
    s.style.setProperty("--c", lang === "Andet" ? "#4a4666" : langColor(lang));
    s.style.setProperty("--d", `${i * 80}ms`);
    s.dataset.w = pct;
    s.title = `${lang} ${pct.toFixed(1)} %`;
    bar.append(s);
    const li = document.createElement("li");
    li.style.setProperty("--c", lang === "Andet" ? "#4a4666" : langColor(lang));
    li.innerHTML = `<span></span> <b></b>`;
    li.firstChild.textContent = lang;
    li.lastChild.textContent = `${pct.toFixed(1)} %`;
    legend.append(li);
  });
  new IntersectionObserver(([e], obs) => {
    if (!e.isIntersecting) return;
    bar.querySelectorAll("span").forEach((s) => (s.style.width = `${s.dataset.w}%`));
    obs.disconnect();
  }, { threshold: 0.4 }).observe(bar);
}

function filters(projects) {
  const box = $("#filters");
  const langs = [...new Set(projects.map((p) => p.language || "Andet"))];
  if (langs.length < 2) { box.remove(); return; }
  for (const l of ["Alle", ...langs]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = l;
    b.setAttribute("aria-pressed", l === "Alle");
    b.addEventListener("click", () => {
      box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      document.querySelectorAll(".project").forEach((p) => p.classList.toggle("hide", l !== "Alle" && p.dataset.lang !== l));
    });
    box.append(b);
  }
}

// ---------- Start ----------
async function main() {
  let data;
  try {
    data = await (await fetch("data/sites.json", { cache: "no-cache" })).json();
  } catch {
    data = { sites: [], stats: { repos: 0, online: 0, languages: {}, firstYear: new Date().getFullYear() } };
  }

  const sites = data.sites.filter((s) => s.url && ["online", "fejl", "parkeret"].includes(s.probe?.state));
  const projects = data.sites.filter((s) => !sites.includes(s) && s.repoUrl);

  $("#live-count").textContent = data.stats.online;
  countUp($('[data-count="online"]'), data.stats.online);
  countUp($('[data-count="repos"]'), data.stats.repos);
  countUp($('[data-count="langs"]'), Object.keys(data.stats.languages).length);
  countUp($('[data-count="since"]'), data.stats.firstYear);
  $("#updated").textContent = relative(data.generatedAt);
  $("#updated").dateTime = data.generatedAt;
  $("#updated").title = new Date(data.generatedAt).toLocaleString("da-DK");

  const grid = $("#site-grid");
  sites.forEach((s, i) => grid.append(siteCard(s, i)));

  const pgrid = $("#project-grid");
  projects.forEach((s, i) => pgrid.append(projectCard(s, i)));
  if (!projects.length) $("#projekter").remove();
  filters(projects);
  spectrum(data.stats.languages);

  const marquee = $("#marquee");
  const names = data.sites.map((s) => s.title);
  for (let k = 0; k < 2; k++) names.forEach((n) => { const s = document.createElement("span"); s.textContent = n; marquee.append(s, Object.assign(document.createElement("i"), { textContent: "✦" })); });

  typer(sites.filter((s) => s.probe?.state === "online").map((s) => host(s.url)).concat("ting til nettet"));
  cosmos(data.sites.filter((s) => s.url || s.featured).slice(0, 14));
  observe();
}

main();
