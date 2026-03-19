import { chromium, Browser, BrowserContext, Page } from "playwright";
import { Server } from "socket.io";
import { stateMachine } from "./state.js";

interface AgentBrowser {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  interval?: NodeJS.Timeout;
}

const browsers: Record<string, AgentBrowser> = {};

export async function initBrowsers() {
  try {
    for (const agentId of ["agent1", "agent2"]) {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      const page = await context.newPage();
      
      browsers[agentId] = { browser, context, page };
      console.log(`Initialized browser for ${agentId}`);
    }
  } catch (e) {
    console.error("Failed to initialize browsers. Playwright might not be installed correctly.", e);
  }
}

export function startStreamingBrowser(agentId: string, io: Server) {
  const agentBrowser = browsers[agentId];
  if (!agentBrowser) return;

  if (agentBrowser.interval) {
    clearInterval(agentBrowser.interval);
  }

  agentBrowser.interval = setInterval(async () => {
    try {
      if (!agentBrowser.page.isClosed()) {
        const buffer = await agentBrowser.page.screenshot({ type: "jpeg", quality: 50 });
        io.emit(`browser:frame:${agentId}`, buffer.toString("base64"));
      }
    } catch (e) {
      // Ignore screenshot errors
    }
  }, 1000); // 1 FPS to save bandwidth
}

export function stopStreamingBrowser(agentId: string) {
  const agentBrowser = browsers[agentId];
  if (agentBrowser && agentBrowser.interval) {
    clearInterval(agentBrowser.interval);
  }
}

export function getBrowserPage(agentId: string): Page | null {
  return browsers[agentId]?.page || null;
}
