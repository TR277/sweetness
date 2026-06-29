import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const DB_NAME = "sweetness_music_library";
const STORE = "tracks";
const LEGACY_KEY = "sweetness_music_library";
const MAX_TRACKS = 20;

export interface SavedTrack {
  id: string;
  title: string;
  drink_name: string;
  audio_url: string;
  emotion?: string;
  tempo?: number;
  playback_mode?: "once" | "loop";
  created_at: string;
}

function rowToTrack(row: {
  id: string;
  title: string;
  drink_name: string;
  audio_url: string;
  emotion: string | null;
  tempo: number | null;
  playback_mode: string;
  created_at: string;
}): SavedTrack {
  return {
    id: row.id,
    title: row.title,
    drink_name: row.drink_name,
    audio_url: row.audio_url,
    emotion: row.emotion ?? undefined,
    tempo: row.tempo ?? undefined,
    playback_mode: row.playback_mode === "loop" ? "loop" : "once",
    created_at: row.created_at,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function readLocalTracks(): Promise<SavedTrack[]> {
  try {
    return await withStore("readonly", (store) => store.getAll());
  } catch {
    return [];
  }
}

async function writeLocalTracks(tracks: SavedTrack[]) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    tracks.slice(0, MAX_TRACKS).forEach((t) => store.put(t));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function migrateFromLegacyLocalStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SavedTrack[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    void writeLocalTracks(parsed).then(() => localStorage.removeItem(LEGACY_KEY));
  } catch {
    /* ignore */
  }
}

let migrated = false;

async function migrateLocalToSupabase() {
  if (!isSupabaseConfigured() || migrated) return;
  migrated = true;
  migrateFromLegacyLocalStorage();

  const local = await readLocalTracks();
  if (local.length === 0) return;

  for (const track of local) {
    const { error } = await supabase.from("saved_tracks").upsert({
      id: track.id,
      title: track.title,
      drink_name: track.drink_name,
      audio_url: track.audio_url,
      emotion: track.emotion ?? null,
      tempo: track.tempo ?? null,
      playback_mode: track.playback_mode ?? "once",
      created_at: track.created_at,
    });
    if (error) {
      console.warn("saved_tracks migration skipped:", error.message);
      return;
    }
  }

  await writeLocalTracks([]);
}

async function listRemoteTracks(): Promise<SavedTrack[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("saved_tracks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_TRACKS);

  if (error) {
    console.warn("listSavedTracks remote failed:", error.message);
    return [];
  }

  return (data ?? []).map(rowToTrack);
}

export async function listSavedTracks(): Promise<SavedTrack[]> {
  await migrateLocalToSupabase();

  const remote = await listRemoteTracks();
  if (remote.length > 0) return remote;

  const local = await readLocalTracks();
  return local.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function saveTrack(input: {
  title: string;
  drink_name: string;
  audio_url: string;
  emotion?: string;
  tempo?: number;
}): Promise<SavedTrack> {
  await migrateLocalToSupabase();

  const track: SavedTrack = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    playback_mode: "once",
    ...input,
  };

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from("saved_tracks")
      .insert({
        id: track.id,
        title: track.title,
        drink_name: track.drink_name,
        audio_url: track.audio_url,
        emotion: track.emotion ?? null,
        tempo: track.tempo ?? null,
        playback_mode: track.playback_mode ?? "once",
        created_at: track.created_at,
      })
      .select("*")
      .single();

    if (!error && data) {
      return rowToTrack(data);
    }
    console.warn("saveTrack remote failed, using local backup:", error?.message);
  }

  const existing = await readLocalTracks();
  await writeLocalTracks([track, ...existing]);
  return track;
}

export async function deleteSavedTrack(id: string) {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("saved_tracks").delete().eq("id", id);
    if (error) console.warn("deleteSavedTrack remote:", error.message);
  }

  const existing = await readLocalTracks();
  await writeLocalTracks(existing.filter((t) => t.id !== id));
}

export async function renameSavedTrack(id: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title cannot be empty");

  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("saved_tracks").update({ title: trimmed }).eq("id", id);
    if (error) throw error;
    return;
  }

  const existing = await readLocalTracks();
  await writeLocalTracks(existing.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
}

export async function updateSavedTrackPlaybackMode(id: string, playback_mode: "once" | "loop") {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("saved_tracks").update({ playback_mode }).eq("id", id);
    if (error) throw error;
    return;
  }

  const existing = await readLocalTracks();
  await writeLocalTracks(existing.map((t) => (t.id === id ? { ...t, playback_mode } : t)));
}

export async function clearAllSavedTracks() {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("saved_tracks").delete().is("user_id", null);
    if (error) throw error;
  }
  await writeLocalTracks([]);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
