import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MusicParams {
  timbre: string;
  tempo: number;
  brightness: number;
  energy: number;
  emotion: string;
  description: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toBase64(bytes: Uint8Array) {
  // Avoid stack overflows for large audio payloads.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toPrompt(drinkName: string, p: MusicParams) {
  return [
    `Create an instrumental track in this style: ${p.timbre}.`,
    `Drink: ${drinkName}. Mood: ${p.emotion}.`,
    `Tempo around ${Math.round(p.tempo)} BPM.`,
    `Energy level ${p.energy.toFixed(2)} and brightness ${p.brightness.toFixed(2)}.`,
    `Vibe: ${p.description}.`,
    "No vocals, no speech, no sudden loud transitions. Stay faithful to the requested style.",
  ].join(" ");
}

function asDataUrl(base64Audio: string, mimeType = "audio/wav") {
  return `data:${mimeType};base64,${base64Audio}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STABILITY_API_KEY = Deno.env.get("STABILITY_API_KEY");
    if (!STABILITY_API_KEY) throw new Error("STABILITY_API_KEY not configured");

    const {
      milkTeaName,
      musicParams,
      durationSeconds = 20,
    }: { milkTeaName: string; musicParams: MusicParams; durationSeconds?: number } = await req.json();

    if (!milkTeaName || !musicParams) {
      throw new Error("milkTeaName and musicParams are required");
    }

    const prompt = toPrompt(milkTeaName, musicParams);
    const seconds = clamp(Number(durationSeconds) || 20, 10, 45);
    const apiUrl =
      Deno.env.get("STABILITY_AUDIO_URL") ||
      "https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio";
    const outputFormat = Deno.env.get("STABILITY_AUDIO_OUTPUT_FORMAT") || "mp3";
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("duration", String(seconds));
    form.append("output_format", outputFormat);

    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: "application/json,audio/*",
      },
      body: form,
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("generate-music upstream error:", upstream.status, detail);
      return new Response(
        JSON.stringify({
          error: "Music generation failed",
          detail,
          status: upstream.status,
        }),
        {
          status: upstream.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const contentType = upstream.headers.get("content-type") || "";

    // Some providers return raw audio bytes directly.
    if (contentType.startsWith("audio/")) {
      const audioBytes = await upstream.arrayBuffer();
      const base64 = toBase64(new Uint8Array(audioBytes));
      return new Response(
        JSON.stringify({
          audio_url: asDataUrl(base64, contentType),
          provider: "stability",
          provider_track_id: crypto.randomUUID(),
          meta: { duration_seconds: seconds, prompt },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // JSON fallback (base64 or URL style responses).
    const data = await upstream.json();
    const base64Audio =
      data?.audio ||
      data?.output?.audio ||
      data?.artifacts?.[0]?.base64 ||
      data?.artifacts?.[0]?.audio;
    const remoteUrl = data?.audio_url || data?.url || data?.output_url;
    const mime = data?.mime_type || (outputFormat === "mp3" ? "audio/mpeg" : "audio/wav");

    const audioUrl = base64Audio ? asDataUrl(base64Audio, mime) : remoteUrl;
    if (!audioUrl) throw new Error("No audio payload returned by provider");

    return new Response(
      JSON.stringify({
        audio_url: audioUrl,
        provider: "stability",
        provider_track_id: data?.id || data?.track_id || crypto.randomUUID(),
        meta: { duration_seconds: seconds, prompt },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-music error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
