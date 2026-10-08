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
// 手机模式与 Dimina / Admin 预览共用同一份机型表与机模，类名走的还是 miniprogram-*，
// 样式表必须随本组件一起加载：不能依赖小程序工作台那条懒加载链路，
// 没开过「小程序云开发」时它会缺席，机模会裸奔。
import {
  MiniProgramPhoneFrame,
  PREVIEW_DEVICE_GROUPS,
  findPreviewDevice,
  useDeviceFitZoom,
} from "./MiniProgramDeviceShell";
import "./miniprogram.css";

// 手动缩放档位；「适应屏幕」不走档位，见下方 FIT_MIN。
const HTML_MOBILE_ZOOM_OPTIONS = [50, 75, 100, 125, 150];
// contain 口径下比例不会超过 100%，这里只用一个下限兜底极小的预览区。
const HTML_MOBILE_FIT_MIN = 25;

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
  mobileDeviceId,
  onDeviceModeChange,
  onMobileDeviceIdChange,
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
  /** 机型来自全站唯一的机型表（见 MiniProgramDeviceShell）。 */
  mobileDeviceId: string;
  onDeviceModeChange: (mode: HtmlDeviceMode) => void;
  onMobileDeviceIdChange: (deviceId: string) => void;
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

  const mobileDevice = findPreviewDevice(mobileDeviceId);
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
  // 「适应屏幕」与 Dimina / Admin 预览同一个口径：整机完整可见且永不放大（contain）。
  const fitZoom = useDeviceFitZoom(previewScrollRef, mobileDevice);
  const fitZoomPercent = Math.max(HTML_MOBILE_FIT_MIN, Math.floor(fitZoom * 100));

  useEffect(() => {
    if (deviceMode !== "mobile" || zoomMode !== "fit") return;
    onZoomChange(fitZoomPercent);
  }, [deviceMode, fitZoomPercent, onZoomChange, zoomMode]);

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
                value={mobileDeviceId}
                onChange={(event) => onMobileDeviceIdChange(event.target.value)}
              >
                {PREVIEW_DEVICE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.label}
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
                {mobileDevice.width}×{mobileDevice.height} · {zoomPercent}%
              </span>
            </div>
          </div>
        ) : null}
        <div ref={previewScrollRef} className="doc-html-preview-scroll">
          {deviceMode === "mobile" ? (
            <MiniProgramPhoneFrame
              device={mobileDevice}
              zoom={zoom}
              boxClassName="doc-html-mobile-frame-shell"
            >
              <iframe
                ref={iframeRef}
                className="doc-html-preview-frame mobile"
                title={filename}
                src={src}
                sandbox="allow-scripts allow-forms allow-modals"
                referrerPolicy="no-referrer"
              />
            </MiniProgramPhoneFrame>
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
