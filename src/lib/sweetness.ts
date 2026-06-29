// Sweetness Music — core domain logic (state machine, triggers, sugar math, mappings)

export enum DrinkState {
  IDLE = "IDLE",
  DRINKING = "DRINKING",
  PAUSED = "PAUSED",
  FINISHED = "FINISHED",
}

export type SweetnessLevel = 3 | 5 | 7 | 10;

export interface UserInput {
  milkTeaName: string;
  category: TeaCategory;
  sweetnessOriginal: SweetnessLevel;
  sweetnessTarget: SweetnessLevel;
  musicPreference?: string;
}

export type TeaCategory =
  | "original" | "cheese" | "caramel" | "chocolate" | "fruit"
  | "flower" | "matcha" | "coffee" | "nut" | "coconut"
  | "sparkling" | "herbal" | "milk" | "yogurt" | "smoothie";

export const TEA_CATEGORIES: { id: TeaCategory; label: string; emoji: string }[] = [
  { id: "original", label: "Original Milk Tea", emoji: "🧋" },
  { id: "cheese", label: "Cheese Foam", emoji: "🧀" },
  { id: "caramel", label: "Caramel / Brown Sugar", emoji: "🍯" },
  { id: "chocolate", label: "Chocolate", emoji: "🍫" },
  { id: "fruit", label: "Fruit Tea", emoji: "🍓" },
  { id: "flower", label: "Floral", emoji: "🌸" },
  { id: "matcha", label: "Matcha", emoji: "🍵" },
  { id: "coffee", label: "Coffee", emoji: "☕" },
  { id: "nut", label: "Nutty", emoji: "🌰" },
  { id: "coconut", label: "Coconut", emoji: "🥥" },
  { id: "sparkling", label: "Sparkling", emoji: "🫧" },
  { id: "herbal", label: "Herbal", emoji: "🌿" },
  { id: "milk", label: "Milk", emoji: "🥛" },
  { id: "yogurt", label: "Yogurt", emoji: "🍶" },
  { id: "smoothie", label: "Smoothie", emoji: "🥤" },
];

export const SWEETNESS_OPTIONS: SweetnessLevel[] = [3, 5, 7, 10];

export type CupSize = "small" | "medium" | "large";

/** Medium cup (500 ml) is the reference for sugar scaling. */
export const REFERENCE_CUP_ML = 500;
export const MIN_CUP_ML = 100;
export const MAX_CUP_ML = 2000;

export const CUP_SIZE_OPTIONS: {
  id: CupSize;
  label: string;
  volumeMl: number;
  emoji: string;
}[] = [
  { id: "small", label: "Small", volumeMl: 350, emoji: "🥤" },
  { id: "medium", label: "Medium", volumeMl: 500, emoji: "🧋" },
  { id: "large", label: "Large", volumeMl: 700, emoji: "🫗" },
];

export function clampCupVolumeMl(ml: number): number {
  return Math.round(Math.max(MIN_CUP_ML, Math.min(MAX_CUP_ML, ml)));
}

export function volumeToMultiplier(volumeMl: number): number {
  return clampCupVolumeMl(volumeMl) / REFERENCE_CUP_ML;
}

export function parseCupSize(value: string | null | undefined): CupSize | null {
  if (value === "small" || value === "medium" || value === "large") return value;
  return null;
}

export function parseVolumeMl(volumeParam: string | null, cupParam?: string | null): number {
  const parsed = Number(volumeParam);
  if (Number.isFinite(parsed) && parsed >= MIN_CUP_ML) {
    return clampCupVolumeMl(parsed);
  }
  const cup = parseCupSize(cupParam);
  if (cup) {
    return CUP_SIZE_OPTIONS.find((c) => c.id === cup)?.volumeMl ?? REFERENCE_CUP_ML;
  }
  return REFERENCE_CUP_ML;
}

export function formatCupLabel(volumeMl: number): string {
  const preset = CUP_SIZE_OPTIONS.find((c) => c.volumeMl === volumeMl);
  if (preset) return `${preset.label} (${volumeMl} ml)`;
  return `${volumeMl} ml`;
}

export function cupPresetForVolume(volumeMl: number): CupSize | null {
  return CUP_SIZE_OPTIONS.find((c) => c.volumeMl === volumeMl)?.id ?? null;
}

export const MUSIC_PREFERENCE_OPTIONS = [
  { id: "lofi", label: "Lo-fi", emoji: "🎧" },
  { id: "ambient", label: "Ambient", emoji: "🌌" },
  { id: "jazz", label: "Jazz Piano", emoji: "🎹" },
  { id: "acoustic", label: "Acoustic", emoji: "🎸" },
  { id: "bossa", label: "Bossa Nova", emoji: "🌴" },
  { id: "classical", label: "Classical", emoji: "🎼" },
  { id: "chillhop", label: "Chill Hop", emoji: "🧊" },
  { id: "dreampop", label: "Dream Pop", emoji: "✨" },
  { id: "strings", label: "Strings", emoji: "🎻" },
  { id: "marimba", label: "Marimba", emoji: "🪇" },
  { id: "folk", label: "Folk", emoji: "🪕" },
  { id: "synthpop", label: "Synth Pop", emoji: "🌆" },
] as const;

export type MusicPreferenceId = (typeof MUSIC_PREFERENCE_OPTIONS)[number]["id"];

// Timbre mapping (drink → instrument)
export const timbreMap: Record<TeaCategory, string> = {
  original: "soft pad",
  cheese: "airy pad + reverb",
  caramel: "warm low-mid synth",
  chocolate: "dark pad",
  fruit: "bright bell",
  flower: "airy flute",
  matcha: "soft muted pad",
  coffee: "piano + bass",
  nut: "warm pluck",
  coconut: "marimba",
  sparkling: "plucky synth",
  herbal: "airy noise",
  milk: "creamy soft pad",
  yogurt: "light tangy pluck",
  smoothie: "blended warm synth",
};

// Emotion → tempo / rhythm
export type Emotion = "relaxed" | "happy" | "healing" | "romantic" | "dreamy" | "nostalgic";
export const emotionMap: Record<Emotion, { tempo: number; rhythm: string }> = {
  relaxed: { tempo: 70, rhythm: "smooth" },
  happy: { tempo: 120, rhythm: "bouncy" },
  healing: { tempo: 85, rhythm: "flowing" },
  romantic: { tempo: 75, rhythm: "swaying" },
  dreamy: { tempo: 80, rhythm: "floating" },
  nostalgic: { tempo: 90, rhythm: "lofi" },
};

// Sweetness → music params (linear mapping into musical ranges)
export function sweetnessToMusicParams(target: SweetnessLevel) {
  const t = target / 10;
  return {
    pitch: 50 + t * 30, // MIDI-ish 50–80
    tempo: 70 + t * 50, // 70–120 BPM
    brightness: 0.3 + t * 0.6, // 0.3–0.9
  };
}

export function computeTempo(sweetnessTarget: number, musicPreference?: string): number {
  const t = Math.max(1, Math.min(10, Number(sweetnessTarget) || 5));
  let tempo = Math.round(70 + (t / 10) * 50);

  const p = musicPreference?.toLowerCase() ?? "";
  if (p.includes("folk") || p.includes("acoustic") || p.includes("ambient") || p.includes("classical") || p.includes("strings")) {
    tempo -= 12;
  } else if (p.includes("jazz") || p.includes("bossa")) {
    tempo -= 5;
  } else if (p.includes("dreampop") || p.includes("dream pop") || p.includes("synthpop") || p.includes("synth pop") || p.includes("marimba")) {
    tempo += 8;
  } else if (p.includes("chillhop") || p.includes("chill hop")) {
    tempo += 3;
  }

  return Math.max(60, Math.min(130, tempo));
}

export function buildDefaultSpotifySeeds(sweetnessTarget: number, musicPreference?: string) {
  const t = Math.max(1, Math.min(10, sweetnessTarget));
  const tempo = computeTempo(t, musicPreference);
  const energy = Math.max(0.25, Math.min(0.75, 0.25 + t * 0.05));
  return {
    seed_genres: t <= 4 ? ["chill", "acoustic"] : t <= 7 ? ["lo-fi", "indie"] : ["pop", "funk"],
    target_valence: Math.max(0.2, Math.min(0.9, 0.35 + t * 0.05)),
    target_energy: energy,
    target_acousticness: Math.max(0.2, Math.min(0.85, 0.8 - t * 0.06)),
    target_instrumentalness: t <= 5 ? 0.7 : 0.45,
    target_tempo: tempo,
  };
}

export interface ParsedMusicParams {
  timbre: string;
  tempo: number;
  brightness: number;
  energy: number;
  emotion: string;
  sweetness_target: number;
  spotify_seeds: ReturnType<typeof buildDefaultSpotifySeeds>;
  description: string;
}

function primaryTeaCategory(category: string): TeaCategory {
  const first = category.split(",")[0]?.trim();
  if (first && first in timbreMap) return first as TeaCategory;
  return "original";
}

function emotionForSweetness(t: number): Emotion {
  if (t <= 3) return "healing";
  if (t <= 5) return "dreamy";
  if (t <= 7) return "relaxed";
  return "happy";
}

export function spotifySeedsFromPreference(musicPreference: string, sweetnessTarget: number) {
  const base = buildDefaultSpotifySeeds(sweetnessTarget, musicPreference);
  const p = musicPreference.toLowerCase();
  let genres = [...base.seed_genres];
  let acousticness = base.target_acousticness;
  let instrumentalness = base.target_instrumentalness;

  if (p.includes("lo-fi") || p.includes("lofi") || p.includes("chillhop") || p.includes("chill hop")) {
    genres = ["lo-fi", "chill"];
  } else if (p.includes("jazz")) {
    genres = ["jazz", "bossa-nova"];
  } else if (p.includes("bossa")) {
    genres = ["bossa-nova", "latin"];
  } else if (p.includes("acoustic") || p.includes("folk")) {
    genres = ["acoustic", "folk"];
    acousticness = Math.max(acousticness, 0.75);
  } else if (p.includes("classical") || p.includes("strings")) {
    genres = ["classical", "ambient"];
    instrumentalness = Math.max(instrumentalness, 0.75);
  } else if (p.includes("ambient")) {
    genres = ["ambient", "chill"];
  } else if (p.includes("dreampop") || p.includes("dream pop") || p.includes("synthpop") || p.includes("synth pop")) {
    genres = ["indie-pop", "synth-pop"];
    acousticness = Math.min(acousticness, 0.45);
  } else if (p.includes("marimba")) {
    genres = ["world", "tropical"];
  }

  return { ...base, seed_genres: genres, target_acousticness: acousticness, target_instrumentalness: instrumentalness };
}

export function buildMusicParams(input: {
  milkTeaName: string;
  category: string;
  sweetnessTarget: number;
  musicPreference?: string;
}): ParsedMusicParams {
  const t = Math.max(1, Math.min(10, Number(input.sweetnessTarget) || 5));
  const m = sweetnessToMusicParams(Math.round(t) as SweetnessLevel);
  const emotion = emotionForSweetness(t);
  const pref = input.musicPreference?.trim() ?? "";
  const categoryTimbre = timbreMap[primaryTeaCategory(input.category)];
  const timbre = pref || categoryTimbre;
  const tempo = computeTempo(t, pref);
  const spotify_seeds = pref ? spotifySeedsFromPreference(pref, t) : buildDefaultSpotifySeeds(t);

  const description = pref
    ? `A ${emotion} ${pref} track for ${input.milkTeaName}, tuned to enhance perceived sweetness.`
    : `A ${emotion} ${categoryTimbre} soundscape for ${input.milkTeaName}, tuned to enhance perceived sweetness.`;

  return syncSpotifySeedsToParams({
    timbre,
    tempo,
    brightness: m.brightness,
    energy: Math.max(0.25, Math.min(0.75, 0.25 + (t / 10) * 0.5)),
    emotion,
    sweetness_target: t,
    spotify_seeds,
    description,
  });
}

/** Sync display tempo and Spotify target_tempo; re-apply preference after AI parse. */
export function normalizeMusicParams(
  params: ParsedMusicParams,
  sweetnessTarget: number,
  musicPreference: string | undefined,
  milkTeaName: string,
): ParsedMusicParams {
  const pref = musicPreference?.trim();
  const t = Math.max(1, Math.min(10, Number(sweetnessTarget) || params.sweetness_target || 5));
  const tempo = computeTempo(t, pref);
  let result: ParsedMusicParams = {
    ...params,
    sweetness_target: t,
    tempo,
    spotify_seeds: {
      ...params.spotify_seeds,
      target_tempo: tempo,
    },
  };
  if (pref) {
    result = applyMusicPreference(result, milkTeaName, pref);
  }
  return syncSpotifySeedsToParams(result);
}

/** Force user music preference to drive timbre, description, and Spotify seeds. */
export function applyMusicPreference(
  params: ParsedMusicParams,
  milkTeaName: string,
  musicPreference?: string,
): ParsedMusicParams {
  const pref = musicPreference?.trim();
  if (!pref) return syncSpotifySeedsToParams(params);
  const tempo = computeTempo(params.sweetness_target, pref);
  return syncSpotifySeedsToParams({
    ...params,
    tempo,
    timbre: pref,
    description: `A ${params.emotion} ${pref} track for ${milkTeaName}, tuned to enhance perceived sweetness.`,
    spotify_seeds: spotifySeedsFromPreference(pref, params.sweetness_target),
  });
}

/** Keep Spotify recommendation tempo/energy identical to AI generate-music params. */
export function syncSpotifySeedsToParams(params: ParsedMusicParams): ParsedMusicParams {
  const base =
    params.spotify_seeds ??
    buildDefaultSpotifySeeds(params.sweetness_target, params.timbre);
  return {
    ...params,
    spotify_seeds: {
      ...base,
      target_tempo: params.tempo,
      target_energy: params.energy,
    },
  };
}

/** Spotify API payload — always uses the same tempo as generate-music (`params.tempo`). */
export function buildSpotifySeedsForRecommend(
  params: Pick<ParsedMusicParams, "tempo" | "energy" | "spotify_seeds" | "sweetness_target">,
  sweetnessTarget: number,
  musicPreference?: string,
) {
  const tempo = params.tempo ?? computeTempo(sweetnessTarget, musicPreference);
  const energy =
    params.energy ??
    buildDefaultSpotifySeeds(sweetnessTarget, musicPreference).target_energy;
  const base =
    params.spotify_seeds ?? buildDefaultSpotifySeeds(sweetnessTarget, musicPreference);
  return { ...base, target_tempo: tempo, target_energy: energy };
}
// Sugar reduction
export const STANDARD_SUGAR_PER_LEVEL = 10; // grams per sweetness level

export function formatSugarEquivalents(grams: number) {
  const g = Math.max(0, grams);
  return {
    grams: g,
    cubes: +(g / 4).toFixed(1),
    cokeBottles: +(g / 39).toFixed(2),
    kcal: Math.round(g * 4),
  };
}

export function calcSugarSaved(
  drinkSweetness: SweetnessLevel,
  perceivedSweetness: SweetnessLevel,
  volumeMl: number = REFERENCE_CUP_ML,
) {
  const baseGrams = Math.max(0, (perceivedSweetness - drinkSweetness) * STANDARD_SUGAR_PER_LEVEL);
  const grams = baseGrams * volumeToMultiplier(volumeMl);
  return formatSugarEquivalents(grams);
}

// Sweetness trigger logic
export type TriggerKind = "boost" | "sustain" | "weak";
export interface TriggerSchedule {
  kind: "FULL" | "WEAK";
  events: { atMs: number; trigger: TriggerKind; label: string }[];
}

export function computeTriggerSchedule(pauseDurationMs?: number): TriggerSchedule {
  const isFirstOrLongPause = pauseDurationMs == null || pauseDurationMs > 20_000;
  if (isFirstOrLongPause) {
    return {
      kind: "FULL",
      events: [
        { atMs: 10_000, trigger: "boost", label: "Sweetness boost" },
        { atMs: 20_000, trigger: "sustain", label: "Sweetness sustain" },
      ],
    };
  }
  return {
    kind: "WEAK",
    events: [{ atMs: 3_000, trigger: "weak", label: "Gentle re-cue" }],
  };
}
