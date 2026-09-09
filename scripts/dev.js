// Makers CLI starts `npm run dev -- --port ...` as its frontend server.
// Normal `npm run dev` retains the existing local full-stack workflow.
const portIndex = process.argv.indexOf("--port");
if (portIndex >= 0) {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { port: Number(process.argv[portIndex + 1]), host: "127.0.0.1", strictPort: true } });
  await server.listen();
} else {
  await import("../server/index.js");
}
