import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export interface DrinkRecord {
  id?: string;
  milk_tea_name: string;
  sweetness_original: number;
  sweetness_target: number;
  sugar_saved_grams: number;
  cup_size?: string | null;
  music_mode: "ai" | "spotify";
  duration_seconds: number;
  created_at?: string;
}

const LOCAL_RECORDS_KEY = "sweetness_drink_records_v1";

let drinkRecordsMigrated = false;

function readLocalRecords(): DrinkRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DrinkRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalRecords(records: DrinkRecord[]) {
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(records.slice(0, 200)));
}

function saveLocalRecord(rec: Omit<DrinkRecord, "id" | "created_at">): DrinkRecord {
  const record: DrinkRecord = {
    ...rec,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const existing = readLocalRecords();
  writeLocalRecords([record, ...existing]);
  return record;
}

async function migrateLocalDrinkRecordsToSupabase() {
  if (!isSupabaseConfigured() || drinkRecordsMigrated) return;
  drinkRecordsMigrated = true;

  const local = readLocalRecords();
  if (local.length === 0) return;

  for (const rec of local) {
    const { error } = await supabase.from("drink_records").upsert({
      id: rec.id,
      milk_tea_name: rec.milk_tea_name,
      sweetness_original: rec.sweetness_original,
      sweetness_target: rec.sweetness_target,
      sugar_saved_grams: rec.sugar_saved_grams,
      cup_size: rec.cup_size ?? null,
      music_mode: rec.music_mode,
      duration_seconds: rec.duration_seconds,
      created_at: rec.created_at,
    });
    if (error) {
      console.warn("drink_records migration skipped:", error.message);
      return;
    }
  }

  writeLocalRecords([]);
}

export async function saveDrinkRecord(rec: Omit<DrinkRecord, "id" | "created_at">) {
  await migrateLocalDrinkRecordsToSupabase();

  if (!isSupabaseConfigured()) {
    return saveLocalRecord(rec);
  }

  const { data, error } = await supabase.from("drink_records").insert(rec).select().single();
  if (error) {
    console.warn("Supabase saveDrinkRecord failed, using local backup:", error.message);
    return saveLocalRecord(rec);
  }
  return data;
}

export async function listDrinkRecords(limit = 50) {
  await migrateLocalDrinkRecordsToSupabase();

  let remote: DrinkRecord[] = [];

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from("drink_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      remote = data as DrinkRecord[];
    } else if (error) {
      console.warn("Supabase listDrinkRecords failed, using local backup:", error.message);
    }
  }

  const local = readLocalRecords();
  const seen = new Set(remote.map((r) => r.id));
  const merged = [...remote, ...local.filter((r) => r.id && !seen.has(r.id))];
  merged.sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
  );
  return merged.slice(0, limit);
}

export async function totalSugarSaved() {
  const records = await listDrinkRecords(200);
  return records.reduce((s, r) => s + Number(r.sugar_saved_grams || 0), 0);
}

export async function clearAllDrinkRecords() {
  if (isSupabaseConfigured()) {
    const { error } = await supabase.from("drink_records").delete().is("user_id", null);
    if (error) throw error;
  }
  writeLocalRecords([]);
}
