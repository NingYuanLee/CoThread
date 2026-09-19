import React, { useCallback, useEffect, useRef, useState } from "react";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { UiIcon } from "./ui-icon";
import {
  clampImageZoom,
  fitImageScale,
  stepImageZoom,
  zoomImageAround,
} from "../shared/image-preview.js";

async function blobToPng(blob: Blob) {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法转换图片");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("无法转换图片"))), "image/png");
  });
}

export function ImagePreviewDialog({
  id,
  title,
  filename,
  onClose,
}: {
  id: string;
  title: string;
  filename?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const userAdjusted = useRef(false);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const src = `/api/versions/${id}/source`;
  const downloadName = filename || title || "image";

  const applyFit = useCallback((width = natural.width, height = natural.height) => {
    const view = viewportRef.current;
    if (!view || !width || !height) return 1;
    const next = fitImageScale(width, height, view.clientWidth, view.clientHeight);
    setScale(next);
    setOffset({ x: 0, y: 0 });
    return next;
  }, [natural.height, natural.width]);

  const zoomBy = useCallback((direction: number, origin?: { x: number; y: number }) => {
    userAdjusted.current = true;
    setScale((current) => {
      const nextScale = stepImageZoom(current, direction);
      setOffset((previous) => {
        const moved = zoomImageAround({
          scale: current,
          nextScale,
          offsetX: previous.x,
          offsetY: previous.y,
          originX: origin?.x ?? 0,
          originY: origin?.y ?? 0,
        });
        return { x: moved.offsetX, y: moved.offsetY };
      });
      return nextScale;
    });
  }, []);

  useEffect(() => {
    userAdjusted.current = false;
    setNatural({ width: 0, height: 0 });
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setStatus("");
    dialogRef.current?.focus();
  }, [id]);

  useEffect(() => {
    const view = viewportRef.current;
    if (!view || !natural.width) return;
    const observer = new ResizeObserver(() => {
      if (!userAdjusted.current) applyFit();
    });
    observer.observe(view);
    return () => observer.disconnect();
  }, [applyFit, natural.width]);

  useEffect(() => {
    const view = viewportRef.current;
    if (!view) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = view.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 1 : -1, {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
    };
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => view.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const copyImage = async () => {
    setStatus("");
    try {
      const response = await fetch(`/api/versions/${id}/download`);
      if (!response.ok) throw new Error("无法读取图片");
      const blob = await blobToPng(await response.blob());
      if (!navigator.clipboard?.write) throw new Error("当前环境不支持复制图片");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("已复制");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "复制失败");
    }
  };

  const downloadImage = () => {
    const link = document.createElement("a");
    link.href = `/api/versions/${id}/download`;
    link.download = downloadName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("已开始下载");
  };

  return (
    <ModalBackdrop className="image-preview-backdrop" onClose={onClose}>
      {(close) => (
        <section
          ref={dialogRef}
          className="image-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoomBy(1);
            } else if (event.key === "-" || event.key === "_") {
              event.preventDefault();
              zoomBy(-1);
            } else if (event.key === "0") {
              event.preventDefault();
              userAdjusted.current = false;
              applyFit();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
              event.preventDefault();
              void copyImage();
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              downloadImage();
            }
          }}
        >
          <header className="image-preview-dialog-header">
            <strong title={title}>{title}</strong>
            <div className="image-preview-tools">
              {status ? <span className="image-preview-status" role="status">{status}</span> : null}
              <button type="button" title="缩小" aria-label="缩小" onClick={() => zoomBy(-1)}>
                <UiIcon name="zoomOut" size={16} />
              </button>
              <button type="button" title="放大" aria-label="放大" onClick={() => zoomBy(1)}>
                <UiIcon name="zoomIn" size={16} />
              </button>
              <span className="image-preview-scale">{Math.round(clampImageZoom(scale) * 100)}%</span>
              <button type="button" title="复制图片" aria-label="复制图片" onClick={() => void copyImage()}>
                <UiIcon name="copy" size={16} />
              </button>
              <button type="button" title="下载" aria-label="下载" onClick={downloadImage}>
                <UiIcon name="download" size={16} />
              </button>
              <DialogClose autoFocus onClick={close} label="关闭预览" />
            </div>
          </header>
          <div
            ref={viewportRef}
            className={`image-preview-stage${dragging ? " is-dragging" : ""}`}
            onDoubleClick={() => {
              userAdjusted.current = false;
              applyFit();
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
              setDragging(true);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              userAdjusted.current = true;
              setOffset({
                x: drag.current.offsetX + (event.clientX - drag.current.x),
                y: drag.current.offsetY + (event.clientY - drag.current.y),
              });
            }}
            onPointerUp={(event) => {
              drag.current = null;
              setDragging(false);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragging(false);
            }}
          >
            <div
              className="image-preview-canvas"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
            >
              <img
                src={src}
                alt={title}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setNatural({ width: image.naturalWidth, height: image.naturalHeight });
                  userAdjusted.current = false;
                  applyFit(image.naturalWidth, image.naturalHeight);
                }}
              />
            </div>
          </div>
        </section>
      )}
    </ModalBackdrop>
  );
}
