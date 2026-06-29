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
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const parent = c.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      c.width = width * dpr;
      c.height = height * dpr;
      c.style.width = width + "px";
      c.style.height = height + "px";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = c.clientWidth;
      const h = c.clientHeight;
      g.clearRect(0, 0, w, h);
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
              g.shadowColor = `rgba(${color}, ${t * 0.6})`;
              g.shadowBlur = t * 8;
            } else {
              g.shadowBlur = 0;
            }
          }
          g.fillStyle = `rgba(${color}, ${alpha})`;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: MouseEvent) => {
      const rect = c.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const onLeave = () => {
      mouseRef.current.active = false;
    };

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
