// Refresh or exchange user Spotify tokens using Client ID + Secret (required for many apps).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function spotifyCredentials() {
  const clientId = Deno.env.get("SPOTIFY_CLIENT_ID");
  const clientSecret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in Supabase Secrets");
  }
  return { clientId, clientSecret };
}

async function requestToken(body: URLSearchParams) {
  const { clientId, clientSecret } = spotifyCredentials();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error("spotify-user-token error:", resp.status, data);
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = body?.action as string;

    if (action === "refresh") {
      const refreshToken = body?.refresh_token as string;
      if (!refreshToken) {
        return new Response(JSON.stringify({ error: "refresh_token required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await requestToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      );
    }

    if (action === "exchange") {
      const code = body?.code as string;
      const redirectUri = body?.redirect_uri as string;
      const codeVerifier = body?.code_verifier as string;
      if (!code || !redirectUri || !codeVerifier) {
        return new Response(JSON.stringify({ error: "code, redirect_uri, code_verifier required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await requestToken(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("spotify-user-token:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
