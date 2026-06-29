import {
  fetchSpotifyProfile,
  getValidAccessToken,
  isStoredTokenFresh,
} from "@/lib/spotifyAuth";

type ReadyHandler = (deviceId: string) => void;
type ErrorHandler = (message: string) => void;
type TrackEndedHandler = () => void;

interface Subscriber {
  onReady: ReadyHandler;
  onError: ErrorHandler;
  onTrackEnded?: TrackEndedHandler;
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const SDK_SCRIPT_SELECTOR = 'script[data-spotify-sdk="true"]';
const PLAYER_NAME = "Sweet Sound Sync";
const READY_TIMEOUT_MS = 60_000;

let sdkReadyPromise: Promise<void> | null = null;
let player: Spotify.Player | null = null;
let deviceId: string | null = null;
let connectPromise: Promise<string> | null = null;
let prepPromise: Promise<boolean> | null = null;
let tokenCache: string | null = null;
const subscribers = new Set<Subscriber>();

function ensureSpotifySdkScript() {
  if (document.querySelector(`script[src="${SDK_URL}"], ${SDK_SCRIPT_SELECTOR}`)) return;

  const script = document.createElement("script");
  script.src = SDK_URL;
  script.async = true;
  script.dataset.spotifySdk = "true";
  script.onerror = () => {
    sdkReadyPromise = null;
    notifyError("Could not load Spotify SDK — check network access to sdk.scdn.co");
  };
  document.body.appendChild(script);
}

function notifyReady(id: string) {
  deviceId = id;
  for (const sub of subscribers) sub.onReady(id);
}

function notifyError(message: string) {
  for (const sub of subscribers) sub.onError(message);
}

function notifyTrackEnded() {
  for (const sub of subscribers) {
    sub.onTrackEnded?.();
  }
}

export function waitForSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkReadyPromise) return sdkReadyPromise;

  sdkReadyPromise = new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (!window.Spotify?.Player) return;
      settled = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      sdkReadyPromise = null;
      reject(new Error(message));
    };

    const timeout = window.setTimeout(() => {
      fail("Spotify SDK load timed out — check network access to sdk.scdn.co");
    }, 20_000);

    const poll = window.setInterval(() => {
      if (window.Spotify?.Player || (window as Window & { __spotifySdkReady?: boolean }).__spotifySdkReady) {
        finish();
      }
    }, 100);

    const previous = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      previous?.();
      finish();
    };

    ensureSpotifySdkScript();
    finish();
  });

  return sdkReadyPromise;
}

function destroyPlayer() {
  player?.disconnect();
  player = null;
  deviceId = null;
}

function deliverOAuthToken(cb: (token: string) => void) {
  if (tokenCache) {
    cb(tokenCache);
    return;
  }
  void getValidAccessToken()
    .then((token) => {
      if (!token) {
        notifyError("Spotify session expired — link again in Profile");
        cb("");
        return;
      }
      tokenCache = token;
      cb(token);
    })
    .catch(() => {
      notifyError("Could not refresh Spotify token — link again in Profile");
      cb("");
    });
}

function createPlayer() {
  player = new window.Spotify.Player({
    name: PLAYER_NAME,
    volume: 0.75,
    getOAuthToken: deliverOAuthToken,
  });

  player.addListener("ready", ({ device_id }: Spotify.WebPlaybackPlayer) => {
    notifyReady(device_id);
  });

  player.addListener("not_ready", ({ device_id }: Spotify.WebPlaybackPlayer) => {
    if (deviceId === device_id) deviceId = null;
  });

  player.addListener("initialization_error", ({ message }: Spotify.WebPlaybackError) => {
    notifyError(message || "Failed to initialize player");
  });

  player.addListener("authentication_error", ({ message }: Spotify.WebPlaybackError) => {
    notifyError(
      message ||
        "Spotify auth failed — Profile → Clear cache → Link again (needs streaming permission)",
    );
  });

  player.addListener("account_error", ({ message }: Spotify.WebPlaybackError) => {
    notifyError(message || "Spotify Premium is required for in-app playback");
  });

  player.addListener("player_state_changed", (state) => {
    const playback = state as Spotify.PlaybackState | null;
    if (!playback?.track_window?.current_track) return;
    const { paused, position, duration } = playback;
    if (paused && duration > 0 && position >= duration - 500) {
      notifyTrackEnded();
    }
  });
}

function ensurePlayerInstance() {
  if (!player) createPlayer();
}

async function findWebPlayerDevice(token: string): Promise<string | null> {
  try {
    const resp = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { devices?: { id: string; name: string; is_active?: boolean }[] };
    const match = data.devices?.find((device) => device.name === PLAYER_NAME);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

function waitForPlayerReady(token: string, timeoutMs = READY_TIMEOUT_MS): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (id: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      subscribers.delete(subscriber);
      resolve(id);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      subscribers.delete(subscriber);
      reject(new Error(message));
    };

    const timeout = window.setTimeout(() => {
      fail("Spotify player ready timed out — tap Enable Player again, or Clear cache → Link in Profile");
    }, timeoutMs);

    const subscriber: Subscriber = {
      onReady: (id) => finish(id),
      onError: (message) => fail(message),
    };
    subscribers.add(subscriber);

    void (async () => {
      const deadline = Date.now() + timeoutMs;
      while (!settled && Date.now() < deadline) {
        await new Promise((r) => window.setTimeout(r, 2000));
        if (settled || deviceId) return;
        const id = await findWebPlayerDevice(token);
        if (id) {
          deviceId = id;
          notifyReady(id);
          return;
        }
      }
    })();
  });
}

/** Load SDK, refresh token, create player (no connect). */
export function prepareSpotifyPlayer(): Promise<boolean> {
  if (prepPromise) return prepPromise;

  prepPromise = (async () => {
    try {
      await waitForSpotifySdk();

      const token = await getValidAccessToken();
      if (!token) return false;

      const profile = await fetchSpotifyProfile(token);
      if (!profile) return false;
      if (profile.product !== "premium") return false;

      tokenCache = token;
      ensurePlayerInstance();
      return true;
    } catch (e) {
      console.error("prepareSpotifyPlayer:", e);
      return false;
    } finally {
      prepPromise = null;
    }
  })();

  return prepPromise;
}

export function isSpotifyPlayerPrepared() {
  return Boolean(player && tokenCache && isStoredTokenFresh());
}

/**
 * Must be called synchronously from a click/tap, after prepareSpotifyPlayer() succeeds.
 */
export function connectSpotifyPlayerFromGesture(): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);
  if (connectPromise) return connectPromise;

  if (!tokenCache) {
    return Promise.reject(new Error("Not ready — wait for Preparing, then tap Enable Player"));
  }
  if (!window.Spotify?.Player) {
    return Promise.reject(new Error("Spotify SDK not loaded"));
  }

  ensurePlayerInstance();

  const token = tokenCache;
  const readyWait = waitForPlayerReady(token);

  connectPromise = player!
    .connect()
    .then(async (connected) => {
      if (!connected) {
        throw new Error("Could not connect — tap Enable Player again");
      }
      const id = await readyWait;
      await transferPlayback(token, id);
      return id;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

export function resetSpotifyPlayer() {
  destroyPlayer();
  connectPromise = null;
  prepPromise = null;
}

export function clearSpotifyPlayerTokenCache() {
  tokenCache = null;
}

export function onSpotifyAccountLinked() {
  resetSpotifyPlayer();
  clearSpotifyPlayerTokenCache();
}

export function getSpotifyDeviceId() {
  return deviceId;
}

export function subscribeSpotifyPlayer(subscriber: Subscriber) {
  subscribers.add(subscriber);
  if (deviceId) subscriber.onReady(deviceId);
  return () => subscribers.delete(subscriber);
}

export async function transferPlayback(token: string, deviceIdValue: string) {
  const resp = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceIdValue], play: false }),
  });
  if (!resp.ok && resp.status !== 404) {
    const detail = await resp.text();
    console.warn("Spotify transfer playback:", resp.status, detail);
  }
}

export async function startSpotifyPlayback(token: string, deviceIdValue: string, trackId: string) {
  await transferPlayback(token, deviceIdValue);

  const playUrl = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceIdValue)}`;
  const body = JSON.stringify({ uris: [`spotify:track:${trackId}`] });
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const resp = await fetch(playUrl, { method: "PUT", headers, body });
  if (resp.status === 204) return;

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Spotify play failed (${resp.status}): ${detail}`);
  }
}

export async function pauseSpotifyPlayback() {
  await player?.pause();
}

export async function resumeSpotifyPlayback() {
  await player?.resume();
}
