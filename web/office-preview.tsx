import { useEffect, useRef, useState } from "react";

function escapeCode(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function highlightCode(value: string, filename?: string) {
  const escaped = escapeCode(value);
  const extension = filename?.toLowerCase().split(".").pop() || "";
  const python = extension === "py";
  const script = ["js", "jsx", "ts", "tsx"].includes(extension);
  const data = ["json", "yaml", "yml"].includes(extension);
  const style = extension === "css";
  const markup = ["html", "htm", "xml", "svg"].includes(extension);
  const sql = extension === "sql";
  if (!(python || script || data || style || markup || sql)) return escaped;
  let highlighted = escaped
    .replace(/(\/\/.*|#[^<]*)$/g, '<span class="code-token-comment">$1</span>')
    .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*`)/g, '<span class="code-token-string">$1</span>');
  if (markup) {
    highlighted = highlighted.replace(/(&lt;\/?[a-zA-Z][^&]*?&gt;)/g, '<span class="code-token-keyword">$1</span>');
  } else {
    highlighted = highlighted
      .replace(/\b(def|class|return|if|else|elif|for|while|in|import|from|as|with|try|except|True|False|None|and|or|not|is|const|let|var|function|async|await|new|export|default|interface|type|public|private|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|CREATE|TABLE|NULL|true|false|null)\b/g, '<span class="code-token-keyword">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="code-token-number">$1</span>');
  }
  if (data || style) highlighted = highlighted.replace(/([A-Za-z_$][\w$-]*)(?=\s*:)/g, '<span class="code-token-keyword">$1</span>');
  return highlighted;
}

const CODE_PREVIEW_PLAIN_CHARS = 80_000;

export function CodePreview({ text, filename }: { text: string; filename?: string }) {
  if (text.length > CODE_PREVIEW_PLAIN_CHARS) {
    return (
      <pre className="code-preview-content code-preview-plain" role="document" aria-label={filename || "代码文件"}>
        {text}
      </pre>
    );
  }
  const lines = text.split("\n");
  return (
    <div className="code-preview" role="document" aria-label={filename || "代码文件"}>
      <div className="code-preview-gutter" aria-hidden="true">
        {lines.map((_, index) => <span key={index}>{index + 1}</span>)}
      </div>
      <pre className="code-preview-content"><code>{lines.map((line, index) => (
        <span className="code-preview-line" key={index} dangerouslySetInnerHTML={{ __html: highlightCode(line, filename) }} />
      ))}</code></pre>
    </div>
  );
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xlsxSheetToFullHtml(
  sheet: import("xlsx").WorkSheet,
  formatCell: (cell: import("xlsx").CellObject) => string,
  decodeRange: (ref: string) => import("xlsx").Range,
  encodeCell: (cell: { r: number; c: number }) => string,
): string {
  const ref = sheet["!ref"];
  if (!ref) return "<table><tbody><tr><td></td></tr></tbody></table>";
  const range = decodeRange(ref);
  const merges = sheet["!merges"] || [];
  const covered = new Set<string>();
  for (const merge of merges) {
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r !== merge.s.r || c !== merge.s.c) covered.add(encodeCell({ r, c }));
      }
    }
  }
  const columnName = (index: number) => {
    let value = "";
    let current = index + 1;
    while (current > 0) {
      const remainder = (current - 1) % 26;
      value = String.fromCharCode(65 + remainder) + value;
      current = Math.floor((current - 1) / 26);
    }
    return value;
  };
  const columns: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    columns.push(`<th class="xlsx-column-header">${columnName(c)}</th>`);
  }
  const rows: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = [`<th class="xlsx-row-header">${r - range.s.r + 1}</th>`];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = encodeCell({ r, c });
      if (covered.has(addr)) continue;
      const merge = merges.find((m) => m.s.r === r && m.s.c === c);
      const cell = sheet[addr];
      const text = cell != null ? formatCell(cell) : "";
      const attrs = merge
        ? ` rowspan="${merge.e.r - merge.s.r + 1}" colspan="${merge.e.c - merge.s.c + 1}"`
        : "";
      cells.push(`<td${attrs}>${escapeHtml(text)}</td>`);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table><thead><tr><th class="xlsx-corner"></th>${columns.join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

export function DocxPreview({ bytes }: { bytes: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    void (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (!alive || !host.current) return;
        host.current.innerHTML = "";
        await renderAsync(bytes, host.current, undefined, {
          className: "docx-preview-content",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
      } catch (cause) {
        if (alive) setError((cause as Error).message || "DOCX 解析失败");
      }
    })();
    return () => {
      alive = false;
    };
  }, [bytes]);
  if (error) return <p className="muted">无法预览此 DOCX 文档（{error}），请下载原文件查看。</p>;
  return <div className="docx-preview docx-preview-a4" ref={host} />;
}

const HTML_VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

export function formatHtmlSource(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const tokens = normalized.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || [];
  const lines: string[] = [];
  let indent = 0;
  let rawElement: "script" | "style" | null = null;

  const push = (value: string, level = indent) => {
    const text = value.trim();
    if (text) lines.push("  ".repeat(Math.max(0, level)) + text);
  };

  for (const token of tokens) {
    if (rawElement) {
      const close = new RegExp("</" + rawElement + "\\s*>", "i");
      const parts = token.split(close);
      for (const part of parts) {
        if (part.trim()) part.split("\n").forEach((line) => push(line, indent));
      }
      if (close.test(token)) {
        push("</" + rawElement + ">", Math.max(0, indent - 1));
        indent = Math.max(0, indent - 1);
        rawElement = null;
      }
      continue;
    }

    if (!token.startsWith("<")) {
      const text = token.trim();
      if (text) push(text);
      continue;
    }

    const closing = /^<\/\s*([\w:-]+)/.exec(token);
    if (closing) {
      indent = Math.max(0, indent - 1);
      push(token);
      continue;
    }

    push(token);
    const opening = /^<\s*([\w:-]+)/.exec(token);
    const name = opening?.[1]?.toLowerCase();
    const selfClosing = /\/\s*>$/.test(token) || Boolean(name && HTML_VOID_ELEMENTS.has(name));
    if (name === "script" || name === "style") {
      indent += 1;
      rawElement = name;
    } else if (!selfClosing && name) {
      indent += 1;
    }
  }

  return lines.join("\n");
}

let mermaidRenderSequence = 0;
let mermaidModulePromise: Promise<typeof import("mermaid")> | null = null;
let mermaidRenderQueue = Promise.resolve();
const mermaidSvgCache = new Map<string, string>();

function getMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => {
      module.default.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          fontFamily: "Segoe UI, system-ui, sans-serif",
          primaryColor: "#e8f0e8",
          primaryTextColor: "#26352d",
          primaryBorderColor: "#78927d",
          lineColor: "#68776b",
        },
      });
      return module;
    });
  }
  return mermaidModulePromise;
}

export function MermaidPreview({ chart }: { chart: string }) {
  const source = chart.trim();
  const [svg, setSvg] = useState(() => mermaidSvgCache.get(source) || "");
  const [error, setError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    let alive = true;
    const currentRequest = ++request.current;
    const cached = mermaidSvgCache.get(source);
    if (cached) {
      setSvg(cached);
      setError("");
      return () => {
        alive = false;
      };
    }

    setError("");
    void (async () => {
      try {
        const module = await getMermaid();
        const id = "mermaid-preview-" + (++mermaidRenderSequence);
        const task = mermaidRenderQueue.then(() => module.default.render(id, source));
        mermaidRenderQueue = task.then(() => undefined, () => undefined);
        const result = await task;
        if (!alive || currentRequest !== request.current) return;
        mermaidSvgCache.set(source, result.svg);
        setSvg(result.svg);
      } catch (cause) {
        if (alive && currentRequest === request.current) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  if (error) {
    return (
      <div className="markdown-diagram-error">
        <p>图表渲染失败，已回退为 Mermaid 源码。</p>
        <pre><code>{chart}</code></pre>
      </div>
    );
  }
  return (
    <div className="markdown-diagram" role="img" aria-label="Mermaid 图表">
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="markdown-diagram-loading" aria-hidden="true" />}
    </div>
  );
}

export function XlsxPreview({ bytes, filename }: { bytes: Uint8Array; filename?: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    setSheets([]);
    setActive(0);
    void (async () => {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
        const rows = workbook.SheetNames.map((name) => ({
          name,
          html: xlsxSheetToFullHtml(
            workbook.Sheets[name],
            XLSX.utils.format_cell,
            XLSX.utils.decode_range,
            XLSX.utils.encode_cell,
          ),
        }));
        if (alive) setSheets(rows);
      } catch (cause) {
        if (alive) setError((cause as Error).message || "表格解析失败");
      }
    })();
    return () => {
      alive = false;
    };
  }, [bytes]);
  if (error) return <p className="muted">无法预览此表格（{error}），请下载原文件查看。</p>;
  if (!sheets.length) return <p className="muted">正在解析表格…</p>;
  const current = sheets[Math.min(active, sheets.length - 1)];
  return (
    <div className="xlsx-preview">
      <div className="xlsx-preview-toolbar">
        <span className="xlsx-preview-title">{filename || "工作簿"}</span>
        <span className="xlsx-preview-meta">{sheets.length} 个工作表</span>
      </div>
      {sheets.length > 1 ? (
        <div className="xlsx-sheet-tabs" role="tablist" aria-label="工作表">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              onClick={() => setActive(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="xlsx-sheet" dangerouslySetInnerHTML={{ __html: current.html }} />
    </div>
  );
}

type PptxElement =
  | { kind: "text"; text: string; left: number; top: number; width: number; height: number; fontSize: number; bold: boolean; color: string }
  | { kind: "image"; src: string; left: number; top: number; width: number; height: number; rotation: number };

type PptxSlide = { elements: PptxElement[] };

function findDescendant(root: Element | Document, localName: string) {
  return Array.from(root.getElementsByTagName("*")).find((node) => node.localName === localName) || null;
}

function findDescendants(root: Element | Document, localName: string) {
  return Array.from(root.getElementsByTagName("*")).filter((node) => node.localName === localName);
}

function numberAttribute(node: Element | null, name: string) {
  const value = node?.getAttribute(name);
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function relationshipTarget(target: string) {
  const parts: string[] = [];
  for (const part of target.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function readShapeTransform(shape: Element, slideWidth: number, slideHeight: number) {
  const transform = findDescendant(shape, "xfrm");
  const offset = findDescendant(transform || shape, "off");
  const extent = findDescendant(transform || shape, "ext");
  const x = numberAttribute(offset, "x");
  const y = numberAttribute(offset, "y");
  const width = numberAttribute(extent, "cx");
  const height = numberAttribute(extent, "cy");
  return {
    left: (x / slideWidth) * 100,
    top: (y / slideHeight) * 100,
    width: (width / slideWidth) * 100,
    height: (height / slideHeight) * 100,
    rotation: numberAttribute(transform, "rot") / 60000,
  };
}

function readShapeText(shape: Element) {
  const textBody = findDescendant(shape, "txBody");
  if (!textBody) return "";
  return findDescendants(textBody, "p")
    .map((paragraph) => findDescendants(paragraph, "t").map((text) => text.textContent || "").join(""))
    .filter(Boolean)
    .join("\\n");
}

function readShapeTextStyle(shape: Element) {
  const runProperties = findDescendant(shape, "rPr") || findDescendant(shape, "defRPr");
  const size = numberAttribute(runProperties, "sz");
  const color = findDescendant(runProperties || shape, "srgbClr")?.getAttribute("val");
  return {
    fontSize: size > 0 ? Math.max(8, size / 100) : 18,
    bold: runProperties?.getAttribute("b") === "1" || runProperties?.getAttribute("b") === "true",
    color: color ? "#" + color : "#26352d",
  };
}

async function parsePptx(bytes: Uint8Array): Promise<PptxSlide[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const parser = new DOMParser();
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  const presentation = presentationXml ? parser.parseFromString(presentationXml, "application/xml") : null;
  const fallbackDocument = parser.parseFromString("<root />", "application/xml");
  const slideSize = findDescendant(presentation || fallbackDocument, "sldSz");
  const slideWidth = numberAttribute(slideSize, "cx") || 12192000;
  const slideHeight = numberAttribute(slideSize, "cy") || 6858000;
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0));
  const slides: PptxSlide[] = [];
  for (const name of names) {
    const slideXml = await zip.file(name)?.async("text");
    if (!slideXml) continue;
    const slide = parser.parseFromString(slideXml, "application/xml");
    const relName = name.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relXml = await zip.file(relName)?.async("text");
    const relationships = new Map<string, string>();
    if (relXml) {
      const relDoc = parser.parseFromString(relXml, "application/xml");
      for (const relationship of findDescendants(relDoc, "Relationship")) {
        const id = relationship.getAttribute("Id");
        const target = relationship.getAttribute("Target");
        if (id && target) relationships.set(id, relationshipTarget("ppt/slides/" + target));
      }
    }
    const tree = findDescendant(slide, "spTree");
    const elements: PptxElement[] = [];
    for (const child of tree ? Array.from(tree.children) : []) {
      if (child.localName === "sp") {
        const text = readShapeText(child);
        if (!text) continue;
        const transform = readShapeTransform(child, slideWidth, slideHeight);
        const style = readShapeTextStyle(child);
        elements.push({ kind: "text", text, ...transform, ...style });
      } else if (child.localName === "pic") {
        const blip = findDescendant(child, "blip");
        const embed = blip?.getAttribute("r:embed") || blip?.getAttribute("embed") || Array.from(blip?.attributes || []).find((attr) => attr.localName === "embed")?.value;
        const target = embed ? relationships.get(embed) : null;
        const image = target ? zip.file(target) : null;
        if (!image) continue;
        const blob = await image.async("blob");
        const transform = readShapeTransform(child, slideWidth, slideHeight);
        elements.push({ kind: "image", src: URL.createObjectURL(blob), ...transform });
      }
    }
    slides.push({ elements });
  }
  return slides;
}

export function PptxPreview({ bytes }: { bytes: Uint8Array }) {
  const [slides, setSlides] = useState<PptxSlide[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let imageUrls: string[] = [];
    setError("");
    setSlides(null);
    void parsePptx(bytes)
      .then((parsed) => {
        imageUrls = parsed.flatMap((slide) => slide.elements.flatMap((element) => element.kind === "image" ? [element.src] : []));
        if (alive) setSlides(parsed);
      })
      .catch((cause) => {
        if (alive) setError((cause as Error).message || "PPTX 解析失败");
      });
    return () => {
      alive = false;
      for (const url of imageUrls) URL.revokeObjectURL(url);
    };
  }, [bytes]);
  if (error) return <p className="muted">无法预览此演示文稿（{error}），请下载原文件查看。</p>;
  if (!slides) return <p className="muted">正在解析演示文稿…</p>;
  if (!slides.length) return <p className="muted">未在演示文稿中找到幻灯片，请下载原文件查看。</p>;
  return (
    <div className="pptx-preview">
      {slides.map((slide, index) => (
        <article className="pptx-slide-wrap" key={index}>
          <div className="pptx-slide" aria-label={"第 " + (index + 1) + " 页"}>
            {slide.elements.map((element, elementIndex) => {
              const style = {
                left: element.left + "%",
                top: element.top + "%",
                width: element.width + "%",
                height: element.height + "%",
              };
              return element.kind === "image"
                ? <img key={elementIndex} className="pptx-slide-image" style={{ ...style, transform: element.rotation ? "rotate(" + element.rotation + "deg)" : undefined }} src={element.src} alt="" draggable={false} />
                : <div key={elementIndex} className={element.bold ? "pptx-slide-text bold" : "pptx-slide-text"} style={{ ...style, color: element.color, fontSize: (element.fontSize / 14) + "cqw" }}>{element.text}</div>;
            })}
            {!slide.elements.length ? <p className="muted">（此页无可预览内容）</p> : null}
          </div>
          <p className="pptx-slide-label">第 {index + 1} 页</p>
        </article>
      ))}
    </div>
  );
}
