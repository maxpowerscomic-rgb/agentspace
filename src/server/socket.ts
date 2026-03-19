import { Server, Socket } from "socket.io";
import { stateMachine, EntityType } from "./state.js";
import { startStreamingBrowser, stopStreamingBrowser } from "./browser.js";

export function setupSocketHandlers(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

    // Send initial state
    socket.emit("turn:change", stateMachine.getCurrentTurn());
    socket.emit("chat:history", stateMachine.getChatHistory());
    socket.emit("canvas:update", stateMachine.getCanvasState());
    socket.emit("agent:config", stateMachine.agents);
    socket.emit("meeting:code", stateMachine.meetingCode);

    // Handle chat messages
    socket.on("chat:send", (data: { sender: EntityType, text: string }) => {
      stateMachine.addChatMessage(data.sender, data.text);
    });

    // Handle canvas updates
    socket.on("canvas:change", (state: any) => {
      stateMachine.updateCanvasState(state);
    });

    // Handle turn passing manually from UI
    socket.on("turn:pass", () => {
      stateMachine.nextTurn();
    });

    // Handle agent config updates
    socket.on("agent:update", (data: { id: string, config: any }) => {
      stateMachine.updateAgentConfig(data.id, data.config);
    });

    // Browser streaming
    socket.on("browser:start", (agentId: string) => {
      startStreamingBrowser(agentId, io);
    });

    socket.on("browser:stop", (agentId: string) => {
      stopStreamingBrowser(agentId);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}
