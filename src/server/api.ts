import express, { Express, Request, Response } from "express";
import { Server } from "socket.io";
import multer from "multer";
import path from "path";
import fs from "fs";
import { stateMachine, EntityType } from "./state.js";
import { getBrowserPage } from "./browser.js";

const upload = multer({ dest: "uploads/" });

export function setupApiRoutes(app: Express, io: Server) {
  // Middleware to authenticate agents
  const authenticateAgent = (req: Request, res: Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });

    const token = authHeader.split(" ")[1];
    const agentId = Object.keys(stateMachine.agents).find(
      id => stateMachine.agents[id].apiKey === token
    );

    if (!agentId) return res.status(403).json({ error: "Invalid API key" });
    
    // Attach agentId to request
    (req as any).agentId = agentId;
    next();
  };

  // Agent Join
  app.post("/api/join", (req: Request, res: Response) => {
    const { meetingCode, name, webhookUrl } = req.body;
    
    if (meetingCode !== stateMachine.meetingCode) {
      return res.status(403).json({ error: "Invalid meeting code" });
    }

    // Find an empty slot or update existing
    let assignedId: string | null = null;
    if (stateMachine.agents.agent1.apiKey === "agent1-secret") assignedId = "agent1";
    else if (stateMachine.agents.agent2.apiKey === "agent2-secret") assignedId = "agent2";
    else return res.status(400).json({ error: "Workspace is full (max 2 agents)" });

    const apiKey = `agent-${Math.random().toString(36).substr(2, 9)}`;
    
    stateMachine.updateAgentConfig(assignedId, {
      name: name || `Agent ${assignedId.replace("agent", "")}`,
      webhookUrl,
      apiKey
    });

    res.json({
      success: true,
      agentId: assignedId,
      apiKey,
      message: "Successfully joined the workspace. Use the apiKey in the Authorization header as a Bearer token for future requests."
    });
  });

  // Polling endpoint for turn status
  app.get("/api/meetings/:meetingCode/turn", (req: Request, res: Response) => {
    const { meetingCode } = req.params;
    
    if (meetingCode !== stateMachine.meetingCode) {
      return res.status(403).json({ error: "Invalid meeting code" });
    }

    res.json({
      currentTurn: stateMachine.getCurrentTurn(),
      chatHistory: stateMachine.getChatHistory(),
      canvasState: stateMachine.getCanvasState()
    });
  });

  // Turn Completion
  app.post("/api/turn/complete", authenticateAgent, (req: Request, res: Response) => {
    const agentId = (req as any).agentId as EntityType;
    const { message, canvasState } = req.body;

    if (stateMachine.getCurrentTurn() !== agentId) {
      return res.status(400).json({ error: "Not your turn" });
    }

    if (message) {
      stateMachine.addChatMessage(agentId, message);
    }

    if (canvasState) {
      stateMachine.updateCanvasState(canvasState);
    }

    stateMachine.nextTurn();
    res.json({ success: true });
  });

  // Canvas Update
  app.post("/api/canvas/update", authenticateAgent, (req: Request, res: Response) => {
    const { canvasState } = req.body;
    if (canvasState) {
      stateMachine.updateCanvasState(canvasState);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Missing canvasState" });
    }
  });

  // Browser Control
  app.post("/api/browser/navigate", authenticateAgent, async (req: Request, res: Response) => {
    const agentId = (req as any).agentId;
    const { url } = req.body;
    const page = getBrowserPage(agentId);

    if (!page) return res.status(500).json({ error: "Browser not available" });

    try {
      await page.goto(url, { waitUntil: "networkidle" });
      res.json({ success: true, title: await page.title() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/browser/click", authenticateAgent, async (req: Request, res: Response) => {
    const agentId = (req as any).agentId;
    const { selector } = req.body;
    const page = getBrowserPage(agentId);

    if (!page) return res.status(500).json({ error: "Browser not available" });

    try {
      await page.click(selector);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/browser/extract", authenticateAgent, async (req: Request, res: Response) => {
    const agentId = (req as any).agentId;
    const { selector } = req.body;
    const page = getBrowserPage(agentId);

    if (!page) return res.status(500).json({ error: "Browser not available" });

    try {
      const text = await page.evaluate((sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.textContent : null;
      }, selector || "body");
      res.json({ success: true, text });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // File Upload
  app.post("/api/upload", upload.single("file"), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(req.file.originalname);
    const newPath = req.file.path + ext;
    fs.renameSync(req.file.path, newPath);

    const url = `/uploads/${req.file.filename}${ext}`;
    res.json({ success: true, url });
  });
}
