import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEA_CATEGORIES, SWEETNESS_OPTIONS, CUP_SIZE_OPTIONS, MUSIC_PREFERENCE_OPTIONS, calcSugarSaved, formatCupLabel, cupPresetForVolume, clampCupVolumeMl, TeaCategory, SweetnessLevel, CupSize } from "@/lib/sweetness";
import { cn } from "@/lib/utils";

type Mode = "ai" | "spotify";
type Step = "sweetness" | "mode" | "details";

export default function Experience() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("sweetness");
  const [mode, setMode] = useState<Mode>("ai");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<TeaCategory[]>(["original"]);
  const [drinkSweetness, setDrinkSweetness] = useState<SweetnessLevel>(3);
  const [perceivedSweetness, setPerceivedSweetness] = useState<SweetnessLevel>(7);
  const [volumeMl, setVolumeMl] = useState(500);
  const [cupPreset, setCupPreset] = useState<CupSize | null>("medium");
  const [customVolume, setCustomVolume] = useState("");
  const [pref, setPref] = useState("");
  const [selectedPrefId, setSelectedPrefId] = useState<string | null>(null);

  const selectPrefOption = (id: string) => {
    setSelectedPrefId(id);
    setPref(id);
  };

  const handlePrefInput = (value: string) => {
    setPref(value);
    const normalized = value.trim().toLowerCase();
    const match = MUSIC_PREFERENCE_OPTIONS.find(
      (o) => o.id === normalized || o.label.toLowerCase() === normalized,
    );
    setSelectedPrefId(match?.id ?? null);
  };

  const sugarPreview = useMemo(
    () => calcSugarSaved(drinkSweetness, perceivedSweetness, volumeMl),
    [drinkSweetness, perceivedSweetness, volumeMl],
  );

  const cupLabel = formatCupLabel(volumeMl);

  const selectCupPreset = (cup: CupSize) => {
    const option = CUP_SIZE_OPTIONS.find((c) => c.id === cup)!;
    setCupPreset(cup);
    setVolumeMl(option.volumeMl);
    setCustomVolume("");
  };

  const handleCustomVolume = (value: string) => {
    setCustomVolume(value);
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n)) return;
    const clamped = clampCupVolumeMl(n);
    setVolumeMl(clamped);
    setCupPreset(cupPresetForVolume(clamped));
  };

  const start = () => {
    const params = new URLSearchParams({
      mode,
      name: name || "My Drink",
      category: categories.join(",") || "original",
      original: String(drinkSweetness),
      target: String(perceivedSweetness),
      volume: String(volumeMl),
      pref,
    });
    if (cupPreset) params.set("cup", cupPreset);
    navigate(`/session?${params.toString()}`);
  };

  const toggleCategory = (id: TeaCategory) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const back = () => {
    if (step === "mode") setStep("sweetness");
    else if (step === "details") setStep("mode");
    else navigate(-1);
  };

  return (
    <div className="space-y-6 pb-8">
      <button onClick={back} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {step === "sweetness" && (
        <div className="space-y-5">
          <header>
            <p className="text-sm text-muted-foreground">Step 1 of 3</p>
            <h1 className="font-display text-3xl">Sweetness</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Set your cup&apos;s actual sweetness, then how sweet you want it to feel.
            </p>
          </header>

          <div className="space-y-2">
            <Label>This cup&apos;s sweetness</Label>
            <p className="text-xs text-muted-foreground">How sweet the drink actually is</p>
            <div className="grid grid-cols-4 gap-2">
              {SWEETNESS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setDrinkSweetness(s);
                    if (perceivedSweetness < s) setPerceivedSweetness(s);
                  }}
                  className={cn(
                    "rounded-2xl border py-4 font-display text-lg transition-soft",
                    drinkSweetness === s
                      ? "border-primary bg-primary text-primary-foreground shadow-button"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {s}/10
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sweetness you want to feel</Label>
            <p className="text-xs text-muted-foreground">
              Must be at least {drinkSweetness}/10 — music will fill the gap
            </p>
            <div className="grid grid-cols-4 gap-2">
              {SWEETNESS_OPTIONS.filter((s) => s >= drinkSweetness).map((s) => (
                <button
                  key={s}
                  onClick={() => setPerceivedSweetness(s)}
                  className={cn(
                    "rounded-2xl border py-4 font-display text-lg transition-soft",
                    perceivedSweetness === s
                      ? "border-primary bg-gradient-button text-primary-foreground shadow-button"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {s}/10
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cup size</Label>
            <p className="text-xs text-muted-foreground">More volume means more sugar saved at the same sweetness gap</p>
            <div className="grid grid-cols-3 gap-2">
              {CUP_SIZE_OPTIONS.map((cup) => (
                <button
                  key={cup.id}
                  type="button"
                  onClick={() => selectCupPreset(cup.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs transition-soft",
                    cupPreset === cup.id
                      ? "border-primary bg-primary/10 text-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <span className="text-xl">{cup.emoji}</span>
                  <span className="font-medium leading-tight">{cup.label}</span>
                  <span className="text-[10px] opacity-80">{cup.volumeMl} ml</span>
                </button>
              ))}
            </div>
            <Input
              type="number"
              min={100}
              max={2000}
              placeholder="Or enter volume (ml), e.g. 450"
              value={customVolume}
              onChange={(e) => handleCustomVolume(e.target.value)}
              className="rounded-2xl border-border bg-card"
            />
          </div>

          {sugarPreview.grams > 0 && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
              <p className="font-medium text-foreground">
                Music will help you feel +{perceivedSweetness - drinkSweetness} sweetness levels
              </p>
              <p className="mt-1 text-muted-foreground">
                {cupLabel} · ≈ {sugarPreview.grams}g sugar saved · {sugarPreview.cubes} cubes · {sugarPreview.cokeBottles} cola · {sugarPreview.kcal} kcal
              </p>
            </div>
          )}

          <Button variant="hero" size="xl" className="w-full" onClick={() => setStep("mode")}>
            Next
          </Button>
        </div>
      )}

      {step === "mode" && (
        <div className="space-y-5">
          <header>
            <p className="text-sm text-muted-foreground">Step 2 of 3</p>
            <h1 className="font-display text-3xl">Choose your mode</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cup {drinkSweetness}/10 → feel {perceivedSweetness}/10 · {cupLabel}
            </p>
          </header>

          <button
            onClick={() => { setMode("ai"); setStep("details"); }}
            className="w-full overflow-hidden rounded-3xl bg-gradient-hero p-6 text-left text-primary-foreground shadow-glow transition-soft hover:scale-[1.01]"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/25 p-3 backdrop-blur"><Sparkles className="h-6 w-6" /></div>
              <div>
                <p className="font-display text-xl">AI-Generated Music</p>
                <p className="text-sm opacity-90">Custom audio, tuned to your drink</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => { setMode("spotify"); setStep("details"); }}
            className="w-full overflow-hidden rounded-3xl border border-border bg-card p-6 text-left shadow-soft transition-soft hover:scale-[1.01]"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-accent p-3"><Music2 className="h-6 w-6 text-accent-foreground" /></div>
              <div>
                <p className="font-display text-xl">Curated Playlist</p>
                <p className="text-sm text-muted-foreground">Hand-picked tracks for your vibe</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {step === "details" && (
        <div className="space-y-5">
          <header>
            <p className="text-sm text-muted-foreground">Step 3 of 3</p>
            <h1 className="font-display text-3xl">About your drink</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "ai" ? "AI Music" : "Curated Playlist"} · {drinkSweetness}/10 → feel {perceivedSweetness}/10 · {cupLabel}
            </p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="name">Drink name</Label>
            <Input
              id="name"
              placeholder="e.g. Brown Sugar Pearl Milk Tea"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl border-border bg-card"
            />
          </div>

          <div className="space-y-2">
            <Label>Drink type <span className="text-xs text-muted-foreground">(select one or more)</span></Label>
            <div className="grid grid-cols-3 gap-2">
              {TEA_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs transition-soft",
                    categories.includes(c.id)
                      ? "border-primary bg-primary/10 text-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="leading-tight">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Music preference <span className="text-xs text-muted-foreground">(optional)</span></Label>
            <p className="text-xs text-muted-foreground">Pick a vibe or describe your own</p>
            <div className="grid grid-cols-3 gap-2">
              {MUSIC_PREFERENCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectPrefOption(option.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs transition-soft",
                    selectedPrefId === option.id
                      ? "border-primary bg-primary/10 text-foreground shadow-soft"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <span className="text-xl">{option.emoji}</span>
                  <span className="leading-tight">{option.label}</span>
                </button>
              ))}
            </div>
            <Input
              id="pref"
              placeholder="Or type your own, e.g. folk, lofi, jazz"
              value={pref}
              onChange={(e) => handlePrefInput(e.target.value)}
              className="rounded-2xl border-border bg-card"
            />
          </div>

          <Button variant="hero" size="xl" className="w-full" onClick={start}>
            Begin Session
          </Button>
        </div>
      )}
    </div>
  );
}
