import React, { useState, useEffect, useRef } from "react";
import { socket } from "../App";
import { Send } from "lucide-react";

export default function ChatPane({ currentTurn, agents }: { currentTurn: string, agents: any }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on("chat:history", (history: any[]) => {
      setMessages(history);
    });

    socket.on("chat:message", (msg: any) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off("chat:history");
      socket.off("chat:message");
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || currentTurn !== "human") return;
    
    socket.emit("chat:send", { sender: "human", text: input });
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="p-4 border-b border-neutral-800">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Unified Chat</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.sender === "human" ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-neutral-500">
                {msg.sender === "human" ? "You" : agents[msg.sender]?.name || msg.sender}
              </span>
              <span className="text-[10px] text-neutral-600">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${
              msg.sender === "human" ? "bg-indigo-600 text-white rounded-tr-none" : 
              msg.sender === "agent1" ? "bg-neutral-800 text-neutral-200 rounded-tl-none border border-neutral-700" :
              "bg-neutral-800 text-neutral-200 rounded-tl-none border border-neutral-700"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-4 border-t border-neutral-800 bg-neutral-950">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={currentTurn !== "human"}
            placeholder={currentTurn === "human" ? "Type a message..." : "Waiting for agent..."}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={currentTurn !== "human" || !input.trim()}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
