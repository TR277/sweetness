#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm i -g vercel
fi

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill in VITE_* variables."
  exit 1
fi

# shellcheck disable=SC1091
source .env

for key in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SPOTIFY_CLIENT_ID; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing $key in .env"
    exit 1
  fi
done

echo "Setting Vercel environment variables (production)..."
printf '%s' "$VITE_SUPABASE_URL" | vercel env add VITE_SUPABASE_URL production --force 2>/dev/null || true
printf '%s' "$VITE_SUPABASE_PUBLISHABLE_KEY" | vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --force 2>/dev/null || true
printf '%s' "$VITE_SPOTIFY_CLIENT_ID" | vercel env add VITE_SPOTIFY_CLIENT_ID production --force 2>/dev/null || true

printf '%s' "$VITE_SUPABASE_URL" | vercel env add VITE_SUPABASE_URL preview --force 2>/dev/null || true
printf '%s' "$VITE_SUPABASE_PUBLISHABLE_KEY" | vercel env add VITE_SUPABASE_PUBLISHABLE_KEY preview --force 2>/dev/null || true
printf '%s' "$VITE_SPOTIFY_CLIENT_ID" | vercel env add VITE_SPOTIFY_CLIENT_ID preview --force 2>/dev/null || true

echo "Deploying to Vercel (production)..."
vercel deploy --prod

echo ""
echo "Done. Add this Redirect URI in Spotify Developer Dashboard:"
echo "  https://YOUR-PROJECT.vercel.app/spotify/callback"
echo "(Replace with the production URL printed above.)"
