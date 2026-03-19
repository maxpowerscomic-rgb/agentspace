import { useEffect, useState } from "react";
import { socket } from "../App";
import { MonitorPlay, MonitorStop } from "lucide-react";

export default function BrowserPane({ agents }: { agents: any }) {
  const [activeAgent, setActiveAgent] = useState<string>("agent1");
  const [isStreaming, setIsStreaming] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    const handleFrame = (data: string) => {
      setFrame(`data:image/jpeg;base64,${data}`);
    };

    socket.on(`browser:frame:${activeAgent}`, handleFrame);

    return () => {
      socket.off(`browser:frame:${activeAgent}`);
    };
  }, [activeAgent]);

  const toggleStream = () => {
    if (isStreaming) {
      socket.emit("browser:stop", activeAgent);
      setIsStreaming(false);
    } else {
      socket.emit("browser:start", activeAgent);
      setIsStreaming(true);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Agent Browser</h2>
        <div className="flex gap-2">
          <select 
            value={activeAgent}
            onChange={(e) => {
              if (isStreaming) socket.emit("browser:stop", activeAgent);
              setActiveAgent(e.target.value);
              setIsStreaming(false);
              setFrame(null);
            }}
            className="bg-neutral-900 border border-neutral-800 text-sm rounded-lg px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="agent1">{agents["agent1"]?.name || "Agent 1"}</option>
            <option value="agent2">{agents["agent2"]?.name || "Agent 2"}</option>
          </select>
          <button 
            onClick={toggleStream}
            className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
              isStreaming ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
          >
            {isStreaming ? <MonitorStop size={16} /> : <MonitorPlay size={16} />}
            {isStreaming ? "Stop" : "Stream"}
          </button>
        </div>
      </div>
      
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
        {frame ? (
          <img src={frame} alt="Browser Stream" className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="text-neutral-600 text-sm flex flex-col items-center gap-2">
            <MonitorPlay size={32} className="opacity-50" />
            <p>Click Stream to view {agents[activeAgent]?.name || activeAgent}'s browser</p>
          </div>
        )}
      </div>
    </div>
  );
}
