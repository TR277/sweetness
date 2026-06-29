import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Droplet, ArrowRight, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { totalSugarSaved, listDrinkRecords, DrinkRecord } from "@/lib/storage";

export default function Home() {
  const [todayGrams, setTodayGrams] = useState(0);
  const [totalGrams, setTotalGrams] = useState(0);
  const [recent, setRecent] = useState<DrinkRecord[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [total, records] = await Promise.all([totalSugarSaved(), listDrinkRecords(5)]);
        setTotalGrams(total);
        setRecent(records as DrinkRecord[]);
        const today = new Date().toDateString();
        setTodayGrams(
          (records as DrinkRecord[])
            .filter((r) => r.created_at && new Date(r.created_at).toDateString() === today)
            .reduce((s, r) => s + Number(r.sugar_saved_grams || 0), 0)
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">Today</p>
        <h1 className="font-display text-3xl text-foreground">Hello, sweet sipper 🌷</h1>
      </header>

      <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-glow">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <p className="text-sm/5 opacity-90">Today's sugar saved</p>
          <p className="mt-1 font-display text-5xl font-semibold">
            {todayGrams.toFixed(0)}<span className="text-2xl font-medium">g</span>
          </p>
          <p className="mt-1 text-sm opacity-90">
            ≈ {(todayGrams / 4).toFixed(1)} sugar cubes
          </p>
        </div>
      </section>

      <Link to="/experience" className="block">
        <Button variant="hero" size="xl" className="w-full">
          <Sparkles className="mr-2 h-5 w-5" />
          Start a Sugar-Reduction Session
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </Link>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingDown className="h-4 w-4" />
            <span className="text-xs">All time</span>
          </div>
          <p className="mt-2 font-display text-2xl">{totalGrams.toFixed(0)}g</p>
          <p className="text-xs text-muted-foreground">sugar avoided</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Droplet className="h-4 w-4" />
            <span className="text-xs">Sessions</span>
          </div>
          <p className="mt-2 font-display text-2xl">{recent.length === 5 ? "5+" : recent.length}</p>
          <p className="text-xs text-muted-foreground">recent drinks</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted-foreground">Recent sips</h2>
        <div className="space-y-2">
          {recent.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              No sessions yet. Start your first one above 🧋
            </div>
          )}
          {recent.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-soft">
              <div>
                <p className="font-medium">{r.milk_tea_name}</p>
                <p className="text-xs text-muted-foreground">
                  cup {r.sweetness_original}/10 → feel {r.sweetness_target}/10
                  {r.cup_size ? ` · ${r.cup_size}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg text-primary">−{Number(r.sugar_saved_grams).toFixed(0)}g</p>
                <p className="text-xs text-muted-foreground capitalize">{r.music_mode}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
