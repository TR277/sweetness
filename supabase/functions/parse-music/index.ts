// Parse a drink + preferences into music params using Lovable AI (Gemini)
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const timbreByCategory: Record<string, string> = {
  original: "soft pad",
  cheese: "airy pad + reverb",
  caramel: "warm low-mid synth",
  chocolate: "dark pad",
  fruit: "bright bell",
  flower: "airy flute",
  matcha: "soft muted pad",
  coffee: "piano + bass",
  nut: "warm pluck",
  coconut: "marimba",
  sparkling: "plucky synth",
  herbal: "airy noise",
  milk: "creamy soft pad",
  yogurt: "light tangy pluck",
  smoothie: "blended warm synth",
};

function primaryCategory(category: string) {
  const first = category.split(",")[0]?.trim();
  return first && timbreByCategory[first] ? first : "original";
}

function emotionForSweetness(t: number) {
  if (t <= 3) return "healing";
  if (t <= 5) return "dreamy";
  if (t <= 7) return "relaxed";
  return "happy";
}

function computeTempo(sweetnessTarget: number, musicPreference?: string) {
  const t = clamp(Number(sweetnessTarget) || 5, 1, 10);
  let tempo = Math.round(70 + (t / 10) * 50);
  const p = musicPreference?.toLowerCase() ?? "";
  if (p.includes("folk") || p.includes("acoustic") || p.includes("ambient") || p.includes("classical") || p.includes("strings")) {
    tempo -= 12;
  } else if (p.includes("jazz") || p.includes("bossa")) {
    tempo -= 5;
  } else if (p.includes("dreampop") || p.includes("dream pop") || p.includes("synthpop") || p.includes("synth pop") || p.includes("marimba")) {
    tempo += 8;
  } else if (p.includes("chillhop") || p.includes("chill hop")) {
    tempo += 3;
  }
  return Math.max(60, Math.min(130, tempo));
}

function buildDefaultSpotifySeeds(sweetnessTarget: number, musicPreference?: string) {
  const t = clamp(Number(sweetnessTarget) || 5, 1, 10);
  const tempo = computeTempo(t, musicPreference);
  const energy = clamp(0.25 + t * 0.05, 0.25, 0.75);
  return {
    seed_genres: t <= 4 ? ["chill", "acoustic"] : t <= 7 ? ["lo-fi", "indie"] : ["pop", "funk"],
    target_valence: clamp(0.35 + t * 0.05, 0.2, 0.9),
    target_energy: energy,
    target_acousticness: clamp(0.8 - t * 0.06, 0.2, 0.85),
    target_instrumentalness: t <= 5 ? 0.7 : 0.45,
    target_tempo: tempo,
  };
}

function spotifySeedsFromPreference(musicPreference: string, sweetnessTarget: number) {
  const base = buildDefaultSpotifySeeds(sweetnessTarget, musicPreference);
  const p = musicPreference.toLowerCase();
  let genres = [...base.seed_genres];
  let acousticness = base.target_acousticness;
  let instrumentalness = base.target_instrumentalness;

  if (p.includes("lo-fi") || p.includes("lofi") || p.includes("chillhop") || p.includes("chill hop")) {
    genres = ["lo-fi", "chill"];
  } else if (p.includes("jazz")) {
    genres = ["jazz", "bossa-nova"];
  } else if (p.includes("bossa")) {
    genres = ["bossa-nova", "latin"];
  } else if (p.includes("acoustic") || p.includes("folk")) {
    genres = ["acoustic", "folk"];
    acousticness = Math.max(acousticness, 0.75);
  } else if (p.includes("classical") || p.includes("strings")) {
    genres = ["classical", "ambient"];
    instrumentalness = Math.max(instrumentalness, 0.75);
  } else if (p.includes("ambient")) {
    genres = ["ambient", "chill"];
  } else if (p.includes("dreampop") || p.includes("dream pop") || p.includes("synthpop") || p.includes("synth pop")) {
    genres = ["indie-pop", "synth-pop"];
    acousticness = Math.min(acousticness, 0.45);
  } else if (p.includes("marimba")) {
    genres = ["world", "tropical"];
  }

  return { ...base, seed_genres: genres, target_acousticness: acousticness, target_instrumentalness: instrumentalness };
}

function buildFallbackParams(input: {
  milkTeaName: string;
  category: string;
  sweetnessTarget: number;
  musicPreference?: string;
}) {
  const t = clamp(Number(input.sweetnessTarget) || 5, 1, 10);
  const pref = input.musicPreference?.trim() ?? "";
  const tempo = computeTempo(t, pref);
  const brightness = clamp(0.3 + (t / 10) * 0.6, 0.3, 0.9);
  const energy = clamp(0.25 + (t / 10) * 0.5, 0.25, 0.75);
  const emotion = emotionForSweetness(t);
  const categoryTimbre = timbreByCategory[primaryCategory(input.category)];
  const timbre = pref || categoryTimbre;
  const spotify_seeds = pref ? spotifySeedsFromPreference(pref, t) : buildDefaultSpotifySeeds(t);

  const description = pref
    ? `A ${emotion} ${pref} track for ${input.milkTeaName}, tuned to enhance perceived sweetness.`
    : `A ${emotion} ${categoryTimbre} soundscape for ${input.milkTeaName}, tuned to enhance perceived sweetness.`;

  return {
    timbre,
    tempo,
    brightness,
    energy,
    emotion,
    sweetness_target: t,
    spotify_seeds: { ...spotify_seeds, target_tempo: tempo },
    description,
  };
}

function syncSpotifySeedsToParams(params: ReturnType<typeof buildFallbackParams>) {
  const base = params.spotify_seeds ?? buildDefaultSpotifySeeds(params.sweetness_target);
  return {
    ...params,
    spotify_seeds: { ...base, target_tempo: params.tempo, target_energy: params.energy },
  };
}

function applyMusicPreference(
  params: ReturnType<typeof buildFallbackParams>,
  milkTeaName: string,
  musicPreference?: string,
) {
  const pref = musicPreference?.trim();
  if (!pref) return syncSpotifySeedsToParams(params);
  const tempo = computeTempo(params.sweetness_target, pref);
  return syncSpotifySeedsToParams({
    ...params,
    tempo,
    timbre: pref,
    description: `A ${params.emotion} ${pref} track for ${milkTeaName}, tuned to enhance perceived sweetness.`,
    spotify_seeds: spotifySeedsFromPreference(pref, params.sweetness_target),
  });
}

function normalizeMusicParams(
  params: ReturnType<typeof buildFallbackParams>,
  sweetnessTarget: number,
  musicPreference: string | undefined,
  milkTeaName: string,
) {
  const pref = musicPreference?.trim();
  const t = clamp(Number(sweetnessTarget) || params.sweetness_target || 5, 1, 10);
  const tempo = computeTempo(t, pref);
  let result = syncSpotifySeedsToParams({
    ...params,
    sweetness_target: t,
    tempo,
  });
  if (pref) {
    result = applyMusicPreference(result, milkTeaName, pref);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { milkTeaName, category, sweetnessTarget, musicPreference } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const params = buildFallbackParams({ milkTeaName, category, sweetnessTarget, musicPreference });
      return new Response(JSON.stringify({ params, source: "fallback_no_lovable_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prefLine = musicPreference?.trim()
      ? `User music preference (MUST be the primary style — use for timbre, description, and spotify seed_genres): ${musicPreference}`
      : "User music preference: none — derive timbre from drink category only.";

    const systemPrompt = `You are a music perception expert. Given a drink and sweetness context, return music parameters that enhance perceived sweetness.
IMPORTANT: If the user provided a music preference, timbre and description MUST reflect that style as the main genre/instrumentation. Never override it with generic "soft piano", "ambient pads", or "piano and strings" unless the user explicitly asked for those.
Return via the music_params tool. Tempo in BPM (60-130). Brightness/energy in 0-1. Emotion ∈ {relaxed, happy, healing, romantic, dreamy, nostalgic}. Timbre: short phrase matching the user's chosen style.`;

    const userPrompt = `Drink: ${milkTeaName} (category: ${category})
Target felt sweetness level (1-10): ${sweetnessTarget}
${prefLine}
Sweetness level affects tempo/energy only — style comes from the user's preference when provided.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "music_params",
              description: "Music parameters tuned for sweetness perception",
              parameters: {
                type: "object",
                properties: {
                  timbre: { type: "string" },
                  tempo: { type: "number" },
                  brightness: { type: "number" },
                  energy: { type: "number" },
                  emotion: {
                    type: "string",
                    enum: ["relaxed", "happy", "healing", "romantic", "dreamy", "nostalgic"],
                  },
                  sweetness_target: { type: "number" },
                  spotify_seeds: {
                    type: "object",
                    properties: {
                      seed_genres: { type: "array", items: { type: "string" } },
                      target_valence: { type: "number" },
                      target_energy: { type: "number" },
                      target_acousticness: { type: "number" },
                      target_instrumentalness: { type: "number" },
                      target_tempo: { type: "number" },
                    },
                    required: ["seed_genres", "target_valence", "target_energy", "target_tempo"],
                  },
                  description: { type: "string", description: "1-sentence vibe description for the user" },
                },
                required: ["timbre", "tempo", "brightness", "energy", "emotion", "sweetness_target", "spotify_seeds", "description"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "music_params" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway: ${resp.status}`);
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("No tool call in response");
    const raw = JSON.parse(call.function.arguments);
    const params = normalizeMusicParams(raw, sweetnessTarget, musicPreference, milkTeaName);

    return new Response(JSON.stringify({ params, source: "lovable_ai" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-music error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
