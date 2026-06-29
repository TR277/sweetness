import { useCallback, useEffect, useState } from "react";
import {
  clearSpotifyAuthCache,
  clearSpotifyProfileCache,
  fetchSpotifyProfile,
  getValidAccessToken,
  isSpotifyConfigured,
  loadSpotifyProfileCache,
  saveSpotifyProfileCache,
  startSpotifyLogin,
} from "@/lib/spotifyAuth";
import { resetSpotifyPlayer, clearSpotifyPlayerTokenCache } from "@/lib/spotifyPlayerManager";

export function useSpotifyAccount() {
  const [token, setToken] = useState<string | null>(null);
  const [premium, setPremium] = useState<boolean | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await getValidAccessToken();
      setToken(accessToken);
      if (!accessToken) {
        setPremium(null);
        setDisplayName(null);
        clearSpotifyProfileCache();
        return { token: null as string | null, premium: null as boolean | null };
      }

      const cached = loadSpotifyProfileCache();
      if (cached) {
        setPremium(cached.product === "premium");
        setDisplayName(cached.display_name ?? cached.email ?? "Spotify user");
      }

      const profile = await fetchSpotifyProfile(accessToken);
      if (profile) {
        saveSpotifyProfileCache(profile);
        setPremium(profile.product === "premium");
        setDisplayName(profile.display_name ?? profile.email ?? "Spotify user");
        return { token: accessToken, premium: profile.product === "premium" };
      }

      return { token: accessToken, premium: cached?.product === "premium" };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const connect = useCallback((returnPath = "/profile") => {
    void startSpotifyLogin(returnPath);
  }, []);

  const disconnect = useCallback(() => {
    clearSpotifyAuthCache();
    resetSpotifyPlayer();
    clearSpotifyPlayerTokenCache();
    setToken(null);
    setPremium(null);
    setDisplayName(null);
  }, []);

  return {
    token,
    premium,
    displayName,
    loading,
    refresh,
    connect,
    disconnect,
    isConfigured: isSpotifyConfigured(),
    isLinked: Boolean(token),
    isPremium: premium === true,
  };
}
