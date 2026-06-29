import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "spotify_tokens";
const VERIFIER_KEY = "spotify_code_verifier";
const PROFILE_CACHE_KEY = "spotify_profile_cache";
const RETURN_PATH_KEY = "spotify_return_path";
const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SpotifyProfile {
  id: string;
  display_name?: string;
  product?: string;
  email?: string;
}

function getClientId() {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("VITE_SPOTIFY_CLIENT_ID is not configured");
  return id;
}

export function getSpotifyRedirectUri() {
  return `${window.location.origin}/spotify/callback`;
}

function generateRandomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

async function sha256Base64Url(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function loadSpotifyTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpotifyTokens;
  } catch {
    return null;
  }
}

export function saveSpotifyTokens(tokens: SpotifyTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearSpotifyTokens() {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveSpotifyProfileCache(profile: SpotifyProfile) {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export function loadSpotifyProfileCache(): SpotifyProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpotifyProfile;
  } catch {
    return null;
  }
}

export function clearSpotifyProfileCache() {
  localStorage.removeItem(PROFILE_CACHE_KEY);
}

/** Remove Spotify OAuth tokens, profile cache, and in-flight login keys. */
export function clearSpotifyAuthCache() {
  clearSpotifyTokens();
  clearSpotifyProfileCache();
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(RETURN_PATH_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
}

function toStoredTokens(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}, existing?: SpotifyTokens | null): SpotifyTokens {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: Date.now() + data.expires_in * 1000 - 60_000,
  };
}

async function tokenRequestViaServer(body: Record<string, string>): Promise<SpotifyTokens | null> {
  try {
    const { data, error } = await supabase.functions.invoke("spotify-user-token", { body });
    if (error || !data?.access_token) return null;
    return toStoredTokens(
      data as { access_token: string; refresh_token?: string; expires_in: number },
      loadSpotifyTokens(),
    );
  } catch {
    return null;
  }
}

async function tokenRequestDirect(params: URLSearchParams): Promise<SpotifyTokens | null> {
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return toStoredTokens(data, loadSpotifyTokens());
}

export async function startSpotifyLogin(returnPath = "/profile") {
  const verifier = generateRandomString(64);
  const challenge = await sha256Base64Url(verifier);
  localStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(RETURN_PATH_KEY, returnPath);
  sessionStorage.setItem(RETURN_PATH_KEY, returnPath);

  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getSpotifyRedirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    show_dialog: "true",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeSpotifyCode(code: string) {
  const verifier =
    sessionStorage.getItem(VERIFIER_KEY) ?? localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — try connecting again from Profile");

  const redirectUri = getSpotifyRedirectUri();

  let tokens =
    (await tokenRequestViaServer({
      action: "exchange",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })) ??
    (await tokenRequestDirect(
      new URLSearchParams({
        client_id: getClientId(),
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    ));

  if (!tokens) {
    throw new Error("Spotify token exchange failed — check Supabase spotify-user-token function");
  }

  saveSpotifyTokens(tokens);
  sessionStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  return tokens;
}

export async function refreshSpotifyToken(refreshToken: string) {
  let tokens =
    (await tokenRequestViaServer({ action: "refresh", refresh_token: refreshToken })) ??
    (await tokenRequestDirect(
      new URLSearchParams({
        client_id: getClientId(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    ));

  if (!tokens) {
    clearSpotifyTokens();
    throw new Error("Spotify token refresh failed");
  }

  saveSpotifyTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(): Promise<string | null> {
  const stored = loadSpotifyTokens();
  if (!stored) return null;
  if (Date.now() < stored.expires_at) return stored.access_token;
  if (!stored.refresh_token) {
    clearSpotifyTokens();
    return null;
  }
  try {
    const refreshed = await refreshSpotifyToken(stored.refresh_token);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile | null> {
  const resp = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  return resp.json();
}

export function isSpotifyConfigured() {
  return Boolean(import.meta.env.VITE_SPOTIFY_CLIENT_ID);
}

export function isStoredTokenFresh(): boolean {
  const stored = loadSpotifyTokens();
  if (!stored?.access_token) return false;
  return Date.now() < stored.expires_at;
}
