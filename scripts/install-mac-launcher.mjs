// Install a Finder/Dock launcher for this development checkout.
import { mkdir, writeFile, copyFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") throw new Error("This launcher is for macOS.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electron = join(root, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
await access(electron);
const bundle = join(homedir(), "Applications", "Jev Studio.app");
const contents = join(bundle, "Contents");
await mkdir(join(contents, "MacOS"), { recursive: true });
await mkdir(join(contents, "Resources"), { recursive: true });
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(join(contents, "MacOS", "JevStudio"), `#!/bin/sh
unset ELECTRON_RUN_AS_NODE
unset ENGINE_SMOKE_TEST
unset GAME_VAULT
mkdir -p "$HOME/Library/Logs/Jev Studio"
cd ${quote(root)} || exit 1
if [ ! -x ${quote(electron)} ]; then
  /usr/bin/osascript -e 'display alert "Jev Studio could not start" message "The Electron runtime is missing from the project. Reinstall the project dependencies."'
  exit 1
fi
exec ${quote(electron)} ${quote(join(root, "desktop/main.mjs"))} >> "$HOME/Library/Logs/Jev Studio/app.log" 2>&1
`, { mode: 0o755 });
await copyFile(join(root, "node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns"), join(contents, "Resources", "JevStudio.icns"));
await writeFile(join(contents, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Jev Studio</string>
<key>CFBundleDisplayName</key><string>Jev Studio</string>
<key>CFBundleIdentifier</key><string>local.jev.studio.launcher</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>JevStudio</string>
<key>CFBundleIconFile</key><string>JevStudio.icns</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`);
console.log(`Installed ${bundle}`);
