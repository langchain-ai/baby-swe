#!/usr/bin/env node

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isCI = process.env.CI === "true";
const isElectronBuilder = process.env.npm_lifecycle_script?.includes("electron-builder");
const isGlobalInstall = process.env.npm_config_global === "true" || 
  process.env.npm_config_prefix?.includes("nvm") ||
  !__dirname.includes("node_modules");

if (isCI && !isElectronBuilder) {
  console.log("Skipping postinstall in CI (electron-builder handles native modules)");
  process.exit(0);
}

const packageDir = path.join(__dirname, "..");

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
      cwd: packageDir,
    });
  } catch (error) {
    console.error("Failed to install electron:", error.message);
    process.exit(1);
  }
}

console.log("Rebuilding native modules for Electron...");

const rebuildCommands = [
  "npx --yes @electron/rebuild@3.7.0",
  "npx --yes electron-rebuild"
];

let rebuildSuccess = false;

for (const cmd of rebuildCommands) {
  try {
    execSync(cmd, {
      stdio: "inherit",
      cwd: packageDir,
      timeout: 300000,
    });
    console.log("Native modules rebuilt successfully");
    rebuildSuccess = true;
    break;
  } catch (error) {
    continue;
  }
}

if (!rebuildSuccess) {
  if (isGlobalInstall) {
    console.log("\n⚠️  Could not rebuild native modules during global install.");
    console.log("   This is expected. Please run the following after installation:\n");
    console.log("   cd $(npm root -g)/baby-swe && npx @electron/rebuild\n");
    process.exit(0);
  } else {
    console.error("Failed to rebuild native modules.");
    console.error("Try running 'npx @electron/rebuild' manually after installation.");
    process.exit(1);
  }
}
