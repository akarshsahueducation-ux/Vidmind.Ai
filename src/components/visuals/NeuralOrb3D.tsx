"use client";

import React, { useEffect, useRef } from "react";

interface Point3D {
  x: number;
  y: number;
  z: number;
  pulseOffset: number;
}

/**
 * Interactive 60fps 3D projected AI Neural Sphere with synaptic links,
 * tilted 3D orbital rings, and mouse-driven perspective rotation.
 */
export function NeuralOrb3D({
  size = 240,
  active = false,
  label,
}: {
  size?: number;
  active?: boolean;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ rx: 0, ry: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fibonacci sphere distribution for uniform 3D neural nodes
    const count = 64;
    const points: Point3D[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = golden * i;
      points.push({
        x: Math.cos(theta) * radiusAtY,
        y,
        z: Math.sin(theta) * radiusAtY,
        pulseOffset: i * 0.25,
      });
    }

    let angleY = 0;
    let angleX = 0.32;
    let frameId = 0;

    function render(timeMs: number) {
      if (!ctx) return;
      const t = timeMs * 0.001;
      const speed = active ? 0.022 : 0.009;
      angleY += speed + pointerRef.current.rx * 0.02;
      angleX += (0.32 + pointerRef.current.ry * 0.45 - angleX) * 0.06;

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const sphereRadius = size * 0.34;
      const fov = size * 1.45;

      // Ambient 3D core glow
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, sphereRadius * 1.35);
      coreGrad.addColorStop(0, active ? "rgba(34, 211, 238, 0.38)" : "rgba(99, 102, 241, 0.28)");
      coreGrad.addColorStop(0.5, "rgba(139, 92, 246, 0.12)");
      coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, sphereRadius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      const projected = points.map((p) => {
        const rx = p.x * cosY - p.z * sinY;
        const rz1 = p.x * sinY + p.z * cosY;
        const ry = p.y * cosX - rz1 * sinX;
        const rz = p.y * sinX + rz1 * cosX;

        const scale = fov / (fov + rz * sphereRadius);
        return {
          sx: cx + rx * sphereRadius * scale,
          sy: cy + ry * sphereRadius * scale,
          z: rz,
          scale,
          pulse: 0.65 + 0.35 * Math.sin(t * (active ? 5 : 2.2) + p.pulseOffset),
        };
      });

      // Draw 3D synaptic connections
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const a = projected[i];
          const b = projected[j];
          const dx = a.sx - b.sx;
          const dy = a.sy - b.sy;
          const dist = Math.hypot(dx, dy);
          if (dist < sphereRadius * 0.62) {
            const depthAlpha = Math.max(0.06, ((a.z + b.z) * 0.25 + 0.5) * 0.45);
            ctx.strokeStyle =
              a.z > 0
                ? `rgba(34, 211, 238, ${depthAlpha})`
                : `rgba(129, 140, 248, ${depthAlpha * 0.7})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      // Draw 3D tilted orbital rings
      for (let ring = 0; ring < 2; ring++) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring === 0 ? t * 0.35 : -t * 0.25 + 1.05);
        ctx.scale(1, ring === 0 ? 0.32 : 0.42);
        ctx.strokeStyle =
          ring === 0 ? "rgba(34, 211, 238, 0.32)" : "rgba(168, 85, 247, 0.28)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(0, 0, sphereRadius * (ring === 0 ? 1.25 : 1.15), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Depth-sorted 3D nodes
      projected.sort((a, b) => a.z - b.z);
      for (const pt of projected) {
        const r = Math.max(1.2, (pt.z > 0 ? 3.1 : 1.8) * pt.scale * pt.pulse);
        ctx.fillStyle =
          pt.z > 0.15
            ? `rgba(103, 232, 249, ${0.55 + pt.z * 0.45})`
            : `rgba(129, 140, 248, ${0.35 + (pt.z + 1) * 0.25})`;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      frameId = requestAnimationFrame(render);
    }

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, [size, active]);

  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          rx: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
          ry: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
        };
      }}
      onMouseLeave={() => {
        pointerRef.current = { rx: 0, ry: 0 };
      }}
      className="relative inline-flex flex-col items-center justify-center select-none"
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="cursor-grab active:cursor-grabbing"
      />
      {label && (
        <span className="mt-1 text-[11px] font-mono tracking-wider uppercase text-cyan-300/90">
          {label}
        </span>
      )}
    </div>
  );
}
