// Public, read-only probes. Never print response bodies, cookies or credentials.
const origin = new URL(process.argv[2] || "https://cothread.z2l.top").origin;
for (let sample = 1; sample <= 3; sample++) {
  for (const path of ["/", "/api/health"]) {
    const start = performance.now();
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000), cache: "no-store" });
    const firstByte = performance.now() - start;
    const bytes = (await response.arrayBuffer()).byteLength;
    const total = performance.now() - start;
    const timings = Object.fromEntries([...(response.headers.get("server-timing") || "").matchAll(/([\w_]+);dur=([\d.]+)/g)].map((match) => [match[1], Number(match[2])]));
    console.log(JSON.stringify({ sample, path, status: response.status, firstByteMs: Math.round(firstByte),
      transferMs: Math.round(total - firstByte), totalMs: Math.round(total), bytes,
      server: timings, networkAndPlatformMs: timings.app === undefined ? null : Math.max(0, Math.round(firstByte - timings.app)),
      requestId: response.headers.get("x-cothread-request-id") }));
  }
}
