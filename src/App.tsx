import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import ChatPane from "./components/ChatPane";
import CanvasPane from "./components/CanvasPane";
import BrowserPane from "./components/BrowserPane";
import ConfigModal from "./components/ConfigModal";
import { Settings } from "lucide-react";

export const socket: Socket = io();

export default function App() {
  const [currentTurn, setCurrentTurn] = useState<string>("human");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [agents, setAgents] = useState<any>({});
  const [meetingCode, setMeetingCode] = useState<string>("");

  useEffect(() => {
    socket.on("turn:change", (turn: string) => {
      setCurrentTurn(turn);
    });

    socket.on("agent:config", (config: any) => {
      setAgents(config);
    });

    socket.on("meeting:code", (code: string) => {
      setMeetingCode(code);
    });

    return () => {
      socket.off("turn:change");
      socket.off("agent:config");
      socket.off("meeting:code");
    };
  }, []);

  const handlePassTurn = () => {
    socket.emit("turn:pass");
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-neutral-950 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold tracking-tight">AgentSpace</h1>
          <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-lg">
            <span className="text-xs text-neutral-500 uppercase font-medium">Meeting Code:</span>
            <span className="text-sm font-mono text-indigo-400 font-bold">{meetingCode}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-400">Current Turn:</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              currentTurn === "human" ? "bg-emerald-500/20 text-emerald-400" :
              currentTurn === "agent1" ? "bg-indigo-500/20 text-indigo-400" :
              "bg-rose-500/20 text-rose-400"
            }`}>
              {currentTurn === "human" ? "Human" : agents[currentTurn]?.name || currentTurn}
            </span>
          </div>
          {currentTurn === "human" && (
            <button 
              onClick={handlePassTurn}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Pass Turn
            </button>
          )}
          <button 
            onClick={() => setIsConfigOpen(true)}
            className="p-2 text-neutral-400 hover:text-white transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat */}
        <div className="w-1/3 min-w-[300px] border-r border-neutral-800 flex flex-col">
          <ChatPane currentTurn={currentTurn} agents={agents} />
        </div>

        {/* Middle Panel: Canvas */}
        <div className="flex-1 border-r border-neutral-800 flex flex-col relative">
          <CanvasPane />
        </div>

        {/* Right Panel: Browser View */}
        <div className="w-1/3 min-w-[300px] flex flex-col">
          <BrowserPane agents={agents} />
        </div>
      </main>

      {isConfigOpen && (
        <ConfigModal 
          agents={agents} 
          meetingCode={meetingCode}
          onClose={() => setIsConfigOpen(false)} 
        />
      )}
    </div>
  );
}
