import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  spacing?: number;
  radius?: number;
  influence?: number;
  baseOpacity?: number;
  color?: string;
}

export function InteractiveDotGrid({
  className = "",
  spacing = 24,
  radius = 1.2,
  influence = 140,
  baseOpacity = 0.12,
  color = "180, 210, 255",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -9999, y: -9999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.scale(dpr, dpr);
    }

    function draw() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const m = mouseRef.current;
      for (let x = spacing / 2; x < w; x += spacing) {
        for (let y = spacing / 2; y < h; y += spacing) {
          let alpha = baseOpacity;
          let r = radius;
          if (m.active) {
            const dx = x - m.x;
            const dy = y - m.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < influence) {
              const t = 1 - dist / influence;
              alpha = baseOpacity + t * 0.7;
              r = radius + t * 1.8;
              ctx.shadowColor = `rgba(${color}, ${t * 0.6})`;
              ctx.shadowBlur = t * 8;
            } else {
              ctx.shadowBlur = 0;
            }
          }
          ctx.fillStyle = `rgba(${color}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    }

    function onMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    }
    function onLeave() {
      mouseRef.current.active = false;
    }

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, [spacing, radius, influence, baseOpacity, color]);

  return <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 ${className}`} />;
}
