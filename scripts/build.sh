#!/bin/bash
set -eu
cd "$(dirname "$0")/.."
out="${SIDEASK_BUILD_DIR:-build}"
app="$out/SideAsk.app/Contents"
target="$(uname -m)-apple-macosx26.0"
mkdir -p "$app/MacOS" "$app/Resources" "$out/module-cache"
swiftc -target "$target" -O -module-cache-path "$out/module-cache" macOS/main.swift -o "$app/MacOS/SideAsk"
swiftc -target "$target" -O -module-cache-path "$out/module-cache" macOS/pdf_sections.swift -o "$app/Resources/pdf-sections"
cp macOS/library.css macOS/library.html macOS/library.js macOS/import-form.js macOS/console.css macOS/list-view.js macOS/reading.css macOS/reader.html macOS/codex_chat.py macOS/materials.py macOS/native.js macOS/探索.js "$app/Resources/"
cp -R macOS/vendor/. "$app/Resources/"
cp LICENSE THIRD_PARTY_NOTICES.md "$app/Resources/"
cp macOS/Assets/SideAsk.icns "$app/Resources/"
sips -z 204 204 macOS/Assets/SideAsk.png --out "$app/Resources/SideAsk-header.png" >/dev/null
cat > "$app/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>local.sideask.reader</string>
<key>CFBundleExecutable</key><string>SideAsk</string>
<key>CFBundleName</key><string>SideAsk</string>
<key>CFBundleIconFile</key><string>SideAsk.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>LSMinimumSystemVersion</key><string>26.0</string>
<key>CFBundleVersion</key><string>1</string>
</dict></plist>
PLIST
rm -f "$app/Resources/source.html" "$app/Resources/source.js"
codesign --force --sign - "$out/SideAsk.app"
