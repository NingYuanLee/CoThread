import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
// 机模外观全部来自 miniprogram-* 类名，样式表必须随本组件一起加载，
// 不能依赖「小程序云开发」那条懒加载链路。
import "./miniprogram.css";

export type PreviewDevice = {
  id: string;
  label: string;
  width: number;
  height: number;
  /** 机身四边黑边，屏幕之外的部分。 */
  bezel: { top: number; right: number; bottom: number; left: number };
  /** 屏幕圆角与外框圆角。 */
  screenRadius: number;
  frameRadius: number;
  /** 顶部开孔样式：刘海 / 灵动岛 / 居中挖孔 / 无。 */
  cutout: "notch" | "island" | "punch" | "none";
  /** 底部横条（全面屏手势条）。 */
  homeIndicator: boolean;
  /** 底部实体 Home 键（带下巴的老机型）。 */
  homeButton: boolean;
  /** 侧边实体按键。 */
  sideButtons: boolean;
};

export type PreviewDeviceGroup = {
  label: string;
  devices: PreviewDevice[];
};

/**
 * 全站唯一的机型表：Dimina 预览、Admin 预览手机模式、HTML 阅览手机模式
 * 三处共用同一份 `width/height`（屏幕逻辑尺寸，与浏览器设备模式口径一致）
 * 与机身材质，所以同一机型在三个地方长得完全一样。
 *
 * 机型是两套旧清单的并集（小程序工作台的 7 款 + HTML 阅览的 12 款），
 * 去重后按品牌分组；新增机型只要改这里一处。
 */
export const PREVIEW_DEVICE_GROUPS: PreviewDeviceGroup[] = [
  {
    label: "苹果 Apple",
    devices: [
      {
        id: "iphone-se",
        label: "iPhone SE",
        width: 375,
        height: 667,
        bezel: { top: 46, right: 10, bottom: 58, left: 10 },
        screenRadius: 2,
        frameRadius: 26,
        cutout: "none",
        homeIndicator: false,
        homeButton: true,
        sideButtons: true,
      },
      {
        id: "iphone-13-mini",
        label: "iPhone 13 mini",
        width: 375,
        height: 812,
        bezel: { top: 12, right: 11, bottom: 12, left: 11 },
        screenRadius: 40,
        frameRadius: 48,
        cutout: "notch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-14",
        label: "iPhone 14",
        width: 390,
        height: 844,
        bezel: { top: 12, right: 12, bottom: 12, left: 12 },
        screenRadius: 44,
        frameRadius: 52,
        cutout: "notch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-14-pro-max",
        label: "iPhone 14 Pro Max",
        width: 430,
        height: 932,
        bezel: { top: 12, right: 12, bottom: 12, left: 12 },
        screenRadius: 50,
        frameRadius: 58,
        cutout: "island",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-17e",
        label: "iPhone 17e",
        width: 375,
        height: 769,
        bezel: { top: 12, right: 12, bottom: 12, left: 12 },
        screenRadius: 44,
        frameRadius: 52,
        cutout: "notch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-18-pro",
        label: "iPhone 18 Pro",
        width: 375,
        height: 782,
        bezel: { top: 11, right: 11, bottom: 11, left: 11 },
        screenRadius: 46,
        frameRadius: 54,
        cutout: "island",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-18-pro-max",
        label: "iPhone 18 Pro Max",
        width: 390,
        height: 817,
        bezel: { top: 11, right: 11, bottom: 11, left: 11 },
        screenRadius: 48,
        frameRadius: 56,
        cutout: "island",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "iphone-air",
        label: "iPhone Air",
        width: 393,
        height: 824,
        bezel: { top: 10, right: 10, bottom: 10, left: 10 },
        screenRadius: 48,
        frameRadius: 56,
        cutout: "island",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "ipad-mini",
        label: "iPad mini",
        width: 744,
        height: 1133,
        bezel: { top: 18, right: 18, bottom: 18, left: 18 },
        screenRadius: 16,
        frameRadius: 24,
        cutout: "none",
        homeIndicator: false,
        homeButton: false,
        sideButtons: true,
      },
    ],
  },
  {
    label: "华为 Huawei",
    devices: [
      {
        id: "huawei-pura-90",
        label: "HUAWEI Pura 90",
        width: 390,
        height: 815,
        bezel: { top: 9, right: 9, bottom: 9, left: 9 },
        screenRadius: 32,
        frameRadius: 40,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "huawei-mate-x7",
        label: "HUAWEI Mate X7 外屏",
        width: 382,
        height: 813,
        bezel: { top: 9, right: 9, bottom: 9, left: 9 },
        screenRadius: 30,
        frameRadius: 38,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "huawei-mate-xt-2",
        label: "HUAWEI Mate XT 2 折叠屏",
        width: 360,
        height: 771,
        bezel: { top: 9, right: 9, bottom: 9, left: 9 },
        screenRadius: 28,
        frameRadius: 36,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "huawei-pura-x-max",
        label: "HUAWEI Pura X Max 展开",
        width: 360,
        height: 508,
        bezel: { top: 10, right: 10, bottom: 10, left: 10 },
        screenRadius: 24,
        frameRadius: 32,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
    ],
  },
  {
    label: "安卓 Android",
    devices: [
      {
        id: "xiaomi-17",
        label: "Xiaomi 17",
        width: 360,
        height: 759,
        bezel: { top: 8, right: 8, bottom: 8, left: 8 },
        screenRadius: 26,
        frameRadius: 34,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "xiaomi-17-ultra",
        label: "Xiaomi 17 Ultra",
        width: 390,
        height: 818,
        bezel: { top: 8, right: 8, bottom: 8, left: 8 },
        screenRadius: 28,
        frameRadius: 36,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "pixel-7",
        label: "Pixel 7",
        width: 412,
        height: 915,
        bezel: { top: 10, right: 10, bottom: 10, left: 10 },
        screenRadius: 28,
        frameRadius: 36,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "galaxy-s20",
        label: "Galaxy S20",
        width: 360,
        height: 800,
        bezel: { top: 9, right: 9, bottom: 9, left: 9 },
        screenRadius: 30,
        frameRadius: 38,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "galaxy-s26",
        label: "Samsung Galaxy S26",
        width: 375,
        height: 781,
        bezel: { top: 9, right: 9, bottom: 9, left: 9 },
        screenRadius: 30,
        frameRadius: 38,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
      {
        id: "galaxy-z-fold7",
        label: "Samsung Galaxy Z Fold7 内屏",
        width: 324,
        height: 360,
        bezel: { top: 10, right: 10, bottom: 10, left: 10 },
        screenRadius: 24,
        frameRadius: 32,
        cutout: "punch",
        homeIndicator: true,
        homeButton: false,
        sideButtons: true,
      },
    ],
  },
];

export const PREVIEW_DEVICES: PreviewDevice[] = PREVIEW_DEVICE_GROUPS.flatMap(
  (group) => group.devices,
);

/** 小程序工作台（Dimina / Admin 预览）的默认机型。 */
export const PREVIEW_DEFAULT_DEVICE_ID = "iphone-14";

/** HTML 阅览手机模式的默认机型：沿用它原来的机型口径。 */
export const DOC_PREVIEW_DEFAULT_DEVICE_ID = "iphone-18-pro-max";

export const PREVIEW_ZOOM_OPTIONS = [
  { value: "fit", label: "适应屏幕" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
];

export function findPreviewDevice(deviceId: string): PreviewDevice {
  return PREVIEW_DEVICES.find((item) => item.id === deviceId) ?? PREVIEW_DEVICES[0];
}

export function chassisSize(device: PreviewDevice) {
  return {
    width: device.width + device.bezel.left + device.bezel.right,
    height: device.height + device.bezel.top + device.bezel.bottom,
  };
}

/**
 * 机模本体：机身 + 屏幕 + 开孔/按键，屏幕内容由 children 提供。
 *
 * 三处手机模式都渲染这一个组件，所以机身、圆角、开孔、按键只会有一套实现；
 * 它只负责尺寸与缩放，不干预屏幕内容怎么渲染，也不给 iframe 加 sandbox。
 */
export function MiniProgramPhoneFrame({
  device,
  zoom,
  boxClassName,
  children,
}: {
  device: PreviewDevice;
  /** 缩放比例，1 = 100%。按 transform 缩放，屏幕上仍是逻辑尺寸。 */
  zoom: number;
  /** 附加到机身占位元素上的类名（各调用方用它挂自己的布局样式）。 */
  boxClassName?: string;
  children: ReactNode;
}) {
  const chassis = chassisSize(device);
  return (
    <div
      className={`miniprogram-device-box${boxClassName ? ` ${boxClassName}` : ""}`}
      style={{ width: chassis.width * zoom, height: chassis.height * zoom }}
    >
      <div
        className="miniprogram-phone"
        style={{
          width: chassis.width,
          height: chassis.height,
          padding: `${device.bezel.top}px ${device.bezel.right}px ${device.bezel.bottom}px ${device.bezel.left}px`,
          borderRadius: device.frameRadius,
          transform: `scale(${zoom})`,
        }}
      >
        {device.sideButtons ? (
          <>
            <span className="miniprogram-phone-btn miniprogram-phone-btn-power" />
            <span className="miniprogram-phone-btn miniprogram-phone-btn-vol-up" />
            <span className="miniprogram-phone-btn miniprogram-phone-btn-vol-down" />
          </>
        ) : null}
        <div
          className="miniprogram-phone-screen"
          style={{
            width: device.width,
            height: device.height,
            borderRadius: device.screenRadius,
          }}
        >
          {children}
          {device.cutout === "notch" ? (
            <span className="miniprogram-phone-notch" aria-hidden="true" />
          ) : null}
          {device.cutout === "island" ? (
            <span className="miniprogram-phone-island" aria-hidden="true" />
          ) : null}
          {device.cutout === "punch" ? (
            <span className="miniprogram-phone-punch" aria-hidden="true" />
          ) : null}
          {device.homeIndicator ? (
            <span className="miniprogram-phone-home-bar" aria-hidden="true" />
          ) : null}
        </div>
        {device.homeButton ? (
          <span className="miniprogram-phone-home-button" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}

/**
 * 「适应屏幕」的缩放计算：随舞台尺寸变化重算。
 *
 * 三处预览统一口径：**整台设备完整可见且永不放大**（contain），
 * 最紧的那一边决定缩放比例，所以换机型或改窗口都不会把机身挤出可视区。
 */
export function useDeviceFitZoom(stageRef: RefObject<HTMLElement | null>, device: PreviewDevice) {
  const [zoom, setZoom] = useState(1);
  const chassis = chassisSize(device);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const measure = () => {
      const styles = window.getComputedStyle(stage);
      const horizontalPadding =
        (Number.parseFloat(styles.paddingLeft) || 0) +
        (Number.parseFloat(styles.paddingRight) || 0);
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) +
        (Number.parseFloat(styles.paddingBottom) || 0);
      const availableWidth = stage.clientWidth - horizontalPadding;
      const availableHeight = stage.clientHeight - verticalPadding;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const next = Math.min(availableWidth / chassis.width, availableHeight / chassis.height, 1);
      setZoom(Math.max(0.01, next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [chassis.height, chassis.width, stageRef]);

  return zoom;
}

/**
 * 手机机模外壳：机型下拉 + 缩放下拉 + 舞台 + 机身，屏幕内容由 children 提供。
 *
 * 小程序 Web 预览（Dimina 画布）与 Admin 预览共用同一套外壳，
 * 同源 cookie、CloudBase 鉴权与 HMR WebSocket 都不受影响。
 */
export function MiniProgramDeviceShell({
  deviceId,
  onDeviceIdChange,
  zoomMode,
  onZoomModeChange,
  deviceAriaLabel = "预览机型",
  zoomAriaLabel = "预览缩放",
  notice,
  children,
}: {
  deviceId: string;
  onDeviceIdChange: (value: string) => void;
  zoomMode: string;
  onZoomModeChange: (value: string) => void;
  deviceAriaLabel?: string;
  zoomAriaLabel?: string;
  /** 控制条与舞台之间的附加提示，例如启动失败原因。 */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const device = findPreviewDevice(deviceId);
  const fitZoom = useDeviceFitZoom(stageRef, device);
  const zoom = zoomMode === "fit" ? fitZoom : Number(zoomMode) || 1;

  return (
    <div className="miniprogram-canvas-shell">
      <div className="miniprogram-canvas-bar">
        <div className="miniprogram-device-controls">
          <select
            aria-label={deviceAriaLabel}
            value={deviceId}
            onChange={(event) => onDeviceIdChange(event.target.value)}
          >
            {PREVIEW_DEVICE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.devices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label={zoomAriaLabel}
            value={zoomMode}
            onChange={(event) => onZoomModeChange(event.target.value)}
          >
            {PREVIEW_ZOOM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="miniprogram-device-size">
            {device.width}×{device.height} · {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>
      {notice}
      <div className="miniprogram-stage" ref={stageRef}>
        <MiniProgramPhoneFrame device={device} zoom={zoom}>
          {children}
        </MiniProgramPhoneFrame>
      </div>
    </div>
  );
}
