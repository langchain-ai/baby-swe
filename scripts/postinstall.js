#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");

const isCI = process.env.CI === "true";
const isElectronBuilder = process.env.npm_lifecycle_script?.includes("electron-builder");

if (isCI && !isElectronBuilder) {
  console.log("Skipping postinstall in CI (electron-builder handles native modules)");
  process.exit(0);
}

let electronInstalled = false;
try {
  require.resolve("electron");
  electronInstalled = true;
} catch {
  electronInstalled = false;
}

if (!electronInstalled) {
  console.log("Installing electron for npm distribution...");
  try {
    execSync("npm install electron@^28.0.0 --no-save", {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
  } catch (error) {
    console.error("Failed to install electron:", error.message);
    process.exit(1);
  }
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
