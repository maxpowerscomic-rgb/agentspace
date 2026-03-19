import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { setupApiRoutes } from "./src/server/api.js";
import { setupSocketHandlers } from "./src/server/socket.js";
import { initBrowsers } from "./src/server/browser.js";
import { stateMachine } from "./src/server/state.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8 // 100 MB for large payloads
  });

  // Initialize state and browsers
  await initBrowsers();
  stateMachine.setIo(io);

  // Setup API routes
  setupApiRoutes(app, io);
  
  // Setup Socket.io handlers
  setupSocketHandlers(io);

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
