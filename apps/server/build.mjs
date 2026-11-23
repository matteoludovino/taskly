// Bundles the server into dist/server.js. Workspace code (@taskly/shared, the generated Prisma client)
// is inlined; installed packages stay external and come from node_modules at runtime.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(dependencies).filter((name) => !name.startsWith("@taskly/"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Subpath imports too (y-protocols/sync, lib0/encoding…): one copy of each package, from node_modules.
  external: [...external, ...external.map((name) => `${name}/*`)],
  // ESM output: give bundled CommonJS helpers a require().
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});
