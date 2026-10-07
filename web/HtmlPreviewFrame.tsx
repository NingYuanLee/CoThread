import { useCallback, useEffect, useRef, useState } from "react";
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
  { id: "iphone-18-pro", label: "iPhone 18 Pro", width: 375, height: 782 },
  { id: "iphone-18-pro-max", label: "iPhone 18 Pro Max", width: 390, height: 817 },
  { id: "iphone-air", label: "iPhone Air", width: 393, height: 824 },
  { id: "iphone-17e", label: "iPhone 17e", width: 375, height: 769 },
  { id: "huawei-pura-90", label: "HUAWEI Pura 90", width: 390, height: 815 },
  { id: "huawei-mate-x7", label: "HUAWEI Mate X7 外屏", width: 382, height: 813 },
  { id: "huawei-pura-x-max", label: "HUAWEI Pura X Max 展开", width: 360, height: 508 },
  { id: "huawei-mate-xt-2", label: "HUAWEI Mate XT 2 折叠屏", width: 360, height: 771 },
  { id: "xiaomi-17", label: "Xiaomi 17", width: 360, height: 759 },
  { id: "xiaomi-17-ultra", label: "Xiaomi 17 Ultra", width: 390, height: 818 },
  { id: "galaxy-s26", label: "Samsung Galaxy S26", width: 375, height: 781 },
  {
    id: "galaxy-z-fold7",
    label: "Samsung Galaxy Z Fold7 内屏",
    width: 324,
    height: 360,
  },
];

const HTML_MOBILE_ZOOM_MIN = 50;
const HTML_MOBILE_ZOOM_MAX = 150;
const HTML_MOBILE_ZOOM_OPTIONS = [50, 75, 100, 125, 150];

type HtmlMobileAppearance = {
  bezel: { top: number; right: number; bottom: number; left: number };
  screenRadius: number;
  frameRadius: number;
  cutout: "notch" | "island" | "punch" | "none";
  homeIndicator: boolean;
  sideButtons: boolean;
};

function mobileAppearance(preset: HtmlMobilePreset): HtmlMobileAppearance {
  if (preset.id.startsWith("iphone-")) {
    return {
      bezel: { top: 12, right: 12, bottom: 12, left: 12 },
      screenRadius: 44,
      frameRadius: 52,
      cutout: preset.id === "iphone-17e" ? "notch" : "island",
      homeIndicator: true,
      sideButtons: true,
    };
  }
  if (preset.id === "huawei-pura-x-max" || preset.id === "galaxy-z-fold7") {
    return {
      bezel: { top: 10, right: 10, bottom: 10, left: 10 },
      screenRadius: 24,
      frameRadius: 32,
      cutout: "punch",
      homeIndicator: true,
      sideButtons: true,
    };
  }
  return {
    bezel: { top: 10, right: 10, bottom: 10, left: 10 },
    screenRadius: 30,
    frameRadius: 38,
    cutout: "punch",
    homeIndicator: true,
    sideButtons: true,
  };
}

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
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const onNavigateRef = useRef(onNavigate);
  const onNewWindowRef = useRef(onNewWindow);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: number; level: string; args: string[] }>>([]);
  const [zoomMode, setZoomMode] = useState<"fit" | "manual">("fit");

  const appearance = mobileAppearance(mobilePreset);
  const chassisWidth =
    mobilePreset.width + appearance.bezel.left + appearance.bezel.right;
  const chassisHeight =
    mobilePreset.height + appearance.bezel.top + appearance.bezel.bottom;
  const zoom = zoomPercent / 100;

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
  const fitZoomToWidth = useCallback(() => {
    if (deviceMode !== "mobile") return;
    const scroll = previewScrollRef.current;
    if (!scroll) return;
    const styles = window.getComputedStyle(scroll);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const availableWidth = scroll.clientWidth - paddingLeft - paddingRight;
    if (availableWidth <= 0 || chassisWidth <= 0) return;
    const nextZoom = Math.floor((availableWidth / chassisWidth) * 100);
    onZoomChange(Math.min(HTML_MOBILE_ZOOM_MAX, Math.max(HTML_MOBILE_ZOOM_MIN, nextZoom)));
  }, [chassisWidth, deviceMode, onZoomChange]);

  useEffect(() => {
    if (deviceMode !== "mobile" || zoomMode !== "fit") return undefined;
    fitZoomToWidth();
    const scroll = previewScrollRef.current;
    if (!scroll || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(fitZoomToWidth);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [deviceMode, fitZoomToWidth, mobilePreset.id, zoomMode]);

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
      <div className={`doc-html-preview-viewport doc-html-preview-viewport-${deviceMode}`}>
        {deviceMode === "mobile" ? (
          <div className="miniprogram-canvas-bar doc-html-mobile-controls">
            <div className="miniprogram-device-controls" aria-label="手机预览设置">
              <select
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
              <select
                aria-label="手机网页缩放比例"
                value={zoomMode === "fit" ? "fit" : String(zoomPercent)}
                onChange={(event) => {
                  if (event.target.value === "fit") {
                    setZoomMode("fit");
                    fitZoomToWidth();
                    return;
                  }
                  setZoomMode("manual");
                  onZoomChange(Number(event.target.value));
                }}
              >
                <option value="fit">适应屏幕</option>
                {HTML_MOBILE_ZOOM_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
              <span className="miniprogram-device-size">
                {mobilePreset.width}×{mobilePreset.height} · {zoomPercent}%
              </span>
            </div>
          </div>
        ) : null}
        <div ref={previewScrollRef} className="doc-html-preview-scroll">
          {deviceMode === "mobile" ? (
            <div
              className="miniprogram-device-box doc-html-mobile-frame-shell"
              style={{
                width: chassisWidth * zoom,
                height: chassisHeight * zoom,
              }}
            >
              <div
                className="miniprogram-phone"
                style={{
                  width: chassisWidth,
                  height: chassisHeight,
                  padding: `${appearance.bezel.top}px ${appearance.bezel.right}px ${appearance.bezel.bottom}px ${appearance.bezel.left}px`,
                  borderRadius: appearance.frameRadius,
                  transform: `scale(${zoom})`,
                }}
              >
                {appearance.sideButtons ? (
                  <>
                    <span className="miniprogram-phone-btn miniprogram-phone-btn-power" />
                    <span className="miniprogram-phone-btn miniprogram-phone-btn-vol-up" />
                    <span className="miniprogram-phone-btn miniprogram-phone-btn-vol-down" />
                  </>
                ) : null}
                <div
                  className="miniprogram-phone-screen"
                  style={{
                    width: mobilePreset.width,
                    height: mobilePreset.height,
                    borderRadius: appearance.screenRadius,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    className="doc-html-preview-frame mobile"
                    title={filename}
                    src={src}
                    sandbox="allow-scripts allow-forms allow-modals"
                    referrerPolicy="no-referrer"
                  />
                  {appearance.cutout === "notch" ? (
                    <span className="miniprogram-phone-notch" aria-hidden="true" />
                  ) : null}
                  {appearance.cutout === "island" ? (
                    <span className="miniprogram-phone-island" aria-hidden="true" />
                  ) : null}
                  {appearance.cutout === "punch" ? (
                    <span className="miniprogram-phone-punch" aria-hidden="true" />
                  ) : null}
                  {appearance.homeIndicator ? (
                    <span className="miniprogram-phone-home-bar" aria-hidden="true" />
                  ) : null}
                </div>
              </div>
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
