#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const platform = process.platform;
const arch = process.arch;
const prebuildsDir = path.join(__dirname, "..", "prebuilds");
const targetDir = path.join(prebuildsDir, `${platform}-${arch}`);

console.log(`Building prebuilds for ${platform}-${arch}...`);

fs.mkdirSync(targetDir, { recursive: true });

const nodePtyBuildDir = path.join(
  __dirname,
  "..",
  "node_modules",
  "node-pty",
  "build",
  "Release"
);

if (!fs.existsSync(nodePtyBuildDir)) {
  console.log("node-pty not built yet, running electron-rebuild...");
  execSync("npx @electron/rebuild", {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });
}

const filesToCopy = ["pty.node", "spawn-helper"];

if (platform === "win32") {
  filesToCopy.push("winpty-agent.exe", "winpty.dll");
  filesToCopy[0] = "pty.node";
}

for (const file of filesToCopy) {
  const src = path.join(nodePtyBuildDir, file);
  const dest = path.join(targetDir, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file}`);
  } else {
    console.log(`  Skipped ${file} (not found)`);
  }
}

console.log(`Prebuilds saved to ${targetDir}`);
