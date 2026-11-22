#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec node --experimental-sqlite --import tsx src/server/mcp.ts
