import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Music, Play, Trash2, Pause, Pencil, Repeat, Repeat1, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteSavedTrack,
  listSavedTracks,
  renameSavedTrack,
  updateSavedTrackPlaybackMode,
  SavedTrack,
} from "@/lib/musicLibrary";
import { ensureMediaElementRoute, HIDDEN_AUDIO_CLASS } from "@/lib/audioOutput";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PlaybackMode = "once" | "loop";

function trackPlaybackMode(track: SavedTrack): PlaybackMode {
  return track.playback_mode ?? "once";
}

export default function Library() {
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedSrcRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mediaGainRef = useRef<GainNode | null>(null);

  const playingTrack = tracks.find((t) => t.id === playingId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTracks(await listSavedTracks());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useLayoutEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    void ensureMediaElementRoute(audioCtxRef, mediaSourceRef, mediaGainRef, el);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!playingId) {
      el.pause();
      loadedSrcRef.current = null;
      void audioCtxRef.current?.suspend();
      return;
    }

    const track = tracks.find((t) => t.id === playingId);
    if (!track) return;

    el.loop = trackPlaybackMode(track) === "loop";

    if (loadedSrcRef.current !== track.audio_url) {
      loadedSrcRef.current = track.audio_url;
      el.src = track.audio_url;
      el.load();
      void ensureMediaElementRoute(audioCtxRef, mediaSourceRef, mediaGainRef, el)
        .then(() => el.play())
        .catch(() => toast.error("Couldn't play this track."));
    }
  }, [playingId, tracks]);

  const togglePlay = (track: SavedTrack) => {
    setPlayingId((cur) => {
      if (cur === track.id) {
        loadedSrcRef.current = null;
        return null;
      }
      return track.id;
    });
  };

  const handleDelete = async (id: string) => {
    await deleteSavedTrack(id);
    if (playingId === id) setPlayingId(null);
    if (editingId === id) setEditingId(null);
    await refresh();
    toast.info("Track removed from Library.");
  };

  const handlePlaybackMode = async (id: string, mode: PlaybackMode) => {
    try {
      await updateSavedTrackPlaybackMode(id, mode);
      setTracks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, playback_mode: mode } : t)),
      );
      if (playingId === id && audioRef.current) {
        audioRef.current.loop = mode === "loop";
      }
    } catch (e) {
      console.error(e);
      toast.error("Couldn't update playback mode.");
    }
  };

  const startRename = (track: SavedTrack) => {
    setEditingId(track.id);
    setEditValue(track.title);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveRename = async (id: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      toast.error("Name cannot be empty.");
      return;
    }
    try {
      await renameSavedTrack(id, trimmed);
      setEditingId(null);
      setEditValue("");
      await refresh();
      toast.success("Track renamed.");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't rename track.");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Your sounds</p>
        <h1 className="font-display text-3xl">Library</h1>
      </header>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      ) : tracks.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
          <Music className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No saved tracks yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start AI Music → wait for track → enable save → Finish → come back here.
          </p>
        </section>
      ) : (
        <section className="space-y-2">
          {tracks.map((track) => {
            const mode = trackPlaybackMode(track);
            const isPlaying = playingId === track.id;

            return (
              <div key={track.id} className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => togglePlay(track)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    {editingId === track.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void saveRename(track.id);
                            if (e.key === "Escape") cancelRename();
                          }}
                          className="h-8 rounded-xl text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => void saveRename(track.id)}
                          aria-label="Save name"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={cancelRename}
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="truncate text-sm font-medium">{track.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{track.drink_name}</p>
                      </>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {isPlaying && (
                        <span className="text-primary">{mode === "loop" ? "Looping · " : "Playing once · "}</span>
                      )}
                      {track.emotion && `${track.emotion} · `}
                      {track.tempo ? `${Math.round(track.tempo)} BPM · ` : ""}
                      {new Date(track.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {editingId !== track.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground"
                        onClick={() => startRename(track)}
                        aria-label="Rename track"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground"
                        onClick={() => void handleDelete(track.id)}
                        aria-label="Delete track"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 pl-[52px]">
                  <span className="text-[10px] text-muted-foreground">Play</span>
                  <div className="flex gap-1 rounded-xl bg-muted/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => void handlePlaybackMode(track.id, "once")}
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-soft",
                        mode === "once"
                          ? "bg-background text-foreground shadow-soft"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Repeat1 className="h-3 w-3" />
                      Once
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePlaybackMode(track.id, "loop")}
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium transition-soft",
                        mode === "loop"
                          ? "bg-background text-foreground shadow-soft"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Repeat className="h-3 w-3" />
                      Loop
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <audio
        ref={audioRef}
        playsInline
        onEnded={() => {
          if (playingTrack && trackPlaybackMode(playingTrack) === "once") {
            setPlayingId(null);
          }
        }}
        className={HIDDEN_AUDIO_CLASS}
      />
    </div>
  );
}
