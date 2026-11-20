import fs from "node:fs";
import path from "node:path";
import license from "rollup-plugin-license";
import typescript from "@rollup/plugin-typescript";

const packageJSONText = fs.readFileSync(
  path.join(import.meta.dirname, "package.json"),
  "utf-8",
);
const packageJSON = JSON.parse(packageJSONText);

const commonExternal = [
  "@turbowarp/jszip",
  "@turbowarp/json",
  "undici",
  "fs",
  "path",
  "os",
  "node:crypto",
  "node:fs",
  "node:fs/promises",
  "node:path",
];

const cliHeaderPlugin = license({
  banner: {
    commentStyle: "none",
    content: `#!/usr/bin/env node\n/*!\n * sc-dlp v${packageJSON.version} <https://github.com/rbstxt/sc-dlp>\n *\n * ${fs.readFileSync("LICENSE", "utf-8").replace(/\n/g, "\n * ")}\n */`,
  },
});

const tsPlugin = () =>
  typescript({
    declaration: false,
    declarationDir: undefined,
  });

export default [
  {
    // For Node.js (CJS & ESM)
    input: "src/export-node.ts",
    output: [
      {
        file: "lib/bundle-node.cjs",
        format: "cjs",
      },
      {
        file: "lib/bundle-node.mjs",
        format: "es",
      },
    ],
    external: commonExternal,
    plugins: [tsPlugin()],
  },
  {
    // CLI for Node.js
    input: "src/cli.ts",
    output: {
      file: "lib/cli.cjs",
      format: "cjs",
    },
    external: [
      ...commonExternal,
      "kleur",
      "cli-progress",
      "prompts",
      "pako",
    ],
    plugins: [tsPlugin(), cliHeaderPlugin],
  },
];
