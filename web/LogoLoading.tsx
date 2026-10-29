/**
 * 全屏等待。共序标里的 C、U 分开飞入、停住、再飞出，循环播放。
 * 之后别的长操作也可以直接放一个 <LogoLoading label="…" />。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "./dialog-fx";
import "./logo-loading.css";

const ENTER = 0.92;
const HOLD = 0.52;
const EXIT = 0.92;
/** 飞出结束后先完全隐住，再摆回进场姿势，避免两遍之间跳一下。 */
const GAP = 0.12;
const CYCLE = ENTER + HOLD + EXIT + GAP;
/** 一整遍飞入、停留、飞出。 */
export const LOGO_LOADING_CYCLE_MS = Math.round(CYCLE * 1000);
/** 起草任务至少盖住一遍，避免请求太快时动画一闪而过。两遍约五秒，等太久。 */
export const LOGO_LOADING_MIN_MS = LOGO_LOADING_CYCLE_MS;

/** 加载结束后仍保持显示，直到凑满指定遍数。默认一遍。 */
export function useLogoLoadingHold(active: boolean, cycles = 1) {
  const [visible, setVisible] = useState(active);
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (active) {
      startedAt.current = Date.now();
      setVisible(true);
      return;
    }
    const started = startedAt.current;
    startedAt.current = null;
    if (started == null) {
      setVisible(false);
      return;
    }
    const remain = LOGO_LOADING_CYCLE_MS * cycles - (Date.now() - started);
    if (remain <= 0) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), remain);
    return () => window.clearTimeout(timer);
  }, [active, cycles]);
  return visible;
}
const SAMPLES = 48;
let loadingHolders = 0;
let loadingOrigin = 0;
let loadingReset = 0;

function bindLoadingClock() {
  loadingHolders += 1;
  if (loadingReset) {
    window.clearTimeout(loadingReset);
    loadingReset = 0;
  }
  if (!loadingOrigin) loadingOrigin = performance.now();
  return () => {
    loadingHolders = Math.max(0, loadingHolders - 1);
    if (loadingHolders > 0) return;
    loadingReset = window.setTimeout(() => {
      loadingOrigin = 0;
      loadingReset = 0;
    }, 80);
  };
}

type Point = { x: number; y: number };
type Rail = { pts: Point[]; letterStart: number; letterEnd: number };

function smooth(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function easeOut(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

function easeIn(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * x;
}

function buildRail(
  letter: SVGPathElement,
  approach: (u: number, length: number) => Point,
  departure: (u: number, length: number) => Point,
): Rail {
  const length = letter.getTotalLength();
  const pts: Point[] = [];
  for (let i = 0; i < SAMPLES; i += 1) pts.push(approach(i / SAMPLES, length));
  for (let i = 0; i <= SAMPLES; i += 1) {
    const point = letter.getPointAtLength((i / SAMPLES) * length);
    pts.push({ x: point.x, y: point.y });
  }
  for (let i = 1; i <= SAMPLES; i += 1) pts.push(departure(i / SAMPLES, length));
  return { pts, letterStart: SAMPLES, letterEnd: SAMPLES * 2 };
}

function strokeOf(rail: Rail, head: number) {
  const from = Math.max(0, head - SAMPLES);
  const to = Math.min(rail.pts.length - 1, head);
  return rail.pts
    .slice(from, to + 1)
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join("");
}

function headOf(rail: Rail, elapsed: number) {
  const t = (elapsed / 1000) % CYCLE;
  // 进场从轨道最外端开始，一次飞到字形上。不要先停在门口再往里走一遍。
  if (t < ENTER) return Math.round(easeOut(t / ENTER) * rail.letterEnd);
  if (t < ENTER + HOLD) return rail.letterEnd;
  if (t < ENTER + HOLD + EXIT)
    return rail.letterEnd + Math.round(easeIn((t - ENTER - HOLD) / EXIT) * SAMPLES);
  return 0;
}

/** 圆点和笔画同色，必须露在线头外面，否则会被圆头笔尖盖住。 */
function dotAhead(rail: Rail, head: number) {
  const index = Math.min(rail.pts.length - 1, Math.max(0, head));
  const current = rail.pts[index];
  const toward = rail.pts[Math.min(rail.pts.length - 1, index + 1)] || current;
  const from = index + 1 < rail.pts.length ? current : rail.pts[Math.max(0, index - 1)] || current;
  const target = index + 1 < rail.pts.length ? toward : current;
  let dx = target.x - from.x;
  let dy = target.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  dx /= length;
  dy /= length;
  return { x: current.x + dx * 6, y: current.y + dy * 6 };
}

export function LogoLoading({
  label = "正在处理…",
}: {
  /** 读屏和标下方的一句说明。 */
  label?: string;
}) {
  const cLetterRef = useRef<SVGPathElement>(null);
  const uLetterRef = useRef<SVGPathElement>(null);
  const cDrawRef = useRef<SVGPathElement>(null);
  const uDrawRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const extraRef = useRef<SVGPathElement>(null);
  const plateRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    const cLetter = cLetterRef.current;
    const uLetter = uLetterRef.current;
    const cDraw = cDrawRef.current;
    const uDraw = uDrawRef.current;
    const dot = dotRef.current;
    const extra = extraRef.current;
    const plate = plateRef.current;
    if (!cLetter || !uLetter || !cDraw || !uDraw || !dot || !extra || !plate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || cLetter.getTotalLength() < 1) {
      cDraw.setAttribute("d", cLetter.getAttribute("d") || "");
      uDraw.setAttribute("d", uLetter.getAttribute("d") || "");
      dot.setAttribute("cx", "48");
      dot.setAttribute("cy", "16");
      extra.style.opacity = "1";
      cDraw.style.opacity = "1";
      uDraw.style.opacity = "1";
      dot.style.opacity = "1";
      plate.style.opacity = "1";
      plate.style.transform = "scale(1)";
      return;
    }
    const cRail = buildRail(
      cLetter,
      (u, length) => ({ x: 44 + length * (1 - u), y: 19 }),
      (u, length) => ({ x: 44 + length * u, y: 49 }),
    );
    const uRail = buildRail(
      uLetter,
      (u, length) => ({ x: 22, y: 15 - length * (1 - u) }),
      (u, length) => ({ x: 48, y: 22 - length * u }),
    );
    let frame = 0;
    const releaseClock = bindLoadingClock();
    const tick = (now: number) => {
      const elapsed = now - loadingOrigin;
      const cHead = headOf(cRail, elapsed);
      const uHead = headOf(uRail, elapsed);
      cDraw.setAttribute("d", strokeOf(cRail, cHead));
      uDraw.setAttribute("d", strokeOf(uRail, uHead));
      const phase = (elapsed / 1000) % CYCLE;
      const holding = phase >= ENTER && phase < ENTER + HOLD;
      const dotPoint = dotAhead(uRail, uHead);
      dot.setAttribute("cx", String(dotPoint.x));
      dot.setAttribute("cy", String(dotPoint.y));
      extra.style.opacity = holding ? "1" : "0";
      let scale = 1;
      let opacity = 1;
      if (phase < ENTER) {
        const fade = smooth(phase / ENTER);
        scale = 0.35 + 0.65 * fade;
        opacity = fade;
      } else if (phase >= ENTER + HOLD + EXIT) {
        scale = 0.35;
        opacity = 0;
      } else if (phase >= ENTER + HOLD) {
        const fade = smooth((phase - ENTER - HOLD) / EXIT);
        scale = 1 + 0.45 * fade;
        opacity = 1 - fade;
      }
      plate.style.opacity = String(opacity);
      plate.style.transform = `scale(${scale})`;
      cDraw.style.opacity = String(opacity);
      uDraw.style.opacity = String(opacity);
      dot.style.opacity = String(opacity);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      releaseClock();
    };
  }, []);

  return (
    <>
      {/* 占住 #root，避免 :empty 的启动文案从半透明蒙层后面透出来。 */}
      <span hidden />
      <Dialog
        className="logo-loading"
        shell
        direction="none"
        closeOnBackdrop={false}
        closeOnEscape={false}
        onRequestClose={() => {}}
        aria-label={label}
      >
        <div className="logo-loading-stage" role="status" aria-live="polite" aria-busy="true">
          <svg className="logo-loading-mark" viewBox="0 0 64 64" overflow="visible" role="img">
            <title>{label}</title>
            <rect ref={plateRef} className="logo-loading-plate" width="64" height="64" rx="25.6" />
            <path ref={cLetterRef} d="M44 19H29C20.7 19 14 25.7 14 34S20.7 49 29 49H44" />
            <path ref={uLetterRef} d="M22 15V32C22 39.2 27.8 45 35 45S48 39.2 48 32V22" />
            <path
              ref={extraRef}
              className="logo-loading-extra"
              d="M18.5 23.3A15 15 0 0 1 29 19h8"
            />
            <path
              ref={cDrawRef}
              className="logo-loading-c"
              d="M44 19H29C20.7 19 14 25.7 14 34S20.7 49 29 49H44"
            />
            <path
              ref={uDrawRef}
              className="logo-loading-u"
              d="M22 15V32C22 39.2 27.8 45 35 45S48 39.2 48 32V22"
            />
            <circle ref={dotRef} className="logo-loading-dot" cx="48" cy="16" r="3" />
          </svg>
          <p>{label}</p>
        </div>
      </Dialog>
    </>
  );
}
