import { useCallback, useEffect, useRef, useState } from "react";
import { getValidAccessToken, isStoredTokenFresh } from "@/lib/spotifyAuth";
import {
  connectSpotifyPlayerFromGesture,
  getSpotifyDeviceId,
  isSpotifyPlayerPrepared,
  pauseSpotifyPlayback,
  prepareSpotifyPlayer,
  resetSpotifyPlayer,
  resumeSpotifyPlayback,
  startSpotifyPlayback,
  subscribeSpotifyPlayer,
} from "@/lib/spotifyPlayerManager";

export function useSpotifyPlayer(armed: boolean, onTrackEnded?: () => void) {
  const onTrackEndedRef = useRef(onTrackEnded);
  const [isReady, setIsReady] = useState(() => Boolean(getSpotifyDeviceId()));
  const [isPrepared, setIsPrepared] = useState(() => isSpotifyPlayerPrepared());
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    onTrackEndedRef.current = onTrackEnded;
  }, [onTrackEnded]);

  const runPrepare = useCallback(() => {
    setIsPreparing(true);
    return prepareSpotifyPlayer()
      .then((ok) => {
        setIsPrepared(ok);
        if (!ok) {
          setError("Could not prepare Spotify — Profile → Clear cache → Link Premium");
        }
        return ok;
      })
      .finally(() => {
        setIsPreparing(false);
      });
  }, []);

  useEffect(() => {
    if (!armed) {
      setIsReady(Boolean(getSpotifyDeviceId()));
      setIsPrepared(isSpotifyPlayerPrepared());
      setError(null);
      setIsConnecting(false);
      setIsPreparing(false);
      return;
    }

    void runPrepare();

    const unsubscribe = subscribeSpotifyPlayer({
      onReady: () => {
        setIsReady(true);
        setError(null);
        setIsConnecting(false);
      },
      onError: (message) => {
        setError(message);
        setIsReady(false);
        setIsConnecting(false);
      },
      onTrackEnded: () => onTrackEndedRef.current?.(),
    });

    return unsubscribe;
  }, [armed, runPrepare]);

  const activatePlayer = useCallback(() => {
    if (!armed || isConnecting) return Promise.resolve(isReady);
    if (isReady && getSpotifyDeviceId()) return Promise.resolve(true);

    if (!isSpotifyPlayerPrepared()) {
      setError("Still preparing — wait a moment, then tap Enable Player again");
      return Promise.resolve(false);
    }

    setIsConnecting(true);
    setError(null);

    return connectSpotifyPlayerFromGesture()
      .then(() => {
        setIsReady(true);
        return true;
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Spotify player failed to start";
        setError(message);
        setIsReady(false);
        return false;
      })
      .finally(() => {
        setIsConnecting(false);
      });
  }, [armed, isConnecting, isReady]);

  const retryConnect = useCallback(() => {
    resetSpotifyPlayer();
    setIsReady(false);
    setIsPrepared(false);
    setError(null);
    setIsConnecting(true);

    const connect = () =>
      connectSpotifyPlayerFromGesture()
        .then(() => {
          setIsReady(true);
          setIsPrepared(true);
          return true;
        })
        .catch((e: unknown) => {
          const message = e instanceof Error ? e.message : "Spotify player failed to start";
          setError(message);
          setIsReady(false);
          return false;
        });

    const done = isStoredTokenFresh()
      ? connect()
      : runPrepare().then((ok) => (ok ? connect() : false));

    return done.finally(() => setIsConnecting(false));
  }, [runPrepare]);

  const playTrack = useCallback(async (trackId: string) => {
    const token = await getValidAccessToken();
    const id = getSpotifyDeviceId();
    if (!token || !id) throw new Error("Spotify player not ready");
    await startSpotifyPlayback(token, id, trackId);
  }, []);

  const pause = useCallback(async () => {
    await pauseSpotifyPlayback();
  }, []);

  const resume = useCallback(async () => {
    await resumeSpotifyPlayback();
  }, []);

  return {
    isReady,
    isPrepared,
    isPreparing,
    isConnecting,
    error,
    playTrack,
    pause,
    resume,
    activatePlayer,
    retryConnect,
  };
}
