#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
dir=$(mktemp -d "${TMPDIR:-/tmp}/italiano-e2e.XXXXXX")
export ITALIANO_DB_PATH="$dir/test.sqlite"
export ITALIANO_REMINDERS_PATH="$dir/revisions.json"
export ITALIANO_TEST_CLOCK="$dir/clock"
test_port=${ITALIANO_TEST_PORT:-3211}
export ITALIANO_TEST_URL="http://127.0.0.1:$test_port"
cleanup() { if [ -n "${server_pid:-}" ]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi; rm -rf "$dir"; }
trap cleanup EXIT INT TERM
sh scripts/node.sh -e "const net=require('node:net');const s=net.createServer();s.on('error',()=>{console.error('Le port de test est occupé');process.exit(1)});s.listen(Number(new URL(process.env.ITALIANO_TEST_URL).port),'127.0.0.1',()=>s.close())"
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=./tests/browser-clock.mjs" sh scripts/node.sh node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port "$test_port" &
server_pid=$!
sh scripts/node.sh -e "const http=require('node:http');let n=0;function ping(){http.get(process.env.ITALIANO_TEST_URL,r=>{r.resume();process.exit(0)}).on('error',()=>{if(++n>60)process.exit(1);setTimeout(ping,500)})}ping()"
sh scripts/node.sh node_modules/@playwright/test/cli.js test "$@"
