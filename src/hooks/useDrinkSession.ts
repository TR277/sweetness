import { useCallback, useEffect, useRef, useState } from "react";
import {
  DrinkState,
  TriggerKind,
  TriggerSchedule,
  computeTriggerSchedule,
} from "@/lib/sweetness";

interface SessionEvent {
  atMs: number;
  trigger: TriggerKind;
  label: string;
}

export function useDrinkSession() {
  const [state, setState] = useState<DrinkState>(DrinkState.IDLE);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTrigger, setActiveTrigger] = useState<TriggerKind | null>(null);
  const [scheduleKind, setScheduleKind] = useState<"FULL" | "WEAK" | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0); // total drinking time before current segment
  const pauseAtRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number | null>(null); // ms-elapsed value when segment began
  const scheduleRef = useRef<SessionEvent[]>([]);
  const triggeredRef = useRef<Set<number>>(new Set());
  const tickRef = useRef<number | null>(null);

  const clearTick = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startTick = useCallback(() => {
    clearTick();
    tickRef.current = window.setInterval(() => {
      if (startTimeRef.current == null) return;
      const now = performance.now();
      const segmentMs = now - startTimeRef.current;
      const total = accumulatedRef.current + segmentMs;
      setElapsedMs(total);

      // Check triggers relative to segment start (offset from segmentStartRef)
      const segOffset = segmentStartRef.current ?? 0;
      const sinceSegment = total - segOffset;
      scheduleRef.current.forEach((ev, i) => {
        if (!triggeredRef.current.has(i) && sinceSegment >= ev.atMs) {
          triggeredRef.current.add(i);
          setActiveTrigger(ev.trigger);
          // Fade out the trigger label after 4s
          window.setTimeout(() => setActiveTrigger((cur) => (cur === ev.trigger ? null : cur)), 4000);
        }
      });
    }, 200);
  }, []);

  const beginSegment = useCallback((schedule: TriggerSchedule) => {
    scheduleRef.current = schedule.events;
    triggeredRef.current = new Set();
    setScheduleKind(schedule.kind);
    segmentStartRef.current = accumulatedRef.current;
    startTimeRef.current = performance.now();
    startTick();
  }, [startTick]);

  const start = useCallback(() => {
    if (state === DrinkState.DRINKING) return;
    const schedule = computeTriggerSchedule(undefined);
    setState(DrinkState.DRINKING);
    beginSegment(schedule);
  }, [state, beginSegment]);

  const pause = useCallback(() => {
    if (state !== DrinkState.DRINKING) return;
    if (startTimeRef.current != null) {
      accumulatedRef.current += performance.now() - startTimeRef.current;
      startTimeRef.current = null;
    }
    pauseAtRef.current = performance.now();
    clearTick();
    setState(DrinkState.PAUSED);
  }, [state]);

  const resume = useCallback(() => {
    if (state !== DrinkState.PAUSED) return;
    const pauseDuration = pauseAtRef.current != null ? performance.now() - pauseAtRef.current : 0;
    pauseAtRef.current = null;
    const schedule = computeTriggerSchedule(pauseDuration);
    setState(DrinkState.DRINKING);
    beginSegment(schedule);
  }, [state, beginSegment]);

  const finish = useCallback(() => {
    if (startTimeRef.current != null) {
      accumulatedRef.current += performance.now() - startTimeRef.current;
      startTimeRef.current = null;
    }
    clearTick();
    setState(DrinkState.FINISHED);
  }, []);

  const reset = useCallback(() => {
    clearTick();
    startTimeRef.current = null;
    accumulatedRef.current = 0;
    pauseAtRef.current = null;
    segmentStartRef.current = null;
    scheduleRef.current = [];
    triggeredRef.current = new Set();
    setElapsedMs(0);
    setActiveTrigger(null);
    setScheduleKind(null);
    setState(DrinkState.IDLE);
  }, []);

  useEffect(() => () => clearTick(), []);

  return {
    state,
    elapsedMs,
    activeTrigger,
    scheduleKind,
    start,
    pause,
    resume,
    finish,
    reset,
  };
}
