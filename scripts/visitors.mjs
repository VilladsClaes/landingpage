// Byggesten til besøgstælleren:
// - geoDatabase(): henter DB-IP's gratis landedatabase (CC BY 4.0) og pakker IPv4-delen
//   til en lille binær fil, som api/besog.ashx slår op i. Så forlader de besøgendes
//   IP-adresser aldrig serveren.
// - worldMap(): tegner verdenskortet som SVG-stier (Natural Earth-projektion), så siden
//   ikke skal hente kortdata eller biblioteker fra andre domæner.
import { mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);

export async function geoDatabase(dist) {
  const now = new Date();
  const months = [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    return d.toISOString().slice(0, 7);
  });

  let csv;
  for (const month of months) {
    const res = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`);
    if (res.ok) {
      csv = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
      console.log(`  🌍 DB-IP landedatabase ${month}`);
      break;
    }
  }
  // Uden databasen ville udgivelsen slette den gamle på serveren, så stop hellere her
  if (!csv) throw new Error("Kunne ikke hente DB-IP's landedatabase");

  const ipToInt = (ip) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
  const starts = [];
  const codes = [];
  let lastEnd = -1;
  for (const line of csv.split("\n")) {
    const [from, to, country] = line.trim().split(",");
    if (!from || from.includes(":")) continue; // kun IPv4 – domænet har ingen IPv6-adresse
    const start = ipToInt(from);
    const end = ipToInt(to);
    if (start > lastEnd + 1) { starts.push(lastEnd + 1); codes.push("--"); }
    if (codes.at(-1) !== country) { starts.push(start); codes.push(country); }
    lastEnd = end;
  }

  const table = [...new Set(codes)];
  if (table.length > 255) throw new Error("For mange landekoder til én byte");
  const n = starts.length;
  const buf = Buffer.alloc(4 + 4 + 1 + table.length * 2 + n * 4 + n);
  let o = buf.write("GEO1", 0, "ascii");
  o = buf.writeInt32LE(n, o);
  o = buf.writeUInt8(table.length, o);
  for (const code of table) o += buf.write(code.padEnd(2, "-").slice(0, 2), o, "ascii");
  for (const s of starts) o = buf.writeUInt32LE(s, o);
  for (const c of codes) o = buf.writeUInt8(table.indexOf(c), o);

  await mkdir(path.join(dist, "App_Data"), { recursive: true });
  await writeFile(path.join(dist, "App_Data", "geo.bin"), buf);
  console.log(`  🌍 ${n.toLocaleString("da-DK")} IP-intervaller, ${table.length} lande (${(buf.length / 1e6).toFixed(1)} MB)`);
}

export async function worldMap(dist) {
  const countries = require("i18n-iso-countries");
  const topo = require("world-atlas/countries-110m.json");
  const byName = { Kosovo: "XK", "N. Cyprus": "CY", Somaliland: "SO" };

  const features = feature(topo, topo.objects.countries).features.filter((f) => f.properties.name !== "Antarctica");
  const width = 1000;
  const height = 520;
  const projection = geoNaturalEarth1().fitSize([width, height], { type: "FeatureCollection", features });
  const draw = geoPath(projection).digits(1);

  const shapes = features.map((f) => {
    const code = (f.id && countries.numericToAlpha2(f.id)) || byName[f.properties.name] || null;
    const [x, y] = draw.centroid(f);
    return { c: code, d: draw(f), x: Math.round(x), y: Math.round(y) };
  });

  const map = { w: width, h: height, grid: draw(geoGraticule10()), countries: shapes };
  await mkdir(path.join(dist, "data"), { recursive: true });
  await writeFile(path.join(dist, "data", "world.json"), JSON.stringify(map));
  console.log(`  🗺  Verdenskort med ${shapes.length} lande`);
}
