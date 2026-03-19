import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

export type EntityType = "human" | "agent1" | "agent2";

export interface ChatMessage {
  id: string;
  sender: EntityType;
  text: string;
  timestamp: string;
}

export interface AgentConfig {
  id: EntityType;
  name: string;
  webhookUrl: string;
  apiKey: string;
}

class StateMachine {
  private currentTurn: EntityType = "human";
  private chatHistory: ChatMessage[] = [];
  private canvasState: any = null;
  private io: Server | null = null;
  public meetingCode: string = uuidv4().split("-")[0].toUpperCase();

  public agents: Record<string, AgentConfig> = {
    agent1: { id: "agent1", name: "Agent Alpha", webhookUrl: "", apiKey: "agent1-secret" },
    agent2: { id: "agent2", name: "Agent Beta", webhookUrl: "", apiKey: "agent2-secret" }
  };

  setIo(io: Server) {
    this.io = io;
  }

  getCurrentTurn() {
    return this.currentTurn;
  }

  getChatHistory() {
    return this.chatHistory;
  }

  getCanvasState() {
    return this.canvasState;
  }

  updateCanvasState(state: any) {
    this.canvasState = state;
    this.io?.emit("canvas:update", state);
  }

  addChatMessage(sender: EntityType, text: string) {
    const msg: ChatMessage = {
      id: uuidv4(),
      sender,
      text,
      timestamp: new Date().toISOString()
    };
    this.chatHistory.push(msg);
    this.io?.emit("chat:message", msg);
  }

  async nextTurn() {
    let next: EntityType = "human";
    if (this.currentTurn === "human") next = "agent1";
    else if (this.currentTurn === "agent1") next = "agent2";
    else next = "human";

    this.currentTurn = next;
    this.io?.emit("turn:change", this.currentTurn);

    // If it's an agent's turn, fire webhook
    if (this.currentTurn !== "human") {
      const agent = this.agents[this.currentTurn];
      if (agent && agent.webhookUrl) {
        try {
          await fetch(agent.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${agent.apiKey}`
            },
            body: JSON.stringify({
              event: "turn:start",
              context: {
                chatHistory: this.chatHistory,
                canvasState: this.canvasState
              }
            })
          });
        } catch (e) {
          console.error(`Failed to trigger webhook for ${agent.name}:`, e);
          this.addChatMessage("human", `System: Failed to reach ${agent.name} via webhook. They can still poll for their turn.`);
        }
      } else {
         console.log(`Agent ${agent.name} has no webhook URL configured. Waiting for them to poll.`);
      }
    }
  }

  updateAgentConfig(id: string, config: Partial<AgentConfig>) {
    if (this.agents[id]) {
      this.agents[id] = { ...this.agents[id], ...config };
      this.io?.emit("agent:config", this.agents);
    }
  }
}

export const stateMachine = new StateMachine();
