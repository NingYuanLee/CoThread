import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type SVGProps,
} from "react";
import { FileIcon } from "@react-symbols/icons/utils";
import {
  Document,
  Markdown as MarkdownFile,
  Notebook,
  Python,
  Text,
} from "@react-symbols/icons/files";
import { wechatFileIcons } from "./wechat-file-icons";
import { designPxToRem } from "../shared/ui-scale.js";

function scaleBox(width?: number | string, height?: number | string) {
  return {
    width: typeof width === "number" ? designPxToRem(width) : width,
    height: typeof height === "number" ? designPxToRem(height) : height,
  };
}

const officeIcons = {
  odt: Document,
  rtf: Document,
  odp: Notebook,
  md: MarkdownFile,
  markdown: MarkdownFile,
  txt: Text,
  log: Text,
  env: Text,
  ini: Text,
  conf: Text,
  toml: Text,
  py: Python,
  ...wechatFileIcons,
};

function isSvgFilename(fileName: string) {
  return /\.svg$/i.test(fileName);
}

export function isImageFilename(fileName: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(fileName);
}

function OfficeFileIcon({
  fileName,
  width,
  height,
  ...props
}: { fileName: string } & SVGProps<SVGSVGElement>) {
  const box = scaleBox(width, height);
  const extension = fileName.toLowerCase().split(".").pop() || "";
  const isPresentation = extension === "ppt" || extension === "pptx";
  const isDocument = extension === "doc" || extension === "docx";
  if (!isPresentation && !isDocument) {
    return (
      <FileIcon
        fileName={fileName}
        editFileExtensionData={officeIcons}
        autoAssign
        {...props}
        {...box}
      />
    );
  }

  const accent = isPresentation ? "#d24726" : "#185abd";
  const mark = isPresentation ? "P" : "W";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      {...box}
      aria-hidden={props["aria-hidden"] ?? true}
    >
      <path d="M5 2.75h8.7L19 8.05v13.2H5z" fill="#fff" stroke={accent} strokeWidth="1.4" />
      <path d="M13.7 2.75v5.3H19" fill={accent} opacity=".18" />
      <path d="M13.7 2.75v5.3H19" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="3" y="10.2" width="9.2" height="9.2" rx="1.5" fill={accent} />
      <text
        x="7.6"
        y="17.05"
        fill="#fff"
        fontFamily="Arial, sans-serif"
        fontSize="6.8"
        fontWeight="700"
        textAnchor="middle"
      >
        {mark}
      </text>
    </svg>
  );
}

export function LibraryFileIcon({
  fileName,
  versionId,
  className,
  width,
  height,
}: {
  fileName: string;
  versionId: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (versionId && isSvgFilename(fileName) && !failed) {
    return (
      <img
        src={`/api/versions/${versionId}/source`}
        alt=""
        className={className}
        {...scaleBox(width, height)}
        aria-hidden="true"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <OfficeFileIcon
      fileName={fileName}
      className={className}
      aria-hidden="true"
      {...scaleBox(width, height)}
    />
  );
}

export function TreeIcon({ kind, className }: { kind: string; className?: string }) {
  const paths: Record<string, string | string[]> = {
    folder: "M3 7h6.5l2 2H21v11H3Z",
    globe: [
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
      "M3 12h18",
      "M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21",
      "M12 3C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9",
    ],
    browser: [
      "M4 5.5h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z",
      "M2 9.5h20",
      "M6 7.4h.01",
    ],
    file: "M6 3h8l4 4v14H6Z M14 3v5h5",
    expand: "m9 6 6 6-6 6",
    collapse: "m6 9 6 6 6-6",
    newFolder: "M3 7h6.5l2 2H21v11H3Z M12 12.5v5 M9.5 15h5",
    newFile: "M6 3h8l4 4v14H6Z M9 14h6 M12 11v6",
    upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
    trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    back: "m9 5-6 7 6 7 M3 12h18",
    rename: "M4 20h8 M15.2 4.8 19.2 8.8 8.5 19.5 4.5 20.5 5.5 16.5Z M13.8 6.2 17.8 10.2",
    sortType: "M4 6h10 M4 12h7 M4 18h4 M17 5v14 M14 16l3 3 3-3",
    sortModified: "M12 8v5l3 2 M21 12a9 9 0 1 1-2.6-6.35 M21 4v6h-6",
    organize: [
      "M12 3.2 13.6 8.4 18.8 10 13.6 11.6 12 16.8 10.4 11.6 5.2 10 10.4 8.4Z",
      "M18.4 14.6 19.2 16.7 21.3 17.5 19.2 18.3 18.4 20.4 17.6 18.3 15.5 17.5 17.6 16.7Z",
    ],
    actions: "M5 7h14M5 12h14M5 17h14",
    download: "M12 3v12 M8 11l4 4 4-4 M4 21h16",
    share: "M14 4h6v6 M20 4 12 12 M19 14v5H5V5h5",
    restore: "M4 12a8 8 0 1 0 2.3-5.7 M4 4v6h6",
    addToChat: "M4 5h16v10H8l-4 4Z M8 10h8",
    addToTask: "M9 5H4v14h16V9 M14 4h6v6 M17 4v6 M14 7h6 M8 13h8 M8 17h5",
    copy: ["M8 8h11v11H8z", "M5 16V5h11"],
    info: ["M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16", "M12 11v5", "M12 8h.01"],
    refresh: "M21 12a9 9 0 1 1-3.2-6.9 M21 3v6h-6",
    history: "M12 8v5l3 2 M21 12a9 9 0 1 1-2.6-6.35 M21 4v6h-6",
    closeFile: "M6 6l12 12 M18 6 6 18",
    closeOthers: ["M6 6l12 12 M18 6 6 18", "M4 20h16"],
    closeRight: ["M6 6l12 12 M18 6 6 18", "M20 20V10"],
    closeLeft: ["M6 6l12 12 M18 6 6 18", "M4 20V10"],
  };
  const glyph = paths[kind] || paths.file;
  const d = Array.isArray(glyph) ? glyph : [glyph];
  return (
    <svg
      aria-hidden="true"
      className={className ? `tree-icon ${className}` : "tree-icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function TreeDepth({ depth }: { depth: number }) {
  return <span className="tree-depth" style={{ width: `${depth}rem` }} aria-hidden="true" />;
}

export function ClosedFolderIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `tree-icon ${className}` : "tree-icon"}
      viewBox="0 0 24 24"
      width="1.143rem"
      height="1.143rem"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.4 19.6V6.9c0-.9.7-1.6 1.6-1.6h4c.4 0 .8.16 1.05.44L11.6 7.5h7.4c.9 0 1.6.7 1.6 1.6v10.5c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6Z" />
    </svg>
  );
}

export function OpenFolderIcon({ className }: { className?: string } = {}) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `tree-icon ${className}` : "tree-icon"}
      viewBox="0 0 24 24"
      width="1.143rem"
      height="1.143rem"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.2 9.2V7.1c0-.9.7-1.6 1.6-1.6h3.5c.4 0 .8.15 1.05.42L10.7 7.4h8.1c.9 0 1.6.7 1.6 1.6v1.1" />
      <path d="M3.15 10.7h17.7c.8 0 1.4.74 1.23 1.52l-1.58 7.05A1.7 1.7 0 0 1 18.85 20.8H5.15a1.7 1.7 0 0 1-1.65-1.53l-1.58-7.05A1.26 1.26 0 0 1 3.15 10.7Z" />
    </svg>
  );
}

export function TreeOverflowLabel({ text }: { text: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  const measure = () => {
    const wrap = wrapRef.current;
    const node = textRef.current;
    if (!wrap || !node) return;
    setDistance(Math.max(0, Math.ceil(node.scrollWidth - wrap.clientWidth)));
  };
  useLayoutEffect(() => {
    measure();
  }, [text]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={wrapRef}
      className={`tree-overflow${distance > 0 ? " is-overflow" : ""}`}
      style={
        distance > 0
          ? ({
              "--tree-overflow": `${distance}px`,
              "--tree-overflow-ms": `${Math.min(8000, Math.max(1600, distance * 18))}ms`,
            } as CSSProperties)
          : undefined
      }
      onMouseEnter={measure}
    >
      <span ref={textRef} className="tree-overflow-text">
        {text}
      </span>
    </span>
  );
}
