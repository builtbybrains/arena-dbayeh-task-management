// Lists t("…") keys used in src/ that have no Arabic translation yet.
// Usage: node scripts/check-arabic.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|mjs)$/.test(n) && !p.includes(`${join("src", "lib", "ar")}`)) files.push(p);
  }
};
walk("src");

const keys = new Map();
const re = /\b(?:t|tr)\(\s*("(?:[^"\\]|\\.)*")/g;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    const k = JSON.parse(m[1]);
    if (!keys.has(k)) keys.set(k, f);
  }
}

const dict = new Set();
const ar = join("src", "lib", "ar");
for (const n of readdirSync(ar)) {
  const src = readFileSync(join(ar, n), "utf8");
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:/gm)) dict.add(JSON.parse(m[1]));
  for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) dict.add(m[1]);
}

const missing = [...keys].filter(([k]) => !dict.has(k));
for (const [k, f] of missing) console.log(`${f}: ${JSON.stringify(k)}`);
console.log(`\n${keys.size} keys used, ${dict.size} translated, ${missing.length} missing`);
