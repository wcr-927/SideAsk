#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -m)" != arm64 ]]; then
  echo 'Apple Silicon is required to build this disk image.' >&2
  exit 1
fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
SIDEASK_BUILD_DIR="$work/build" ./scripts/build.sh
mkdir "$work/image"
ditto "$work/build/SideAsk.app" "$work/image/SideAsk.app"
ln -s /Applications "$work/image/Applications"
hdiutil create -ov -format UDZO -fs HFS+ -volname SideAsk -srcfolder "$work/image" "$work/SideAsk.dmg"
hdiutil verify "$work/SideAsk.dmg"
mkdir -p build
mv -f "$work/SideAsk.dmg" build/SideAsk-AppleSilicon.dmg
