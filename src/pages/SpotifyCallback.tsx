import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { exchangeSpotifyCode, fetchSpotifyProfile, getValidAccessToken, saveSpotifyProfileCache } from "@/lib/spotifyAuth";

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Linking Spotify…");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const error = params.get("error");
      if (error) {
        setMessage(`Spotify login cancelled: ${error}`);
        window.setTimeout(() => navigate("/profile", { replace: true }), 2000);
        return;
      }

      const code = params.get("code");
      if (!code) {
        setMessage("Missing authorization code.");
        window.setTimeout(() => navigate("/profile", { replace: true }), 2000);
        return;
      }

      try {
        await exchangeSpotifyCode(code);
        const token = await getValidAccessToken();
        if (token) {
          const profile = await fetchSpotifyProfile(token);
          if (profile) saveSpotifyProfileCache(profile);
        }

        const returnPath =
          sessionStorage.getItem("spotify_return_path") ??
          localStorage.getItem("spotify_return_path") ??
          "/profile";
        sessionStorage.removeItem("spotify_return_path");
        localStorage.removeItem("spotify_return_path");

        const url = new URL(returnPath, window.location.origin);
        url.searchParams.set("spotify", "connected");
        navigate(`${url.pathname}${url.search}`, { replace: true });
      } catch (e) {
        console.error(e);
        setMessage("Could not link Spotify. Check Redirect URI matches this site URL.");
        window.setTimeout(() => navigate("/profile", { replace: true }), 3000);
      }
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
