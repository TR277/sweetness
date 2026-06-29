type AudioContextCtor = typeof AudioContext;

export const HIDDEN_AUDIO_CLASS =
  "pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0";

export function getAudioContextClass(): AudioContextCtor | undefined {
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext;
}

/** Route <audio> through Web Audio so mobile browsers keep stereo on both ears. */
export async function ensureMediaElementRoute(
  ctxRef: { current: AudioContext | null },
  sourceRef: { current: MediaElementAudioSourceNode | null },
  gainRef: { current: GainNode | null },
  el: HTMLAudioElement | null,
) {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;

  if (!ctxRef.current) ctxRef.current = new Ctx();
  const ctx = ctxRef.current;

  if (el && !sourceRef.current) {
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    sourceRef.current = source;
    gainRef.current = gain;
  }

  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

export async function ensureAudioContext(ctxRef: { current: AudioContext | null }) {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;
  if (!ctxRef.current) ctxRef.current = new Ctx();
  const ctx = ctxRef.current;
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}
