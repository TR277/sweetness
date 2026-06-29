import { useEffect, useMemo, useState } from "react";
import { listDrinkRecords, totalSugarSaved, DrinkRecord } from "@/lib/storage";
import { Calendar } from "@/components/ui/calendar";
import { Droplets, Cookie, GlassWater } from "lucide-react";
import { cn } from "@/lib/utils";

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function Data() {
  const [records, setRecords] = useState<DrinkRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();

  useEffect(() => {
    (async () => {
      try {
        const [recs, t] = await Promise.all([listDrinkRecords(100), totalSugarSaved()]);
        setRecords(recs as DrinkRecord[]);
        setTotal(t);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const sugarByDay = useMemo(() => {
    const acc: Record<string, { grams: number; count: number }> = {};
    for (const r of records) {
      if (!r.created_at) continue;
      const key = toDateKey(new Date(r.created_at));
      if (!acc[key]) acc[key] = { grams: 0, count: 0 };
      acc[key].grams += Number(r.sugar_saved_grams || 0);
      acc[key].count += 1;
    }
    return acc;
  }, [records]);

  const activeDayKeys = useMemo(() => new Set(Object.keys(sugarByDay)), [sugarByDay]);

  const defaultMonth = useMemo(() => {
    const latest = records.find((r) => r.created_at)?.created_at;
    return latest ? new Date(latest) : new Date();
  }, [records]);

  const selectedStats = selectedDay ? sugarByDay[toDateKey(selectedDay)] : undefined;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Your impact</p>
        <h1 className="font-display text-3xl">Sugar saved</h1>
      </header>

      <div className="rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-glow">
        <p className="text-sm opacity-90">All time</p>
        <p className="mt-1 font-display text-5xl">{total.toFixed(0)}g</p>
        <p className="mt-1 text-sm opacity-90">across {records.length} sessions</p>
      </div>

      <section className="grid grid-cols-3 gap-2">
        <Stat icon={<Cookie className="h-4 w-4" />} value={(total / 4).toFixed(0)} label="sugar cubes" />
        <Stat icon={<GlassWater className="h-4 w-4" />} value={(total / 39).toFixed(1)} label="cans of cola" />
        <Stat icon={<Droplets className="h-4 w-4" />} value={(total * 4).toFixed(0)} label="kcal saved" />
      </section>

      <section className="overflow-hidden rounded-3xl bg-card shadow-soft">
        {records.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <>
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={setSelectedDay}
              defaultMonth={defaultMonth}
              showOutsideDays={false}
              modifiers={{
                session: (date) => activeDayKeys.has(toDateKey(date)),
              }}
              modifiersClassNames={{
                session:
                  "bg-gradient-hero font-semibold text-primary-foreground shadow-soft hover:bg-gradient-hero hover:text-primary-foreground focus:bg-gradient-hero focus:text-primary-foreground",
              }}
              className="w-full p-4 pt-5"
              classNames={{
                months: "w-full",
                month: "w-full space-y-4",
                caption: "relative flex items-center justify-center",
                caption_label: "font-display text-lg",
                nav: "flex items-center",
                nav_button:
                  "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-soft hover:bg-muted hover:text-foreground",
                nav_button_previous: "absolute left-0",
                nav_button_next: "absolute right-0",
                table: "w-full border-collapse",
                head_row: "flex w-full",
                head_cell:
                  "flex-1 pb-2 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground",
                row: "mt-1 flex w-full",
                cell: "relative flex flex-1 items-center justify-center p-0",
                day: cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-full p-0 text-sm font-normal transition-soft",
                  "hover:bg-muted/80 aria-selected:opacity-100",
                ),
                day_selected: "ring-2 ring-primary/50 ring-offset-2 ring-offset-card",
                day_today: "font-semibold text-primary",
                day_outside: "text-muted-foreground/30",
                day_disabled: "text-muted-foreground/30",
              }}
            />

            {selectedDay && selectedStats && (
              <div className="border-t border-border/50 bg-muted/20 px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground">
                  {selectedDay.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-0.5 font-display text-2xl text-primary">−{selectedStats.grams.toFixed(0)}g</p>
                <p className="text-xs text-muted-foreground">
                  {selectedStats.count} session{selectedStats.count === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted-foreground">All sessions</h2>
        <div className="space-y-2">
          {records.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
              No sessions yet.
            </p>
          )}
          {records.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-soft">
              <div>
                <p className="text-sm font-medium">{r.milk_tea_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.created_at && new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <p className="font-display text-primary">−{Number(r.sugar_saved_grams).toFixed(0)}g</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center shadow-soft">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="font-display text-lg">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
