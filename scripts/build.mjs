// Bundles and minifies the front end into public/build/ (run automatically before every deploy and `wrangler dev`).
// Source stays split into small modules (public/js/site/*, public/admin/js/*); visitors download one small file each.
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";

const out = "public/build";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, minify: true, charset: "utf8", target: ["es2020", "safari14"], legalComments: "none", logLevel: "warning" };

await Promise.all([
  // site + dashboard scripts: one ES module each
  build({ ...common, entryPoints: { site: "public/js/main.js", admin: "public/admin/admin.js" }, outdir: out, format: "esm" }),
  // shared helpers stay a classic script (loaded before the modules, also used by the inline theme logic)
  build({ ...common, bundle: false, entryPoints: { shared: "public/shared.js" }, outdir: out }),
  // stylesheets
  build({ ...common, entryPoints: { site: "public/styles.css", admin: "public/admin/admin.css" }, outdir: out, loader: { ".css": "css" } }),
]);
console.log("front end built → public/build/");
