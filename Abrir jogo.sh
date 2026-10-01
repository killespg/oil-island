#!/usr/bin/env bash
# Launch a dedicated Chrome instance so an existing browser cannot reuse its
# compositor-selected integrated GPU. No global driver/browser setting changes.
set -eu
neon_game_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
neon_browser=''
for neon_candidate in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$neon_candidate" >/dev/null 2>&1; then
    neon_browser="$(command -v "$neon_candidate")"
    break
  fi
done
if [ -z "$neon_browser" ]; then
  printf '%s\n' 'Chrome/Chromium não encontrado. Abra index.html em um navegador com WebGL.' >&2
  exit 1
fi
neon_gpu_args=()
for neon_node in /sys/class/drm/renderD*; do
  [ -r "$neon_node/device/vendor" ] && [ -r "$neon_node/device/device" ] || continue
  neon_vendor="$(cat "$neon_node/device/vendor")"
  neon_device="$(cat "$neon_node/device/device")"
  # AMD Navi 33: RX 7600 family. Use stable PCI identity for Mesa selection,
  # and discover the current render-node number instead of hardcoding 128.
  if [ "$neon_vendor" = '0x1002' ] && [ "$neon_device" = '0x7480' ]; then
    neon_render_node="/dev/dri/$(basename -- "$neon_node")"
    [ -r "$neon_render_node" ] && [ -w "$neon_render_node" ] || continue
    neon_pci="$(basename -- "$(readlink -f -- "$neon_node/device")")"
    export DRI_PRIME="pci-${neon_pci//[.:]/_}"
    neon_gpu_args=("--render-node-override=$neon_render_node")
    printf 'NEON CLASH: RX 7600 / %s\n' "$neon_render_node"
    break
  fi
done
# Keep this game's browser separate, without loading the user's personal profile.
neon_profile="${XDG_CACHE_HOME:-${HOME}/.cache}/neon-clash-browser"
mkdir -p -- "$neon_profile"
if command -v python3 >/dev/null 2>&1; then
  neon_url="$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).resolve().as_uri())' "$neon_game_dir/index.html")"
else
  neon_url="file://$neon_game_dir/index.html"
fi
exec "$neon_browser" "--user-data-dir=$neon_profile" "${neon_gpu_args[@]}" \
  --no-first-run --no-default-browser-check "--app=$neon_url"
