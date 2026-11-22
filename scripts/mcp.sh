#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec sh scripts/node.sh --import tsx src/server/mcp.ts
