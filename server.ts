import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { setupApiRoutes } from "./src/server/api.js";
import { initWatchers } from "./src/server/watcher.js";
import { startScheduler } from "./src/server/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  const httpServer = createServer(app);

  // wiwo API
  setupApiRoutes(app);

  // Phase 2/3: resume auto-scan watchers and the scheduled-posting loop.
  initWatchers();
  startScheduler();

  // Serve uploaded before/after images
  app.use("/uploads", express.static(path.join(__dirname, "uploads")));

  // Vite for the React front end (dev), static dist (prod)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`wiwo running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
