import { useEffect, useRef, useState } from "react";
import {
  PREVIEW_CONSOLE_MESSAGE,
  PREVIEW_NAVIGATION_MESSAGE,
  PREVIEW_NEW_WINDOW_MESSAGE,
} from "../shared/html-preview.mjs";
import {
  HtmlBrowserToolbar,
  type HtmlBrowserFile,
  type HtmlDeviceMode,
} from "./HtmlBrowserToolbar";
import { UiIcon } from "./ui-icon";

export type HtmlMobilePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type HtmlMobilePresetGroup = {
  label: string;
  presets: HtmlMobilePreset[];
};

export const HTML_MOBILE_PRESETS: HtmlMobilePreset[] = [
  { id: "iphone-18-pro", label: "iPhone 18 Pro · 375 × 782", width: 375, height: 782 },
  { id: "iphone-18-pro-max", label: "iPhone 18 Pro Max · 390 × 817", width: 390, height: 817 },
  { id: "iphone-air", label: "iPhone Air · 393 × 824", width: 393, height: 824 },
  { id: "iphone-17e", label: "iPhone 17e · 375 × 769", width: 375, height: 769 },
  { id: "huawei-pura-90", label: "HUAWEI Pura 90 · 390 × 815", width: 390, height: 815 },
  { id: "huawei-mate-x7", label: "HUAWEI Mate X7 外屏 · 382 × 813", width: 382, height: 813 },
  { id: "huawei-pura-x-max", label: "HUAWEI Pura X Max 展开 · 360 × 508", width: 360, height: 508 },
  { id: "huawei-mate-xt-2", label: "HUAWEI Mate XT 2 折叠屏 · 360 × 771", width: 360, height: 771 },
  { id: "xiaomi-17", label: "Xiaomi 17 · 360 × 759", width: 360, height: 759 },
  { id: "xiaomi-17-ultra", label: "Xiaomi 17 Ultra · 390 × 818", width: 390, height: 818 },
  { id: "galaxy-s26", label: "Samsung Galaxy S26 · 375 × 781", width: 375, height: 781 },
  {
    id: "galaxy-z-fold7",
    label: "Samsung Galaxy Z Fold7 内屏 · 324 × 360",
    width: 324,
    height: 360,
  },
];

const HTML_MOBILE_ZOOM_MIN = 50;
const HTML_MOBILE_ZOOM_MAX = 150;
const HTML_MOBILE_ZOOM_WHEEL_STEP = 5;

const HTML_MOBILE_PRESET_GROUPS: HtmlMobilePresetGroup[] = [
  {
    label: "苹果 iPhone",
    presets: HTML_MOBILE_PRESETS.slice(0, 4),
  },
  {
    label: "鸿蒙 Huawei",
    presets: HTML_MOBILE_PRESETS.slice(4, 8),
  },
  {
    label: "安卓 Android",
    presets: HTML_MOBILE_PRESETS.slice(8),
  },
];

export function HtmlPreviewFrame({
  versionId,
  filename,
  src: sourceOverride,
  onReload,
  onOpenExternal,
  files,
  addressQuery,
  onAddressQueryChange,
  onSelectFile,
  deviceMode,
  mobilePreset,
  onDeviceModeChange,
  onMobilePresetChange,
  zoomPercent,
  onZoomChange,
  onNavigate,
  onNewWindow,
}: {
  versionId: string;
  filename: string;
  src?: string;
  onReload?: () => void;
  onOpenExternal?: () => void;
  files: HtmlBrowserFile[];
  addressQuery: string;
  onAddressQueryChange: (value: string) => void;
  onSelectFile: (id: string) => void;
  deviceMode: HtmlDeviceMode;
  mobilePreset: HtmlMobilePreset;
  onDeviceModeChange: (mode: HtmlDeviceMode) => void;
  onMobilePresetChange: (presetId: string) => void;
  zoomPercent: number;
  onZoomChange: (value: number) => void;
  onNavigate?: (href: string) => void;
  onNewWindow?: (href: string, title?: string) => void;
}) {
  const src = sourceOverride || `/api/versions/${versionId}/preview/`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const zoomPanelRef = useRef<HTMLDivElement>(null);
  const zoomPanelHoveredRef = useRef(false);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const onNavigateRef = useRef(onNavigate);
  const onNewWindowRef = useRef(onNewWindow);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: number; level: string; args: string[] }>>([]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);
  useEffect(() => {
    onNewWindowRef.current = onNewWindow;
  }, [onNewWindow]);
  useEffect(() => {
    setLogs([]);
    setConsoleOpen(false);
    let nextId = 1;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== "null" && event.origin !== window.location.origin) return;
      if (
        event.source &&
        iframeRef.current?.contentWindow &&
        event.source !== iframeRef.current.contentWindow
      )
        return;
      const data = event.data;
      if (!data) return;
      if (data.type === PREVIEW_NAVIGATION_MESSAGE && typeof data.href === "string") {
        onNavigateRef.current?.(data.href);
        return;
      }
      if (data.type === PREVIEW_NEW_WINDOW_MESSAGE && typeof data.href === "string") {
        onNewWindowRef.current?.(
          data.href,
          typeof data.title === "string" ? data.title : undefined,
        );
        return;
      }
      if (data.type !== PREVIEW_CONSOLE_MESSAGE || !Array.isArray(data.args)) return;
      const level = String(data.level || "log");
      const args = data.args.map((item: unknown) => String(item));
      setLogs((previous) => {
        const row = { id: nextId++, level, args };
        return previous.length > 180 ? [...previous.slice(-160), row] : [...previous, row];
      });
      if (level === "error") setConsoleOpen(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [versionId]);

  const errorCount = logs.filter((row) => row.level === "error").length;
  const fitZoomToScreen = () => {
    if (deviceMode !== "mobile") return;
    const scroll = previewScrollRef.current;
    const viewport = previewViewportRef.current;
    if (!scroll || !viewport) return;
    const styles = window.getComputedStyle(scroll);
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const availableHeight = viewport.clientHeight - paddingTop - paddingBottom - 2;
    if (availableHeight <= 0 || mobilePreset.height <= 0) return;
    const frameHeight = mobilePreset.height + 2;
    const nextZoom = Math.floor((availableHeight / frameHeight) * 100);
    onZoomChange(Math.min(HTML_MOBILE_ZOOM_MAX, Math.max(HTML_MOBILE_ZOOM_MIN, nextZoom)));
  };

  const applyZoomWheel = (deltaY: number) => {
    const direction = deltaY < 0 ? 1 : -1;
    onZoomChange(
      Math.min(
        HTML_MOBILE_ZOOM_MAX,
        Math.max(HTML_MOBILE_ZOOM_MIN, zoomPercent + direction * HTML_MOBILE_ZOOM_WHEEL_STEP),
      ),
    );
  };

  useEffect(() => {
    const panel = zoomPanelRef.current;
    if (!panel) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!zoomPanelHoveredRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      applyZoomWheel(event.deltaY);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, [onZoomChange, zoomPercent]);

  return (
    <div className="doc-html-preview-shell">
      <HtmlBrowserToolbar
        filename={filename}
        files={files}
        addressQuery={addressQuery}
        onAddressQueryChange={onAddressQueryChange}
        onSelectFile={onSelectFile}
        onReload={onReload}
        onOpenExternal={onOpenExternal}
        deviceMode={deviceMode}
        onDeviceModeChange={onDeviceModeChange}
      />
      <div
        ref={previewViewportRef}
        className={`doc-html-preview-viewport doc-html-preview-viewport-${deviceMode}`}
      >
        {deviceMode === "mobile" ? (
          <div className="doc-html-mobile-floating-controls" aria-label="手机预览设置">
            <select
              className="doc-html-device-select"
              aria-label="手机型号"
              value={mobilePreset.id}
              onChange={(event) => onMobilePresetChange(event.target.value)}
            >
              {HTML_MOBILE_PRESET_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div
              ref={zoomPanelRef}
              className="doc-html-zoom-panel"
              onPointerEnter={() => {
                zoomPanelHoveredRef.current = true;
              }}
              onPointerLeave={() => {
                zoomPanelHoveredRef.current = false;
              }}
              onWheelCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                applyZoomWheel(event.deltaY);
              }}
            >
              <button
                type="button"
                className="doc-html-fit-screen-button"
                title="适应屏幕"
                aria-label="适应屏幕"
                onClick={fitZoomToScreen}
              >
                <UiIcon name="compress" size={13} />
              </button>
              <label className="doc-html-zoom-control">
                <span>缩放 {zoomPercent}%</span>
                <input
                  type="range"
                  min={HTML_MOBILE_ZOOM_MIN}
                  max={HTML_MOBILE_ZOOM_MAX}
                  step={HTML_MOBILE_ZOOM_WHEEL_STEP}
                  value={zoomPercent}
                  aria-label="手机网页缩放比例"
                  onChange={(event) => onZoomChange(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        ) : null}
        <div ref={previewScrollRef} className="doc-html-preview-scroll">
          {deviceMode === "mobile" ? (
            <div
              className="doc-html-mobile-frame-shell"
              style={{
                width: mobilePreset.width * (zoomPercent / 100),
                height: mobilePreset.height * (zoomPercent / 100),
              }}
            >
              <iframe
                ref={iframeRef}
                className="doc-html-preview-frame mobile"
                title={filename}
                src={src}
                style={{
                  width: mobilePreset.width,
                  height: mobilePreset.height,
                  transform: `scale(${zoomPercent / 100})`,
                  transformOrigin: "top left",
                }}
                sandbox="allow-scripts allow-forms allow-modals"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              className="doc-html-preview-frame"
              title={filename}
              src={src}
              sandbox="allow-scripts allow-forms allow-modals"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
      <div className={`doc-html-preview-console${consoleOpen ? " open" : ""}`}>
        <div className="doc-html-preview-console-bar">
          <button type="button" onClick={() => setConsoleOpen((open) => !open)}>
            控制台{errorCount ? ` · ${errorCount}` : logs.length ? ` · ${logs.length}` : ""}
          </button>
          {consoleOpen ? (
            <button type="button" onClick={() => setLogs([])} disabled={!logs.length}>
              清空
            </button>
          ) : null}
        </div>
        {consoleOpen ? (
          <div className="doc-html-preview-console-log" role="log">
            {logs.length ? (
              logs.map((row) => (
                <p key={row.id} className={`doc-html-preview-console-${row.level}`}>
                  <span>{row.level}</span>
                  {row.args.join(" ")}
                </p>
              ))
            ) : (
              <p className="muted">暂无输出。脚本报错或资源 404 会出现在这里。</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
