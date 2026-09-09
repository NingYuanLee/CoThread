import { createMakersApp } from "../server/makers.js";

// Makers invokes this Express app; do not listen or start a polling worker here.
const app = createMakersApp();
export default app;
