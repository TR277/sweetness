import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      const v = l.slice(i + 1).trim().replace(/^"|"$/g, "");
      return [k, v];
    }),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const { error, count } = await supabase
  .from("drink_records")
  .delete({ count: "exact" })
  .is("user_id", null);

if (error) {
  console.error("Failed to clear drink_records:", error.message);
  if (error.message.includes("policy")) {
    console.error("\nRun first: supabase db push --project-ref fgjazcagjyjcmdpnqsys");
    console.error("Or apply migration 20260530000000_drink_records_delete.sql in Supabase SQL editor.");
  }
  process.exit(1);
}

console.log(`Cleared ${count ?? 0} drink record(s) from Supabase.`);
