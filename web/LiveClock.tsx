import { useEffect, useState } from "react";
import { formatTaskCreatedAt, relativeActivity } from "./workspace-format";

const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function publish() {
  const now = Date.now();
  for (const listener of listeners) listener(now);
}

function onVisible() {
  if (!document.hidden) publish();
}

function ensureClock() {
  if (timer !== undefined) return;
  timer = setInterval(() => {
    if (!document.hidden) publish();
  }, 1000);
  document.addEventListener("visibilitychange", onVisible);
}

function releaseClock() {
  if (listeners.size || timer === undefined) return;
  clearInterval(timer);
  timer = undefined;
  document.removeEventListener("visibilitychange", onVisible);
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    listeners.add(setNow);
    ensureClock();
    return () => {
      listeners.delete(setNow);
      releaseClock();
    };
  }, []);
  return now;
}

export function TaskCreatedTime({ value }: { value?: string }) {
  const now = useNow();
  const label = formatTaskCreatedAt(value, now);
  if (!label) return null;
  return <time dateTime={value}>{label}</time>;
}

export function RelativeActivityText({ value }: { value?: string }) {
  const now = useNow();
  return <>活跃于 {relativeActivity(value, now)}</>;
}

export function RunElapsed({ createdAt }: { createdAt: string }) {
  const now = useNow();
  const started = new Date(createdAt.replace(" ", "T") + "Z").getTime();
  return <>{Math.max(0, Math.floor((now - started) / 1000))}</>;
}
