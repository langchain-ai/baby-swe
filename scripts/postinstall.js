#!/usr/bin/env node

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const isCI = process.env.CI === "true";
const isElectronBuilder =
  process.env.npm_lifecycle_script?.includes("electron-builder");

if (isCI && !isElectronBuilder) {
  console.log(
    "Skipping postinstall in CI (electron-builder handles native modules)"
  );
  process.exit(0);
}

const packageDir = path.join(__dirname, "..");
const platform = process.platform;
const arch = process.arch;

const nodePtyBuildDir = path.join(
  packageDir,
  "node_modules",
  "node-pty",
  "build",
  "Release"
);

function verifyNodePty() {
  const spawnHelperName = platform === "win32" ? "winpty-agent.exe" : "spawn-helper";
  const spawnHelperPath = path.join(nodePtyBuildDir, spawnHelperName);
  const ptyNodePath = path.join(nodePtyBuildDir, "pty.node");
  return fs.existsSync(spawnHelperPath) && fs.existsSync(ptyNodePath);
}

function installPrebuilds() {
  const prebuildsDir = path.join(packageDir, "prebuilds", `${platform}-${arch}`);

  if (!fs.existsSync(prebuildsDir)) {
    console.log(`No prebuilds found for ${platform}-${arch}`);
    return false;
  }

  console.log(`Installing prebuilt binaries for ${platform}-${arch}...`);

  fs.mkdirSync(nodePtyBuildDir, { recursive: true });

  const files = fs.readdirSync(prebuildsDir);
  for (const file of files) {
    const src = path.join(prebuildsDir, file);
    const dest = path.join(nodePtyBuildDir, file);
    fs.copyFileSync(src, dest);
    if (platform !== "win32") {
      fs.chmodSync(dest, 0o755);
    }
    console.log(`  Installed ${file}`);
  }

  return verifyNodePty();
}

if (installPrebuilds()) {
  console.log("Native modules installed from prebuilds successfully");
  process.exit(0);
}

console.log("Prebuilds not available, attempting to rebuild native modules...");

let electronPath = null;
try {
  electronPath = require.resolve("electron");
} catch {
  electronPath = null;
}

if (!electronPath) {
  console.log("Installing electron for npm/cli distribution...");
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

function tryRebuild() {
  const rebuildCommands = [
    { cmd: "npx", args: ["--yes", "@electron/rebuild@3.7.0"] },
    { cmd: "npx", args: ["--yes", "electron-rebuild"] },
  ];

  for (const { cmd, args } of rebuildCommands) {
    try {
      const result = spawnSync(cmd, args, {
        stdio: "inherit",
        cwd: packageDir,
        timeout: 300000,
        shell: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });

      if (result.status === 0) {
        return true;
      }
    } catch (error) {
      continue;
    }
  }
  return false;
}

let rebuildSuccess = tryRebuild();

if (rebuildSuccess && !verifyNodePty()) {
  console.log(
    "Rebuild completed but spawn-helper not found, trying again with explicit module..."
  );
  try {
    execSync("npx --yes @electron/rebuild -m node_modules/node-pty", {
      stdio: "inherit",
      cwd: packageDir,
      timeout: 300000,
    });
    rebuildSuccess = verifyNodePty();
  } catch {
    rebuildSuccess = false;
  }
}

if (rebuildSuccess && verifyNodePty()) {
  console.log("Native modules rebuilt successfully");
  process.exit(0);
}

console.error("Failed to install native modules.");
console.error(
  "Please report this issue at: https://github.com/langchain-ai/baby-swe/issues"
);
console.error(`Platform: ${platform}, Arch: ${arch}`);
process.exit(1);
