import { clearSpotifyAuthCache } from "@/lib/spotifyAuth";
import { onSpotifyAccountLinked } from "@/lib/spotifyPlayerManager";

const LEGACY_MUSIC_LIBRARY_KEY = "sweetness_music_library";

/** Clear Spotify login, player state, and local app cache. Keeps drink records & saved tracks. */
export function clearAppCache() {
  clearSpotifyAuthCache();
  onSpotifyAccountLinked();
  localStorage.removeItem(LEGACY_MUSIC_LIBRARY_KEY);
}

/** Clear cache and reload Profile (fresh app state). */
export function clearAppCacheAndReload() {
  clearAppCache();
  window.location.replace(`${window.location.origin}/profile?cache=cleared`);
}
