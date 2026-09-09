import { createMakersMcpHandler } from "../../server/makers-mcp.js";
import { withMakersSandbox } from "../../server/makers-sandbox.js";

const handle = createMakersMcpHandler();
export const onRequest = (context) => withMakersSandbox(context.sandbox, () => handle(context));
