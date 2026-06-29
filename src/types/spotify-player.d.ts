declare namespace Spotify {
  interface PlayerOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }

  interface WebPlaybackPlayer {
    device_id: string;
  }

  interface WebPlaybackError {
    message: string;
  }

  interface PlaybackTrack {
    id: string;
    uri: string;
    name: string;
  }

  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: {
      current_track: PlaybackTrack | null;
    };
  }

  interface Player {
    connect: () => Promise<boolean>;
    disconnect: () => void;
    addListener: (event: string, callback: (data: unknown) => void) => boolean;
    removeListener: (event: string, callback?: (data: unknown) => void) => boolean;
    getCurrentState: () => Promise<unknown>;
    setVolume: (volume: number) => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    togglePlay: () => Promise<void>;
    seek: (positionMs: number) => Promise<void>;
    previousTrack: () => Promise<void>;
    nextTrack: () => Promise<void>;
  }

  interface PlayerConstructor {
    new (options: PlayerOptions): Player;
  }

  interface SpotifyGlobal {
    Player: PlayerConstructor;
  }
}

interface Window {
  Spotify?: Spotify.SpotifyGlobal;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
