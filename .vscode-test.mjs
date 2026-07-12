import { defineConfig } from "@vscode/test-cli";

export default defineConfig({
  files: "out/test/integration/**/*.test.js",
  version: "stable",
  workspaceFolder: "./test/fixtures/gh-workspace",
  mocha: {
    ui: "bdd",
    timeout: 60000,
  },
});
