import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Pause, Play, Square, Music, Sparkles, ArrowLeft, SkipForward, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDrinkSession } from "@/hooks/useDrinkSession";
import { DrinkState, calcSugarSaved, buildMusicParams, normalizeMusicParams, buildSpotifySeedsForRecommend, ParsedMusicParams, parseVolumeMl, formatCupLabel, TeaCategory, SweetnessLevel } from "@/lib/sweetness";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";
import { isSpotifyConfigured } from "@/lib/spotifyAuth";
import { useSpotifyAccount } from "@/hooks/useSpotifyAccount";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { onSpotifyAccountLinked } from "@/lib/spotifyPlayerManager";
import { SESSION_SUMMARY_KEY, type SessionSummaryState } from "@/pages/SessionSummary";
import {
  ensureAudioContext,
  ensureMediaElementRoute,
  HIDDEN_AUDIO_CLASS,
} from "@/lib/audioOutput";

interface MusicParams {
  timbre: string;
  tempo: number;
  brightness: number;
  energy: number;
  emotion: string;
  description: string;
  spotify_seeds?: Record<string, unknown>;
}

interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  album_image?: string;
  preview_url: string | null;
  external_url?: string;
  duration_ms?: number;
}

interface GeneratedAudio {
  audio_url: string;
  provider?: string;
  provider_track_id?: string;
}

function formatTime(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function probePreviewUrl(url: string, timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "auto";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.src = "";
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    audio.addEventListener("canplay", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });
    audio.src = url;
    audio.load();
  });
}

export default function Session() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const mode = (search.get("mode") || "ai") as "ai" | "spotify";
  const name = search.get("name") || "My Drink";
  const category = (search.get("category") || "original") as TeaCategory;
  const rawOriginal = Number(search.get("original") || 3);
  const rawTarget = Number(search.get("target") || 7);
  const original = Math.min(10, Math.max(1, rawOriginal)) as SweetnessLevel;
  const target = Math.max(original, Math.min(10, Math.max(1, rawTarget))) as SweetnessLevel;
  const volumeMl = parseVolumeMl(search.get("volume"), search.get("cup"));
  const pref = search.get("pref") || "";

  const cupLabel = formatCupLabel(volumeMl);

  const sessionReturnPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("spotify");
    const q = params.toString();
    return `${location.pathname}${q ? `?${q}` : ""}`;
  }, [location.pathname, location.search]);

  const { state, elapsedMs, activeTrigger, scheduleKind, start, pause, resume } = useDrinkSession();
  const [params, setParams] = useState<MusicParams | null>(null);
  const [loadingParams, setLoadingParams] = useState(true);
  const [oscillatorOn, setOscillatorOn] = useState(false);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [trackIdx, setTrackIdx] = useState(0);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(null);
  const [loadingGeneratedAudio, setLoadingGeneratedAudio] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [preferAmbient, setPreferAmbient] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const spotify = useSpotifyAccount();
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const useSpotify = mode === "spotify";
  const currentTrack = tracks[trackIdx];
  const spotifyToken = spotify.token;
  const spotifyPremium = spotify.premium;

  useEffect(() => {
    if (search.get("spotify") !== "connected") return;
    onSpotifyAccountLinked();
    toast.success("Spotify Premium linked.");
    void spotify.refresh();
    const next = new URLSearchParams(search);
    next.delete("spotify");
    setSearch(next, { replace: true });
  }, [search, setSearch, spotify]);

  const sugar = useMemo(() => calcSugarSaved(original, target, volumeMl), [original, target, volumeMl]);
  const fallback = useMemo(
    () => buildMusicParams({ milkTeaName: name, category, sweetnessTarget: target, musicPreference: pref }),
    [category, target, name, pref],
  );

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mediaGainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const audioSrc = useSpotify ? currentTrack?.preview_url ?? null : generatedAudio?.audio_url ?? null;
  const shouldPlayAudio = state === DrinkState.DRINKING;

  const sdkEnabled =
    useSpotify &&
    Boolean(spotifyToken) &&
    spotifyPremium === true &&
    !preferAmbient &&
    isSpotifyConfigured();

  const handleSpotifyTrackEnded = useCallback(() => {
    if (state === DrinkState.DRINKING && tracks.length > 1) {
      setTrackIdx((i) => (i + 1) % tracks.length);
    }
  }, [state, tracks.length]);

  const { isReady: spotifyPlayerReady, playTrack, pause: pauseSpotify, resume: resumeSpotify, activatePlayer } =
    useSpotifyPlayer(sdkEnabled, handleSpotifyTrackEnded);
  const sdkPlaybackActive = sdkEnabled && spotifyPlayerReady;

  const spotifyPreviewActive =
    useSpotify &&
    Boolean(currentTrack?.preview_url) &&
    !previewBlocked &&
    !preferAmbient &&
    !sdkPlaybackActive;
  const htmlAudioActive = spotifyPreviewActive || (!useSpotify && Boolean(generatedAudio?.audio_url));
  const ambientActive = useSpotify ? !sdkPlaybackActive && !spotifyPreviewActive : !generatedAudio?.audio_url;

  const markPreviewUnavailable = useCallback(() => {
    if (!useSpotify || preferAmbient) return;
    setPreviewBlocked(true);
    toast.info("Spotify preview isn't available in this browser/network — switched to ambient tone.");
  }, [useSpotify, preferAmbient]);

  useEffect(() => {
    setPreviewBlocked(false);
  }, [trackIdx]);

  const spotifyPausedBySessionRef = useRef(false);

  useEffect(() => {
    if (!sdkPlaybackActive || !currentTrack) return;
    if (state === DrinkState.DRINKING) {
      const play = spotifyPausedBySessionRef.current
        ? resumeSpotify().catch(() => playTrack(currentTrack.id))
        : playTrack(currentTrack.id);
      spotifyPausedBySessionRef.current = false;
      void play.catch((e) => {
        console.error("Spotify SDK play failed:", e);
        toast.error("Spotify playback failed — trying fallback.");
        setPreferAmbient(true);
      });
    } else if (state === DrinkState.PAUSED) {
      spotifyPausedBySessionRef.current = true;
      void pauseSpotify();
    } else {
      void pauseSpotify();
    }
  }, [sdkPlaybackActive, state, currentTrack?.id, trackIdx, playTrack, pauseSpotify, resumeSpotify]);

  const prepareAudioForPlayback = useCallback(async () => {
    const el = audioElRef.current;
    if (!el || !audioSrc) return;
    await ensureMediaElementRoute(audioCtxRef, mediaSourceRef, mediaGainRef, el);
    if (el.getAttribute("src") !== audioSrc) {
      el.src = audioSrc;
      el.load();
    }
  }, [audioSrc]);

  const startDrinking = useCallback(() => {
    void (async () => {
      prepareAudioForPlayback();
      if (sdkEnabled && !spotifyPlayerReady) {
        await activatePlayer().catch(() => false);
      }
      start();
    })();
  }, [prepareAudioForPlayback, start, sdkEnabled, spotifyPlayerReady, activatePlayer]);

  const resumeDrinking = useCallback(() => {
    prepareAudioForPlayback();
    resume();
  }, [prepareAudioForPlayback, resume]);

  useEffect(() => {
    (async () => {
      setLoadingParams(true);
      let musicParams: MusicParams = fallback;

      try {
        const { data, error } = await supabase.functions.invoke("parse-music", {
          body: { milkTeaName: name, category, sweetnessTarget: target, musicPreference: pref },
        });
        if (error) throw error;
        if (data?.params) {
          musicParams = normalizeMusicParams(data.params as ParsedMusicParams, target, pref, name);
        }
      } catch (e) {
        console.warn("Falling back to local params:", e);
      }

      setParams(musicParams);

      if (useSpotify) {
        setLoadingTracks(true);
        try {
          const account = await spotify.refresh();
          const premium = account?.premium === true;

          const spotifySeeds = buildSpotifySeedsForRecommend(musicParams, target, pref);
          const { data: rec, error: recErr } = await supabase.functions.invoke("spotify-recommend", {
            body: {
              spotify_seeds: spotifySeeds,
              target_tempo: musicParams.tempo,
              limit: 12,
              user_access_token: account?.token ?? undefined,
            },
          });
          if (recErr) throw recErr;

          const list: SpotifyTrack[] = rec?.tracks ?? [];
          setTracks(list);

          if (rec?.warning) {
            toast.warning(String(rec.warning));
          }

          if (list.length === 0) {
            setPreviewBlocked(true);
            const detail = rec?.error || rec?.source || "empty response";
            console.warn("spotify-recommend returned no tracks:", detail, rec);
            toast.error(`Spotify returned no tracks (${detail}). Check Supabase Secrets and Spotify App settings.`);
          } else if (account?.token && premium) {
            toast.success(`Loaded ${list.length} tracks — Spotify Premium can play full songs.`);
          } else if (list.length > 0 && rec?.source === "search_fallback") {
            toast.success(`Loaded ${list.length} tracks from Spotify.`);
          } else {
            const playable = list.filter((t) => t.preview_url);
            if (playable.length === 0) {
              setPreviewBlocked(true);
              toast.info("No previews available. Connect Spotify Premium to play full tracks.");
            } else {
              const previewOk = await probePreviewUrl(playable[0].preview_url!);
              if (!previewOk) {
                setPreviewBlocked(true);
                toast.info("Preview unavailable. Connect Spotify Premium to play full tracks.");
              }
            }
          }
        } catch (err) {
          console.error("spotify-recommend failed:", err);
          toast.error("Couldn't load Spotify tracks — using ambient tone.");
        } finally {
          setLoadingTracks(false);
        }
      }

      setLoadingParams(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    void ensureMediaElementRoute(audioCtxRef, mediaSourceRef, mediaGainRef, el);
  }, []);

  useEffect(() => {
    const needsHtml = htmlAudioActive && shouldPlayAudio;
    const needsAmbient = state === DrinkState.DRINKING && ambientActive;
    if (needsHtml || needsAmbient) return;
    void audioCtxRef.current?.suspend();
  }, [htmlAudioActive, shouldPlayAudio, state, ambientActive]);

  // Ambient synth when Spotify preview is unavailable or AI audio is missing.
  useEffect(() => {
    const playing = state === DrinkState.DRINKING;
    setOscillatorOn(playing && ambientActive);
    if (playing && params && ambientActive) {
      void (async () => {
        try {
          const ctx = await ensureAudioContext(audioCtxRef);
          if (!ctx) throw new Error("AudioContext is not supported in this browser");
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const baseFreq = 110 + params.brightness * 220;
          osc.type = "sine";
          osc.frequency.value = baseFreq;
          gain.gain.value = 0;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 1.5);
          oscRef.current = osc;
          gainRef.current = gain;
        } catch (e) {
          console.error(e);
        }
      })();
    } else if (oscRef.current && gainRef.current && audioCtxRef.current) {
      try {
        const ctx = audioCtxRef.current;
        gainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        oscRef.current.stop(ctx.currentTime + 0.5);
      } catch {
        // Ignore stop errors when oscillator is already stopped.
      }
      oscRef.current = null;
      gainRef.current = null;
    }
    return () => {
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch {
          // Ignore stop errors during cleanup.
        }
        oscRef.current = null;
      }
    };
  }, [state, params, ambientActive]);

  // Sync HTML audio element: load source, then play/pause with drinking state.
  useLayoutEffect(() => {
    const el = audioElRef.current;
    if (!el) return;

    el.loop = !useSpotify && Boolean(generatedAudio?.audio_url);

    if (!htmlAudioActive || !audioSrc) {
      el.pause();
      return;
    }

    const srcChanged = el.getAttribute("src") !== audioSrc;
    if (srcChanged) {
      el.src = audioSrc;
      el.load();
    }

    let cancelled = false;

    const applyPlayback = () => {
      if (cancelled) return;
      if (shouldPlayAudio) {
        void ensureMediaElementRoute(audioCtxRef, mediaSourceRef, mediaGainRef, el)
          .then(() => el.play())
          .catch(() => {
            if (!cancelled) markPreviewUnavailable();
          });
      } else {
        el.pause();
        if (state === DrinkState.IDLE) el.currentTime = 0;
      }
    };

    const onLoadError = () => {
      if (!cancelled) markPreviewUnavailable();
    };

    if (!srcChanged && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      applyPlayback();
    } else {
      el.addEventListener("canplay", applyPlayback, { once: true });
      el.addEventListener("error", onLoadError, { once: true });
    }

    return () => {
      cancelled = true;
      el.removeEventListener("error", onLoadError);
    };
  }, [audioSrc, shouldPlayAudio, htmlAudioActive, useSpotify, generatedAudio?.audio_url, state, markPreviewUnavailable]);

  useEffect(() => {
    const el = audioElRef.current;
    if (!el || !useSpotify) return;

    const onEnded = () => {
      if (state === DrinkState.DRINKING && tracks.length > 1) {
        setTrackIdx((i) => (i + 1) % tracks.length);
      }
    };

    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [useSpotify, state, tracks.length]);

  useEffect(() => {
    if (useSpotify || !params) return;
    let cancelled = false;
    (async () => {
      setLoadingGeneratedAudio(true);
      try {
        const { data: generated, error: genErr } = await supabase.functions.invoke("generate-music", {
          body: { milkTeaName: name, musicParams: params, durationSeconds: 20 },
        });
        if (genErr) throw genErr;
        if (!cancelled && generated?.audio_url) {
          setGeneratedAudio(generated);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("generate-music failed:", err);
          if (err instanceof FunctionsHttpError) {
            const detail = await err.context.json().catch(() => null) as { error?: string; detail?: string } | null;
            const msg = detail?.error || "AI music function returned an error.";
            toast.error(`${msg} Falling back to ambient tone.`);
          } else if (err instanceof FunctionsRelayError || err instanceof FunctionsFetchError) {
            toast.error("Cannot reach AI music function. Check function deployment and network.");
          } else {
            toast.error("Couldn't generate AI music — using ambient tone.");
          }
        }
      } finally {
        if (!cancelled) setLoadingGeneratedAudio(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useSpotify, params, name]);

  const handleSkip = () => {
    if (tracks.length === 0) return;
    setTrackIdx((i) => (i + 1) % tracks.length);
  };

  // Trigger pulse on sweetness boost
  useEffect(() => {
    if (!activeTrigger || !gainRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const peak = activeTrigger === "boost" ? 0.14 : activeTrigger === "sustain" ? 0.1 : 0.08;
    gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
    gainRef.current.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.4);
    gainRef.current.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 3.5);
  }, [activeTrigger]);

  const handleFinish = () => {
    if (leaving) return;
    setLeaving(true);

    void pauseSpotify();
    audioElRef.current?.pause();
    void audioCtxRef.current?.suspend();

    const summary: SessionSummaryState = {
      name,
      mode,
      original,
      target,
      cupLabel,
      volumeMl,
      durationSeconds: Math.floor(elapsedMs / 1000),
      sugar,
      saveToLibrary: !useSpotify && saveToLibrary && Boolean(generatedAudio?.audio_url),
      generatedAudioUrl: generatedAudio?.audio_url,
      trackTitle: params?.description?.slice(0, 80) || `${name} sweetness track`,
      trackEmotion: params?.emotion,
      trackTempo: params?.tempo,
    };

    sessionStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(summary));
    navigate("/summary", { state: summary, replace: true });
  };

  if (leaving) return null;

  return (
    <div className="space-y-5 pb-8">
      <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{mode === "ai" ? "AI Music" : "Curated Playlist"}</p>
        <h1 className="font-display text-3xl">{name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cup {original}/10 → feel {target}/10 · {cupLabel}
          {sugar.grams > 0 ? (
            <> · ≈ {sugar.grams}g sugar saved ({sugar.cubes} cubes, {sugar.cokeBottles} cola, {sugar.kcal} kcal)</>
          ) : (
            <> · music matched to your cup&apos;s sweetness</>
          )}
        </p>
      </header>

      {/* Visual orb */}
      <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
        <div className={cn(
          "absolute inset-0 rounded-full bg-gradient-hero blur-3xl opacity-60 transition-soft",
          oscillatorOn && "animate-pulse-sweet"
        )} />
        <div className={cn(
          "relative flex h-56 w-56 items-center justify-center rounded-full bg-gradient-hero shadow-glow transition-soft",
          oscillatorOn && "animate-pulse-sweet"
        )}>
          <div className="text-center text-primary-foreground">
            <p className="font-display text-5xl">{formatTime(elapsedMs)}</p>
            <p className="mt-1 text-xs uppercase tracking-widest opacity-90">{state.toLowerCase()}</p>
          </div>
        </div>
        {activeTrigger && (
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-card px-4 py-1.5 text-xs font-medium shadow-glow animate-float-slow">
            <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
            {activeTrigger === "boost" && "Sweetness boost ✨"}
            {activeTrigger === "sustain" && "Sweetness sustain 🌸"}
            {activeTrigger === "weak" && "Gentle re-cue 🍃"}
          </div>
        )}
      </div>

      {/* Music params card */}
      <div className="rounded-3xl bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Music className="h-4 w-4" />
          {loadingParams ? "Tuning your music..." : "Your sweetness profile"}
        </div>
        {params && !loadingParams && (
          <div className="mt-2 space-y-1">
            <p className="text-sm">{params.description}</p>
            <p className="text-xs text-muted-foreground">
              {params.timbre} · {Math.round(params.tempo)} BPM · {params.emotion}
            </p>
          </div>
        )}
        {scheduleKind && (
          <p className="mt-2 text-xs text-primary">
            {scheduleKind === "FULL" ? "Full sweetness cycle (10s + 20s)" : "Quick re-cue (3s)"}
          </p>
        )}
        {!useSpotify && loadingGeneratedAudio && (
          <p className="mt-2 text-xs text-muted-foreground">Generating AI audio track…</p>
        )}
        {!useSpotify && !loadingGeneratedAudio && generatedAudio?.audio_url && (
          <div className="mt-3 space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-primary">AI track is ready and will play while drinking.</p>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="save-library" className="text-xs font-normal text-muted-foreground">
                Save this track to Library
              </Label>
              <Switch
                id="save-library"
                checked={saveToLibrary}
                onCheckedChange={setSaveToLibrary}
              />
            </div>
          </div>
        )}
      </div>

      {/* Spotify now-playing */}
      {useSpotify && (
        <div className="rounded-3xl bg-card p-4 shadow-soft">
          {!isSpotifyConfigured() && (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              In-app playback requires <code className="text-[10px]">VITE_SPOTIFY_CLIENT_ID</code> in{" "}
              <code className="text-[10px]">.env</code> (same Client ID as your Spotify Developer app).
            </p>
          )}
          {isSpotifyConfigured() && !spotifyToken && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Link Spotify Premium here (recommended) — you&apos;ll return to this session after login.
              </p>
              <Button
                variant="hero"
                size="sm"
                className="w-full"
                onClick={() => spotify.connect(sessionReturnPath)}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Link Spotify Premium
              </Button>
              <Button variant="soft" size="sm" className="w-full" asChild>
                <Link to="/profile">Or link in Profile</Link>
              </Button>
            </div>
          )}
          {spotifyToken && spotifyPremium === false && (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              Linked account is not Premium — trying preview or ambient tone. Update in Profile.
            </p>
          )}
          {loadingTracks && (
            <p className="text-sm text-muted-foreground">Finding tracks on Spotify…</p>
          )}
          {!loadingTracks && currentTrack && (
            <div className="flex items-center gap-3">
              {currentTrack.album_image && (
                <img
                  src={currentTrack.album_image}
                  alt={`${currentTrack.name} album cover`}
                  className="h-14 w-14 rounded-xl object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{currentTrack.name}</p>
                <p className="truncate text-xs text-muted-foreground">{currentTrack.artists}</p>
                {shouldPlayAudio && sdkPlaybackActive && (
                  <p className="text-[10px] text-primary">Playing full track via Spotify</p>
                )}
                {shouldPlayAudio && spotifyPreviewActive && (
                  <p className="text-[10px] text-primary">Playing 30s Spotify preview</p>
                )}
                {shouldPlayAudio && ambientActive && (
                  <p className="text-[10px] text-primary">Playing ambient tone</p>
                )}
                {!shouldPlayAudio && previewBlocked && !sdkPlaybackActive && (
                  <p className="text-[10px] text-muted-foreground">
                    Preview unavailable · Connect Premium or use ambient tone
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {currentTrack.external_url && (
                  <a
                    href={currentTrack.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    aria-label="Open in Spotify"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <button
                  onClick={() => {
                    setPreferAmbient((v) => {
                      const next = !v;
                      if (!next) setPreviewBlocked(false);
                      return next;
                    });
                  }}
                  className="rounded-full px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                  title="Spotify previews often fail in-browser — switch to ambient tone"
                >
                  {preferAmbient || previewBlocked ? "Use preview" : "Use ambient"}
                </button>
                <button
                  onClick={handleSkip}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                  aria-label="Skip track"
                  disabled={tracks.length < 2}
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {!loadingTracks && !currentTrack && !loadingParams && (
            <p className="text-xs text-muted-foreground">No Spotify tracks found — playing ambient tone.</p>
          )}
          {previewBlocked && !sdkPlaybackActive && (
            <p className="mt-2 text-xs text-muted-foreground">
              30-second previews may not work on some networks. Connect Spotify Premium for full tracks.
            </p>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">Music data provided by Spotify.</p>
        </div>
      )}
      <audio ref={audioElRef} preload="auto" playsInline className={HIDDEN_AUDIO_CLASS} />

      {/* Controls */}
      <div className="space-y-2">
        {state === DrinkState.IDLE && (
          <Button
            variant="hero"
            size="xl"
            className="w-full"
            onClick={startDrinking}
          >
            <Play className="mr-2 h-5 w-5" />
            Start Drinking
          </Button>
        )}
        {state === DrinkState.DRINKING && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" size="xl" onClick={pause}>
              <Pause className="mr-2 h-5 w-5" /> Pause
            </Button>
            <Button variant="hero" size="xl" onClick={handleFinish}>
              <Square className="mr-2 h-5 w-5" /> Finish
            </Button>
          </div>
        )}
        {state === DrinkState.PAUSED && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="hero" size="xl" onClick={resumeDrinking}>
              <Play className="mr-2 h-5 w-5" /> Resume
            </Button>
            <Button variant="soft" size="xl" onClick={handleFinish}>
              <Square className="mr-2 h-5 w-5" /> Finish
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
