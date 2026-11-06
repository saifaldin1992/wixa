// Bundles and minifies the front end into public/build/ (run automatically before every deploy and `wrangler dev`).
// Source stays split into small modules (public/js/site/*, public/admin/js/*); visitors download one small file each.
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const out = "public/build";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, minify: true, charset: "utf8", target: ["es2020", "safari14"], legalComments: "none", logLevel: "warning" };

await Promise.all([
  // site + dashboard scripts: one ES module each
  build({ ...common, entryPoints: { site: "public/js/main.js", admin: "public/admin/admin.js", tags: "public/js/tags.js" }, outdir: out, format: "esm" }),
  // shared helpers stay a classic script (loaded before the modules, also used by the inline theme logic)
  build({ ...common, bundle: false, entryPoints: { shared: "public/shared.js" }, outdir: out }),
  // stylesheets
  build({ ...common, entryPoints: { site: "public/styles.css", admin: "public/admin/admin.css" }, outdir: out, loader: { ".css": "css" } }),
]);
// which commit this build is (shown on the dashboard's Connections page). Workers Builds provides
// WORKERS_CI_COMMIT_SHA / WORKERS_CI_BRANCH; locally we ask git.
const git = (c) => { try { return execSync(`git ${c}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const commit = process.env.WORKERS_CI_COMMIT_SHA || git("rev-parse HEAD");
writeFileSync(`${out}/version.json`, JSON.stringify({
  commit, branch: process.env.WORKERS_CI_BRANCH || git("rev-parse --abbrev-ref HEAD"),
  message: git(`log -1 --format=%s ${commit}`).slice(0, 90), built_at: new Date().toISOString(),
}));
console.log("front end built → public/build/");
