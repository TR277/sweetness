import { User, Settings, Heart, Info, Trash2, Music2, Link2, Unlink, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearAllDrinkRecords } from "@/lib/storage";
import { clearAllSavedTracks } from "@/lib/musicLibrary";
import { onSpotifyAccountLinked, resetSpotifyPlayer } from "@/lib/spotifyPlayerManager";
import { useSpotifyAccount } from "@/hooks/useSpotifyAccount";
import { getSpotifyRedirectUri } from "@/lib/spotifyAuth";
import { clearAppCacheAndReload } from "@/lib/appCache";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function Profile() {
  const [clearing, setClearing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [search, setSearch] = useSearchParams();
  const spotify = useSpotifyAccount();
  const redirectUri = getSpotifyRedirectUri();

  useEffect(() => {
    if (search.get("spotify") === "connected") {
      onSpotifyAccountLinked();
      toast.success("Spotify Premium linked — ready for playlist sessions.");
      void spotify.refresh();
      search.delete("spotify");
      setSearch(search, { replace: true });
    }
    if (search.get("cache") === "cleared") {
      toast.success("Cache cleared — you can link Spotify again.");
      search.delete("cache");
      setSearch(search, { replace: true });
    }
  }, [search, setSearch, spotify]);

  const handleClearAll = async () => {
    if (!window.confirm("Clear all session records, saved music, and Spotify login? This cannot be undone.")) {
      return;
    }
    setClearing(true);
    try {
      await clearAllDrinkRecords();
      await clearAllSavedTracks();
      spotify.disconnect();
      resetSpotifyPlayer();
      toast.success("All records cleared.");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't clear all records. Try again or refresh the page.");
    } finally {
      setClearing(false);
    }
  };

  const handleDisconnect = () => {
    spotify.disconnect();
    toast.info("Spotify disconnected");
  };

  const handleClearCache = () => {
    if (
      !window.confirm(
        "Clear Spotify login cache and reset the in-app player?\n\nDrink records and saved music are kept. The page will reload.",
      )
    ) {
      return;
    }
    setClearingCache(true);
    clearAppCacheAndReload();
  };

  return (
    <div className="space-y-6">
      <header className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-hero shadow-glow">
          <User className="h-10 w-10 text-primary-foreground" />
        </div>
        <h1 className="mt-3 font-display text-2xl">Sweet Sipper</h1>
        <p className="text-sm text-muted-foreground">Anonymous · v1</p>
      </header>

      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Music2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-medium">Spotify Premium</p>
              <p className="text-xs text-muted-foreground">
                Link once here — playlist sessions will use it automatically.
              </p>
            </div>

            {!spotify.isConfigured && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Spotify Client ID is not configured for this build.
              </p>
            )}

            {spotify.isConfigured && spotify.loading && (
              <p className="text-xs text-muted-foreground">Checking Spotify…</p>
            )}

            {spotify.isConfigured && !spotify.loading && !spotify.isLinked && (
              <>
                <Button variant="hero" size="sm" className="w-full" onClick={() => spotify.connect("/profile")}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Link Spotify Premium
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  If Spotify shows &quot;redirect_uri: Not matching configuration&quot;, add this exact URI in{" "}
                  <a
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Spotify Developer Dashboard
                  </a>
                  {" "}→ Settings → Redirect URIs:
                </p>
                <code className="block break-all rounded-lg bg-muted/60 px-2 py-1.5 text-[10px]">{redirectUri}</code>
              </>
            )}

            {spotify.isConfigured && !spotify.loading && spotify.isLinked && (
              <div className="space-y-2">
                <p className="text-xs text-primary">
                  Linked · {spotify.displayName ?? "Spotify account"}
                  {spotify.isPremium ? " · Premium ✓" : " · Not Premium"}
                </p>
                {!spotify.isPremium && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    In-app full-track playback requires Spotify Premium.
                  </p>
                )}
                <Button variant="soft" size="sm" className="w-full" onClick={handleDisconnect}>
                  <Unlink className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Row icon={<Settings className="h-4 w-4" />} label="Preferences" hint="Music & defaults" />
        <Row icon={<Heart className="h-4 w-4" />} label="Favorite drinks" hint="Coming soon" />
        <Row icon={<Info className="h-4 w-4" />} label="About sweetness perception" hint="The science" />
      </section>

      <section className="rounded-3xl bg-card p-4 shadow-soft space-y-3">
        <div>
          <p className="text-sm font-medium">Clear cache</p>
          <p className="text-xs text-muted-foreground">
            Fixes stuck Spotify login or player issues. Clears tokens and player state, then reloads. Your drink history stays.
          </p>
        </div>
        <Button variant="soft" size="sm" className="w-full" onClick={handleClearCache} disabled={clearingCache}>
          <Eraser className="mr-2 h-4 w-4" />
          {clearingCache ? "Clearing…" : "Clear cache & reload"}
        </Button>
      </section>

      <Button
        variant="outline"
        className="w-full border-destructive/30 text-destructive hover:bg-destructive/5"
        onClick={() => void handleClearAll()}
        disabled={clearing}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {clearing ? "Clearing…" : "Clear all records"}
      </Button>

      <p className="px-2 text-center text-xs text-muted-foreground">
        Sweetness uses music to gently shift how sweet your drink tastes — letting you cut sugar without losing satisfaction.
      </p>
    </div>
  );
}

function Row({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
