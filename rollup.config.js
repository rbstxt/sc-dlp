import fs from "node:fs";
import path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import license from "rollup-plugin-license";
import typescript from "@rollup/plugin-typescript";

const packageJSONText = fs.readFileSync(
  path.join(import.meta.dirname, "package.json"),
  "utf-8",
);
const packageJSON = JSON.parse(packageJSONText);

const external = ["@turbowarp/jszip", "@turbowarp/json"];

const headerPlugin = license({
  banner: {
    commentStyle: "ignored",
    content: `/*!\n * SBDL v${packageJSON.version} <https://github.com/forkphorus/sb-downloader>\n *\n * ${fs.readFileSync("LICENSE", "utf-8").replace(/\n/g, "\n * ")}\n */`,
  },
});

const cliHeaderPlugin = license({
  banner: {
    commentStyle: "none",
    content: `#!/usr/bin/env node\n/*!\n * SBDL v${packageJSON.version} <https://github.com/forkphorus/sb-downloader>\n *\n * ${fs.readFileSync("LICENSE", "utf-8").replace(/\n/g, "\n * ")}\n */`,
  },
});

export default [
  {
    // For Node.js
    input: "src/export-node.ts",
    output: {
      file: "lib/bundle-node.cjs",
      format: "cjs",
    },
    external,
    plugins: [typescript()],
  },
  {
    // CLI for Node.js
    input: "src/cli.ts",
    output: {
      file: "lib/cli.cjs",
      format: "cjs",
    },
    external: [
      ...external,
      "node:fs",
      "node:fs/promises",
      "node:path",
      "kleur",
      "cli-progress",
    ],
    plugins: [typescript(), cliHeaderPlugin],
  },
];
