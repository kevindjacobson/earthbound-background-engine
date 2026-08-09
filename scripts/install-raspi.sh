#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
node_path=$(command -v node || true)

if [ -z "$node_path" ]; then
  echo "Node 20 or newer is required" >&2
  exit 1
fi

node_major=$($node_path -p 'Number(process.versions.node.split(".")[0])')
if [ "$node_major" -lt 20 ]; then
  echo "Node 20 or newer is required; found $($node_path --version)" >&2
  exit 1
fi

service_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/systemd/user
autostart_dir=${XDG_CONFIG_HOME:-"$HOME/.config"}/autostart
mkdir -p "$service_dir" "$autostart_dir"

sed \
  -e "s|@REPO_DIR@|$repo_dir|g" \
  -e "s|@NODE_PATH@|$node_path|g" \
  "$repo_dir/deploy/earthbound-background-engine.service.template" \
  > "$service_dir/earthbound-background-engine.service"

sed \
  -e "s|@KIOSK_SCRIPT@|$repo_dir/scripts/start-kiosk.sh|g" \
  "$repo_dir/deploy/earthbound-background-engine.desktop.template" \
  > "$autostart_dir/earthbound-background-engine.desktop"

chmod +x "$repo_dir/scripts/start-kiosk.sh"
systemctl --user daemon-reload
systemctl --user enable --now earthbound-background-engine.service

echo "Installed the EarthBound server and Chromium autostart entry."
echo "Reboot into Raspberry Pi OS Desktop to start the kiosk."
