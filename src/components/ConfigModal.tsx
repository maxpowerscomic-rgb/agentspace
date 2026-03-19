import { useState } from "react";
import { socket } from "../App";
import { X, Copy, Check } from "lucide-react";

export default function ConfigModal({ agents, meetingCode, onClose }: { agents: any, meetingCode: string, onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleUpdate = (id: string, field: string, value: string) => {
    socket.emit("agent:update", {
      id,
      config: { [field]: value }
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyInstructions = () => {
    const instructions = `AgentSpace Setup Instructions:
1. Endpoint: ${window.location.origin}/api/join
2. Meeting Code: ${meetingCode}

To join, send a POST request to the endpoint with:
{
  "meetingCode": "${meetingCode}",
  "name": "Your Agent Name",
  "webhookUrl": "https://your-agent.com/webhook" // Optional if using polling
}

If you cannot receive webhooks, you can poll for your turn using:
GET ${window.location.origin}/api/meetings/${meetingCode}/turn`;
    navigator.clipboard.writeText(instructions);
    setCopied("instructions");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-neutral-800">
          <h2 className="text-xl font-semibold text-white tracking-tight">Agent Configuration</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Setup Instructions Section */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Setup Instructions</h3>
              <button 
                onClick={copyInstructions}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied === "instructions" ? <Check size={14} /> : <Copy size={14} />}
                Copy for Agent
              </button>
            </div>
            <div className="text-xs text-neutral-400 space-y-1 font-mono">
              <p>Endpoint: <span className="text-neutral-200">{window.location.origin}/api/join</span></p>
              <p>Meeting Code: <span className="text-indigo-400 font-bold">{meetingCode}</span></p>
            </div>
          </div>

          {["agent1", "agent2"].map((id) => {
            const agent = agents[id] || {};
            return (
              <div key={id} className="space-y-4">
                <h3 className="text-lg font-medium text-indigo-400">{agent.name || id}</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Display Name</label>
                    <input 
                      type="text" 
                      value={agent.name || ""} 
                      onChange={(e) => handleUpdate(id, "name", e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Webhook URL</label>
                    <input 
                      type="text" 
                      value={agent.webhookUrl || ""} 
                      onChange={(e) => handleUpdate(id, "webhookUrl", e.target.value)}
                      placeholder="https://your-agent.com/webhook"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">API Key (Auth Token)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={agent.apiKey || ""} 
                        onChange={(e) => handleUpdate(id, "apiKey", e.target.value)}
                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                      />
                      <button 
                        onClick={() => copyToClipboard(agent.apiKey, id)}
                        className="p-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors"
                      >
                        {copied === id ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">
                      Agents must include this token in the Authorization header: <code className="bg-neutral-800 px-1 py-0.5 rounded">Bearer {agent.apiKey}</code>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
