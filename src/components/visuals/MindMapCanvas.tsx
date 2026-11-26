"use client";

import React, { useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { MindMapNodeData } from "@/types/vidmind";

export function MindMapCanvas({ items }: { items: MindMapNodeData[] }) {
  const [selected, setSelected] = useState<MindMapNodeData | null>(null);

  const { nodes, edges } = useMemo(() => {
    const root = items.find((i) => i.category === "root") || items[0];
    const children = items.filter((i) => i.id !== root?.id);

    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];

    if (root) {
      rfNodes.push({
        id: root.id,
        position: { x: 320, y: 20 },
        data: { label: root.label },
        style: {
          background: "linear-gradient(135deg, #4f46e5, #0891b2)",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: "14px",
          padding: "12px 18px",
          fontWeight: 600,
          width: 240,
          textAlign: "center",
        },
      });
    }

    const cols = Math.max(1, Math.min(4, children.length));
    children.forEach((child, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      rfNodes.push({
        id: child.id,
        position: { x: 40 + col * 240, y: 155 + row * 130 },
        data: { label: child.label },
        style: {
          background: "#121826",
          color: "#e2e8f0",
          border: "1px solid rgba(99,102,241,0.45)",
          borderRadius: "12px",
          padding: "10px 14px",
          fontSize: "13px",
          width: 200,
          textAlign: "center",
        },
      });
      if (root) {
        rfEdges.push({
          id: `e-${child.parentId || root.id}-${child.id}`,
          source: child.parentId || root.id,
          target: child.id,
          animated: true,
          style: { stroke: "#6366f1" },
        });
      }
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [items]);

  if (!items.length) {
    return (
      <div className="h-[360px] rounded-xl border border-slate-800 flex items-center justify-center text-sm text-slate-400">
        Generate a mind map to explore interactive concept nodes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[420px] rounded-2xl border border-slate-800 overflow-hidden bg-[#090d16]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={(_, node) => {
            const found = items.find((i) => i.id === node.id) || null;
            setSelected(found);
          }}
        >
          <Background color="#1e293b" gap={24} />
          <Controls />
          <MiniMap
            style={{ background: "#0d111b" }}
            nodeColor="#6366f1"
            maskColor="rgba(7,9,15,0.75)"
          />
        </ReactFlow>
      </div>
      {selected && (
        <div className="rounded-xl bg-[#121826] border border-indigo-500/30 p-3.5 text-sm">
          <div className="font-semibold text-indigo-300">{selected.label}</div>
          <p className="text-slate-300 mt-1">
            {selected.description || "Click and drag nodes to reorganize your concept map."}
          </p>
        </div>
      )}
    </div>
  );
}
