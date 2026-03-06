#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");

const isGlobalInstall =
  process.env.npm_config_global === "true" ||
  (process.env.npm_lifecycle_event === "postinstall" &&
    !process.cwd().includes("node_modules"));

if (!isGlobalInstall && process.env.CI) {
  console.log("Skipping postinstall rebuild in CI environment");
  process.exit(0);
}

console.log("Rebuilding native modules for Electron...");

try {
  execSync("npx @electron/rebuild", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
  console.log("Native modules rebuilt successfully");
} catch (error) {
  console.error("Failed to rebuild native modules:", error.message);
  console.error(
    "You may need to run 'npx @electron/rebuild' manually after installation"
  );
  process.exit(1);
}
