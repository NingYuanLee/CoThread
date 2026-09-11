import React, { useEffect, useRef } from "react";

type Signal = { x: number; y: number; vx: number; vy: number; size: number; depth: number; tone: number; phase: number };
type TrailPoint = { x: number; y: number; time: number; speed: number };

export function AuthParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const tones = ["89,126,91", "193,151,67", "166,91,73", "76,126,133"];
    const pointer = { x: 0, y: 0, previousX: 0, previousY: 0, active: false };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0, height = 0, frame = 0, signals: Signal[] = [], trail: TrailPoint[] = [];

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(28, Math.min(width < 620 ? 42 : 82, Math.round(width * height / 16500)));
      signals = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: .12 + Math.random() * .28, vy: (Math.random() - .5) * .16,
        size: .8 + Math.random() * 1.7, depth: .35 + Math.random() * .9,
        tone: index % tones.length, phase: Math.random() * Math.PI * 2,
      }));
    };

    const grid = (time: number) => {
      context.save();
      context.lineWidth = .65;
      const drift = reduced ? 0 : Math.sin(time * .00018) * 9;
      let column = 0;
      for (let x = -80; x < width + 100; x += 72, column++) {
        const proximity = pointer.active ? Math.max(0, 1 - Math.abs(x - pointer.x) / 300) : 0;
        const baseAlpha = column % 4 === 0 ? .095 : .055;
        context.strokeStyle = `rgba(91,118,88,${baseAlpha + proximity * .065})`;
        context.lineWidth = column % 4 === 0 ? .85 : .65;
        context.beginPath();
        for (let y = -20; y <= height + 20; y += 28) {
          const bend = pointer.active ? Math.sin((y - pointer.y) / 115) * proximity * 24 : 0;
          const px = x + y * .055 + drift + bend;
          if (y === -20) context.moveTo(px, y); else context.lineTo(px, y);
        }
        context.stroke();
      }
      let row = 0;
      for (let y = 18; y < height; y += 64, row++) {
        const distance = pointer.active ? Math.abs(y - pointer.y) : 999;
        const baseAlpha = row % 4 === 0 ? .08 : .045;
        context.strokeStyle = `rgba(87,124,129,${baseAlpha + Math.max(0, 1 - distance / 240) * .06})`;
        context.lineWidth = row % 4 === 0 ? .8 : .6;
        context.beginPath();
        context.moveTo(0, y + drift * .25); context.lineTo(width, y - width * .018 + drift * .25); context.stroke();
      }
      context.restore();
    };

    const cursorTrail = (now: number) => {
      trail = trail.filter((point) => now - point.time < 720);
      if (trail.length < 2) return;
      context.save();
      context.lineCap = "round"; context.lineJoin = "round";
      for (let index = 1; index < trail.length; index++) {
        const age = (now - trail[index].time) / 720;
        const alpha = Math.max(0, 1 - age);
        const gradient = context.createLinearGradient(trail[index - 1].x, trail[index - 1].y, trail[index].x, trail[index].y);
        gradient.addColorStop(0, `rgba(70,128,133,${alpha * .06})`);
        gradient.addColorStop(1, `rgba(190,143,57,${alpha * .34})`);
        context.strokeStyle = gradient;
        context.shadowColor = `rgba(87,139,135,${alpha * .45})`; context.shadowBlur = 11;
        context.lineWidth = .7 + alpha * Math.min(3.4, 1.3 + trail[index].speed * .12);
        context.beginPath(); context.moveTo(trail[index - 1].x, trail[index - 1].y); context.lineTo(trail[index].x, trail[index].y); context.stroke();
      }
      const last = trail.at(-1)!;
      const pulse = 15 + Math.sin(now * .008) * 3;
      context.shadowBlur = 15; context.shadowColor = "rgba(74,128,132,.34)";
      context.strokeStyle = "rgba(71,119,124,.28)"; context.lineWidth = 1;
      context.beginPath(); context.arc(last.x, last.y, pulse, 0, Math.PI * 1.55); context.stroke();
      context.fillStyle = "rgba(190,143,57,.55)"; context.fillRect(last.x - 1.5, last.y - 1.5, 3, 3);
      context.restore();
    };

    const draw = (time = performance.now()) => {
      context.clearRect(0, 0, width, height);
      grid(time);
      context.save();
      signals.forEach((signal) => {
        if (!reduced) {
          signal.phase += .008;
          signal.vy += Math.sin(signal.phase) * .0009;
          if (pointer.active) {
            const dx = signal.x - pointer.x, dy = signal.y - pointer.y, distance = Math.max(24, Math.hypot(dx, dy));
            if (distance < 275) {
              const force = (1 - distance / 275) * signal.depth;
              signal.vx += (-dy / distance) * force * .018 + (dx / distance) * force * .012;
              signal.vy += (dx / distance) * force * .018 + (dy / distance) * force * .012;
            }
          }
          signal.vx *= .994; signal.vy *= .994;
          signal.vx = Math.max(-.75, Math.min(.9, signal.vx)); signal.vy = Math.max(-.7, Math.min(.7, signal.vy));
          signal.x += signal.vx * signal.depth; signal.y += signal.vy * signal.depth;
          if (signal.x < -35) signal.x = width + 35; else if (signal.x > width + 35) signal.x = -35;
          if (signal.y < -35) signal.y = height + 35; else if (signal.y > height + 35) signal.y = -35;
        }
        const color = tones[signal.tone];
        const length = 8 + signal.depth * 17;
        context.strokeStyle = `rgba(${color},${.13 + signal.depth * .1})`;
        context.lineWidth = .6 + signal.depth * .35;
        context.beginPath(); context.moveTo(signal.x - length, signal.y); context.lineTo(signal.x + length * .35, signal.y); context.stroke();
        context.fillStyle = `rgba(${color},${.34 + signal.depth * .18})`;
        if (signal.tone % 2) context.fillRect(signal.x - signal.size, signal.y - signal.size, signal.size * 2, signal.size * 2);
        else { context.beginPath(); context.arc(signal.x, signal.y, signal.size, 0, Math.PI * 2); context.fill(); }
      });
      context.restore();
      if (!reduced) cursorTrail(time);
      if (!reduced) frame = requestAnimationFrame(draw);
    };

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left, y = event.clientY - rect.top;
      const speed = pointer.active ? Math.hypot(x - pointer.previousX, y - pointer.previousY) : 0;
      pointer.previousX = pointer.x = x; pointer.previousY = pointer.y = y; pointer.active = true;
      if (!reduced && (!trail.length || Math.hypot(x - trail.at(-1)!.x, y - trail.at(-1)!.y) > 4)) trail.push({ x, y, time: performance.now(), speed });
      if (trail.length > 34) trail.shift();
      if (reduced) draw();
    };
    const leave = () => { pointer.active = false; if (reduced) draw(); };
    resize(); draw();
    window.addEventListener("resize", resize); window.addEventListener("pointermove", move); window.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.removeEventListener("pointermove", move); window.removeEventListener("pointerleave", leave); };
  }, []);
  return <canvas ref={canvasRef} className="auth-particles" aria-hidden="true" />;
}
