# Baby SWE

A desktop AI coding assistant built with Electron, React, and TypeScript.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)
- macOS, Windows, or Linux

## Getting Started

### Install Dependencies

```bash
bun install
```

### Development

Run the app in development mode with hot reloading:

```bash
bun run dev
```

### Build

Compile TypeScript and bundle the app:

```bash
bun run build
```

## Building Installers

### Quick Build (Current Platform)

```bash
# Build and package for your current platform
bun run dist
```

### Platform-Specific Builds

```bash
# macOS (.dmg and .zip)
bun run dist:mac

# Windows (.exe installer)
bun run dist:win

# Linux (.AppImage and .deb)
bun run dist:linux
```

### Manual DMG Creation (macOS)

If `electron-builder` fails to create a DMG (known issue with some macOS versions), you can create one manually:

```bash
# 1. First, build the app bundle
bun run build
bun run pack

# 2. Create a temporary DMG folder
mkdir -p release/dmg
cp -R "release/mac-arm64/Baby SWE.app" release/dmg/

# 3. Create the DMG using hdiutil
hdiutil create -volname "Baby SWE" \
  -srcfolder release/dmg \
  -ov -format UDZO \
  "release/Baby SWE-1.0.0-arm64.dmg"

# 4. Clean up
rm -rf release/dmg
```

### Build Output

After building, installers are placed in the `release/` directory:

| Platform | File | Description |
|----------|------|-------------|
| macOS | `Baby SWE-x.x.x-arm64.dmg` | DMG installer |
| macOS | `Baby SWE-x.x.x-arm64-mac.zip` | ZIP archive |
| Windows | `Baby SWE Setup x.x.x.exe` | NSIS installer |
| Linux | `Baby SWE-x.x.x.AppImage` | AppImage |
| Linux | `baby-swe_x.x.x_amd64.deb` | Debian package |

## Installation Notes

### macOS

The app is signed ad-hoc (not notarized with Apple). On first launch:

1. Right-click the app and select **Open**, or
2. Go to **System Preferences → Security & Privacy** and click **Open Anyway**

### Code Signing (Optional)

For distribution, you should sign and notarize the app:

```bash
# Set environment variables for signing
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
export APPLE_ID=your-apple-id
export APPLE_APP_SPECIFIC_PASSWORD=your-app-specific-password

# Build with signing
bun run dist:mac
```

## Project Structure

```
baby-swe/
├── src/
│   ├── main.ts          # Electron main process
│   ├── preload.ts       # Preload script
│   ├── agent.ts         # AI agent logic
│   ├── backends/        # Sandbox backends
│   ├── commands/        # Command handlers
│   ├── memory/          # Memory/context management
│   ├── styles/          # CSS styles
│   └── ui/              # React UI components
├── dist/                # Compiled output
├── release/             # Built installers
└── package.json
```

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start in development mode |
| `bun run build` | Compile TypeScript and bundle |
| `bun run pack` | Build unpacked app (for testing) |
| `bun run dist` | Build installer for current platform |
| `bun run dist:mac` | Build macOS installer |
| `bun run dist:win` | Build Windows installer |
| `bun run dist:linux` | Build Linux installer |

## License

MIT
