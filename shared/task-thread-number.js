export function formatTaskThreadNumber(threadNumber) {
  const n = Number(threadNumber);
  if (!Number.isInteger(n) || n < 1 || n > 9999) return "#0000";
  return `#${String(n).padStart(4, "0")}`;
}

export function taskThreadNumberSearchMatch(task, query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return true;
  const needle = raw.startsWith("#") ? raw.slice(1) : raw;
  const title = String(task.title || "").toLowerCase();
  if (title.includes(needle)) return true;
  const n = Number(task.thread_number);
  if (!Number.isInteger(n) || n < 1) return false;
  const digits = String(n);
  const padded = String(n).padStart(4, "0");
  return digits.includes(needle) || padded.includes(needle) || `#${padded}`.includes(raw);
}
