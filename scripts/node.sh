#!/bin/sh
set -eu

required=$(cat "$(dirname "$0")/../.nvmrc")
node_path=$(command -v node || true)
node_version=
if [ -n "$node_path" ]; then
  node_version=$("$node_path" --version 2>/dev/null || true)
fi

case "$node_version" in
  "v$required".*) ;;
  *)
    nvm_script="${NVM_DIR:-${HOME:-}/.nvm}/nvm.sh"
    node_path=
    if [ -r "$nvm_script" ]; then
      node_path=$(
        set +u
        . "$nvm_script" --no-use
        nvm which "$required"
      ) || node_path=
    fi
    ;;
esac

if [ ! -x "$node_path" ]; then
  printf 'Italiano Lab requiert Node.js %s. Installez-le avec nvm install %s ou ajoutez-le au PATH.\n' "$required" "$required" >&2
  exit 1
fi

# Keep child processes on the same runtime, including when nvm supplied it.
PATH="$(dirname "$node_path"):$PATH"
export PATH
exec "$node_path" "$@"
