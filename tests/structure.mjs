// Server code structure rules (src/):
//  1. layers: lib/ → services/ → jobs/ → routes/ → index.js. A file imports only from its own layer or the ones before
//     it (lib/ never imports services/, services/ never imports routes/, nothing imports index.js). Jobs sit below
//     routes because a dashboard button may start one (send a backup now) as well as the timer;
//  2. no import cycles, even inside one layer;
//  3. every relative import points at a file that exists.
// Usage: node tests/structure.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative, normalize } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;
const LAYER = { lib: 0, services: 1, jobs: 2, routes: 3, "": 4 }; // "" = src/index.js
const files = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".js") && files.push(join(d, e.name))));
walk(ROOT);

const layerOf = (f) => { const top = relative(ROOT, f).split("/"); return top.length > 1 ? top[0] : ""; };
const problems = [];
const graph = {};
for (const f of files) {
  const name = relative(ROOT, f);
  graph[name] = [];
  if (!(layerOf(f) in LAYER)) problems.push(`${name}: unknown folder «${layerOf(f)}» (use lib/, services/, jobs/ or routes/)`);
  for (const m of readFileSync(f, "utf8").matchAll(/^\s*import\s+(?:[^"']*?from\s+)?["'](\.[^"']+)["']/gm)) {
    const target = normalize(join(dirname(f), m[1]));
    if (!existsSync(target)) { problems.push(`${name}: imports missing file ${m[1]}`); continue; }
    if (!target.startsWith(ROOT)) continue; // public/ modules shared with the browser
    const t = relative(ROOT, target);
    graph[name].push(t);
    if (t === "index.js") problems.push(`${name}: must not import index.js`);
    else if (LAYER[layerOf(target)] > LAYER[layerOf(f)]) problems.push(`${name} (${layerOf(f) || "index"}) imports ${t} from a higher layer (${layerOf(target)})`);
  }
}
const done = new Set(), path = [];
const visit = (n) => {
  if (path.includes(n)) { problems.push(`import cycle: ${[...path.slice(path.indexOf(n)), n].join(" → ")}`); return; }
  if (done.has(n)) return;
  path.push(n); (graph[n] || []).forEach(visit); path.pop(); done.add(n);
};
Object.keys(graph).forEach(visit);

for (const p of problems) console.log("✗ " + p);
console.log(problems.length ? `${problems.length} structure problem(s)` : `✓ server structure: ${files.length} files, layers respected, no import cycles`);
process.exit(problems.length ? 1 : 0);
