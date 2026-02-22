#!/bin/sh
set -eu

cleanup() {
  trap - INT TERM
  echo "dev-services: shutting down..."
  kill 0 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM

echo "dev-services: installing dependencies..."
cd /workspace && bun install

echo "dev-services: starting dev server (bun --watch)..."
bun run dev &

echo "dev-services: service started"
wait
