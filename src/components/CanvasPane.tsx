import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { socket } from "../App";
import { MousePointer2, Square, Circle, Type } from "lucide-react";

export default function CanvasPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [activeTool, setActiveTool] = useState<string>("select");

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasRef.current.parentElement?.clientWidth || 800,
      height: canvasRef.current.parentElement?.clientHeight || 600,
      backgroundColor: "#171717", // neutral-900
    });
    fabricRef.current = canvas;

    // Handle window resize
    const handleResize = () => {
      if (canvasRef.current?.parentElement) {
        canvas.setDimensions({
          width: canvasRef.current.parentElement.clientWidth,
          height: canvasRef.current.parentElement.clientHeight
        });
      }
    };
    window.addEventListener("resize", handleResize);

    // Sync from server
    socket.on("canvas:update", (state: any) => {
      if (state && fabricRef.current) {
        // Disable events during load to prevent infinite loop
        fabricRef.current.off("object:modified");
        fabricRef.current.off("object:added");
        fabricRef.current.off("object:removed");
        
        fabricRef.current.loadFromJSON(state).then(() => {
          fabricRef.current?.renderAll();
          // Re-enable events
          setupCanvasEvents();
        });
      }
    });

    const setupCanvasEvents = () => {
      if (!fabricRef.current) return;
      const emitChange = () => {
        const json = fabricRef.current?.toJSON();
        socket.emit("canvas:change", json);
      };

      fabricRef.current.on("object:modified", emitChange);
      fabricRef.current.on("object:added", emitChange);
      fabricRef.current.on("object:removed", emitChange);
    };

    setupCanvasEvents();

    return () => {
      window.removeEventListener("resize", handleResize);
      socket.off("canvas:update");
      canvas.dispose();
    };
  }, []);

  const addShape = (type: string) => {
    if (!fabricRef.current) return;
    
    let obj;
    if (type === "rect") {
      obj = new fabric.Rect({
        left: 100, top: 100, fill: "#4f46e5", width: 100, height: 100, rx: 8, ry: 8
      });
    } else if (type === "circle") {
      obj = new fabric.Circle({
        left: 100, top: 100, fill: "#10b981", radius: 50
      });
    } else if (type === "text") {
      obj = new fabric.IText("Hello Agent", {
        left: 100, top: 100, fill: "#ffffff", fontFamily: "Inter", fontSize: 24
      });
    }

    if (obj) {
      fabricRef.current.add(obj);
      fabricRef.current.setActiveObject(obj);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Shared Canvas</h2>
        <div className="flex gap-2">
          <button onClick={() => setActiveTool("select")} className={`p-2 rounded-lg transition-colors ${activeTool === "select" ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-white"}`}>
            <MousePointer2 size={18} />
          </button>
          <div className="w-px h-6 bg-neutral-800 mx-1 self-center" />
          <button onClick={() => addShape("rect")} className="p-2 text-neutral-500 hover:text-white transition-colors rounded-lg hover:bg-neutral-800">
            <Square size={18} />
          </button>
          <button onClick={() => addShape("circle")} className="p-2 text-neutral-500 hover:text-white transition-colors rounded-lg hover:bg-neutral-800">
            <Circle size={18} />
          </button>
          <button onClick={() => addShape("text")} className="p-2 text-neutral-500 hover:text-white transition-colors rounded-lg hover:bg-neutral-800">
            <Type size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
