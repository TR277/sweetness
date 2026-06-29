import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Home, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDrinkRecord } from "@/lib/storage";
import { saveTrack } from "@/lib/musicLibrary";
import { toast } from "sonner";

export const SESSION_SUMMARY_KEY = "sweet_sipper_session_summary";

export interface SessionSummaryState {
  name: string;
  mode: "ai" | "spotify";
  original: number;
  target: number;
  cupLabel: string;
  volumeMl: number;
  durationSeconds: number;
  sugar: {
    grams: number;
    cubes: number;
    cokeBottles: number;
    kcal: number;
  };
  saveToLibrary?: boolean;
  generatedAudioUrl?: string;
  trackTitle?: string;
  trackEmotion?: string;
  trackTempo?: number;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function readSummary(locationState: unknown): SessionSummaryState | null {
  if (locationState) return locationState as SessionSummaryState;
  try {
    const raw = sessionStorage.getItem(SESSION_SUMMARY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionSummaryState;
  } catch {
    return null;
  }
}

export default function SessionSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const summary = useMemo(() => readSummary(location.state), [location.state]);
  const [trackSaved, setTrackSaved] = useState(false);
  const [saving, setSaving] = useState(true);

  useEffect(() => {
    if (!summary) {
      navigate("/", { replace: true });
      return;
    }

    sessionStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(summary));

    let cancelled = false;
    (async () => {
      try {
        await saveDrinkRecord({
          milk_tea_name: summary.name,
          sweetness_original: summary.original,
          sweetness_target: summary.target,
          sugar_saved_grams: summary.sugar.grams,
          cup_size: `${summary.volumeMl}ml`,
          music_mode: summary.mode,
          duration_seconds: summary.durationSeconds,
        });

        if (
          summary.mode === "ai" &&
          summary.saveToLibrary &&
          summary.generatedAudioUrl
        ) {
          await saveTrack({
            title: summary.trackTitle || `${summary.name} sweetness track`,
            drink_name: summary.name,
            audio_url: summary.generatedAudioUrl,
            emotion: summary.trackEmotion,
            tempo: summary.trackTempo,
          });
          if (!cancelled) setTrackSaved(true);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error("Couldn't save your session.");
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [summary, navigate]);

  if (!summary) return null;

  const { name, mode, original, target, cupLabel, durationSeconds, sugar } = summary;

  return (
    <div className="min-h-screen bg-gradient-soft">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <header className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-hero shadow-glow">
            <Sparkles className="h-10 w-10 text-primary-foreground" />
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Session complete 🌷</p>
          <h1 className="mt-1 font-display text-3xl">{name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "ai" ? "AI Music" : "Curated Playlist"} · Cup {original}/10 → feel {target}/10
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cupLabel} · Listened for {formatDuration(durationSeconds)}
          </p>
        </header>

        <section className="mt-8 rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-glow">
          {sugar.grams > 0 ? (
            <>
              <p className="text-sm opacity-90">Sugar you skipped this session</p>
              <p className="mt-2 font-display text-5xl">−{sugar.grams}g</p>
              <p className="mt-3 text-sm opacity-90">
                {cupLabel} · ≈ {sugar.cubes} sugar cubes · {sugar.cokeBottles} cans of cola · {sugar.kcal} kcal saved
              </p>
            </>
          ) : (
            <>
              <p className="text-sm opacity-90">No extra sugar skipped</p>
              <p className="mt-2 text-sm opacity-90">
                Cup and felt sweetness are the same — music still matched your vibe.
              </p>
            </>
          )}
          {saving && (
            <p className="mt-4 text-xs opacity-90">Saving session…</p>
          )}
          {!saving && mode === "ai" && summary.saveToLibrary && trackSaved && (
            <p className="mt-4 text-xs opacity-90">AI track saved to Library ✓</p>
          )}
        </section>

        <div className="mt-8 space-y-2">
          <Button
            variant="hero"
            size="xl"
            className="w-full"
            onClick={() => {
              sessionStorage.removeItem(SESSION_SUMMARY_KEY);
              navigate("/experience");
            }}
          >
            Another session
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button
            variant="soft"
            size="xl"
            className="w-full"
            onClick={() => {
              sessionStorage.removeItem(SESSION_SUMMARY_KEY);
              navigate("/");
            }}
          >
            <Home className="mr-2 h-5 w-5" />
            Done
          </Button>
        </div>
      </main>
    </div>
  );
}
