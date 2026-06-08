import { existsSync } from "node:fs";

import { createWebServer, DEFAULT_CLIENT_DIR } from "./app.js";

const WEB_API_PORT = Number(process.env.FLOWWEAVE_WEB_PORT ?? 3847);

const server = createWebServer();

server.listen(WEB_API_PORT, "127.0.0.1", () => {
  console.log(`@flowweave/app-web API: http://127.0.0.1:${WEB_API_PORT}`);
  if (existsSync(DEFAULT_CLIENT_DIR)) {
    console.log(`静态资源: ${DEFAULT_CLIENT_DIR}`);
  }
});

export { WEB_API_PORT };
