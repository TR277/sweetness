// Spotify recommendations via Client Credentials flow.
// Uses seed_genres + audio feature targets from parse-music to fetch tracks.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let cachedToken: { token: string; expiresAt: number } | null = null;

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
}

interface SpotifyTrackRaw {
  id: string;
  name: string;
  artists?: SpotifyArtist[];
  album?: { images?: SpotifyImage[] };
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  duration_ms?: number;
}

type NormalizedTrack = {
  id: string;
  name: string;
  artists: string;
  album_image?: string;
  preview_url: string | null;
  external_url?: string;
  duration_ms?: number;
};

function normalizeTracks(items: SpotifyTrackRaw[]) {
  return items.map((t) => ({
    id: t.id,
    name: t.name,
    artists: t.artists?.map((a) => a.name).join(", "),
    album_image: t.album?.images?.[0]?.url,
    preview_url: t.preview_url ?? null,
    external_url: t.external_urls?.spotify,
    duration_ms: t.duration_ms,
  }));
}

function mergeUniqueTracks(existing: NormalizedTrack[], incoming: NormalizedTrack[]) {
  const ids = new Set(existing.map((t) => t.id));
  const merged = [...existing];
  for (const track of incoming) {
    if (!ids.has(track.id)) {
      merged.push(track);
      ids.add(track.id);
    }
  }
  return merged;
}

function sortPreviewFirst(tracks: NormalizedTrack[]) {
  return [...tracks].sort((a, b) => Number(Boolean(b.preview_url)) - Number(Boolean(a.preview_url)));
}

async function searchByQuery(
  token: string,
  query: string,
  market: string,
  limit: number,
): Promise<{ tracks: NormalizedTrack[]; status: number; detail?: string }> {
  const searchLimit = Math.min(Math.max(limit, 1), 10);
  const searchUrl =
    `https://api.spotify.com/v1/search?type=track&limit=${searchLimit}&market=${market}&q=${encodeURIComponent(query)}`;
  const searchResp = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchResp.ok) {
    const detail = await searchResp.text();
    console.error("Spotify search error:", query, searchResp.status, detail);
    return { tracks: [], status: searchResp.status, detail };
  }
  const searchData = await searchResp.json();
  const tracks = normalizeTracks((searchData?.tracks?.items || []) as SpotifyTrackRaw[]);
  return { tracks, status: searchResp.status };
}

function buildSearchQueries(genres: string[]) {
  const queries = new Set<string>();
  for (const genre of genres) {
    queries.add(`genre:${genre}`);
    queries.add(genre.replace(/-/g, " "));
  }
  queries.add("chill instrumental");
  queries.add("lofi beats");
  queries.add("indie acoustic");
  queries.add("ambient relax");
  return [...queries];
}

async function searchTracksFallback(
  token: string,
  genres: string[],
  market: string,
  targetCount: number,
) {
  let merged: NormalizedTrack[] = [];
  const attempts: { query: string; status: number; count: number; detail?: string }[] = [];

  for (const query of buildSearchQueries(genres)) {
    if (merged.length >= targetCount) break;
    const result = await searchByQuery(token, query, market, 10);
    attempts.push({
      query,
      status: result.status,
      count: result.tracks.length,
      detail: result.detail,
    });
    merged = mergeUniqueTracks(merged, result.tracks);
  }

  return { tracks: sortPreviewFirst(merged).slice(0, targetCount), attempts };
}

async function ensurePlayableTracks(
  token: string,
  tracks: NormalizedTrack[],
  genres: string[],
  market: string,
  targetCount: number,
) {
  let merged = [...tracks];
  if (merged.length >= targetCount) {
    return { tracks: sortPreviewFirst(merged).slice(0, targetCount), attempts: [] as unknown[] };
  }

  const fallback = await searchTracksFallback(token, genres, market, targetCount);
  merged = mergeUniqueTracks(merged, fallback.tracks);
  return {
    tracks: sortPreviewFirst(merged).slice(0, targetCount),
    attempts: fallback.attempts,
  };
}

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Spotify credentials not configured");
  const basic = btoa(`${id}:${secret}`);
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!resp.ok) throw new Error(`Spotify token error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const seeds = body?.spotify_seeds ?? {};
    const market = body?.market || "US";
    const requested = Math.floor(Number(body?.limit ?? 12));
    const recLimit = Math.min(Math.max(Number.isFinite(requested) ? requested : 12, 1), 30);
    const targetTempo =
      typeof body?.target_tempo === "number"
        ? body.target_tempo
        : typeof seeds.target_tempo === "number"
          ? seeds.target_tempo
          : undefined;

    const token = await getSpotifyToken();
    const userToken = typeof body?.user_access_token === "string" ? body.user_access_token : null;
    const recToken = userToken || token;

    const params = new URLSearchParams();
    const genres: string[] = (seeds.seed_genres || []).slice(0, 5);
    if (genres.length === 0) genres.push("chill");
    params.set("seed_genres", genres.join(","));
    params.set("limit", String(recLimit));
    params.set("market", market);
    if (typeof seeds.target_valence === "number") params.set("target_valence", String(seeds.target_valence));
    if (typeof seeds.target_energy === "number") params.set("target_energy", String(seeds.target_energy));
    if (typeof seeds.target_acousticness === "number") params.set("target_acousticness", String(seeds.target_acousticness));
    if (typeof seeds.target_instrumentalness === "number") params.set("target_instrumentalness", String(seeds.target_instrumentalness));
    if (typeof targetTempo === "number") params.set("target_tempo", String(Math.round(targetTempo)));

    const recsUrl = `https://api.spotify.com/v1/recommendations?${params.toString()}`;
    const resp = await fetch(recsUrl, {
      headers: { Authorization: `Bearer ${recToken}` },
    });

    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text();
      console.error("Spotify recs error:", resp.status, text);
      if (resp.status === 403 && text.includes("Active premium subscription required")) {
        return new Response(
          JSON.stringify({
            tracks: [],
            source: "spotify_blocked_premium_required",
            warning: "Spotify app owner requires an active Premium subscription.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: `Spotify ${resp.status}`, detail: text }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (resp.ok) {
      const data = await resp.json();
      const raw = normalizeTracks((data.tracks || []) as SpotifyTrackRaw[]);
      const { tracks, attempts } = await ensurePlayableTracks(token, raw, genres, market, recLimit);
      console.log("spotify-recommend ok", { source: "recommendations", count: tracks.length, genres });
      return new Response(JSON.stringify({ tracks, source: "recommendations", debug: { attempts } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.info("Spotify recommendations unavailable, using search fallback. status:", resp.status);

    const { tracks, attempts } = await ensurePlayableTracks(token, [], genres, market, recLimit);
    console.log("spotify-recommend fallback", { source: "search_fallback", count: tracks.length, genres, attempts });

    if (tracks.length === 0) {
      return new Response(
        JSON.stringify({
          tracks: [],
          source: "search_fallback",
          warning:
            "Spotify Recommendations API unavailable and search returned no tracks. " +
            "Ensure SPOTIFY_CLIENT_ID/SECRET are set, the app owner has Premium if required, " +
            "and your Developer App has catalog access (Extended Quota Mode).",
          debug: {
            recommendations_status: resp.status,
            attempts,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ tracks, source: "search_fallback", debug: { attempts } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spotify-recommend error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
