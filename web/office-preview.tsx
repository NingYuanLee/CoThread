import { useEffect, useRef, useState } from "react";

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
  const rows: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = [];
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
  return `<table><tbody>${rows.join("")}</tbody></table>`;
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

export function XlsxPreview({ bytes }: { bytes: Uint8Array }) {
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

export function PptxPreview({ bytes }: { bytes: Uint8Array }) {
  const [slides, setSlides] = useState<string[][] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    setSlides(null);
    void (async () => {
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(bytes);
        const names = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0));
        const parsed: string[][] = [];
        for (const name of names) {
          const xml = await zip.file(name)?.async("text");
          if (!xml) continue;
          const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
            .map((match) => decodeXmlText(match[1]).trim())
            .filter(Boolean);
          parsed.push(texts);
        }
        if (alive) setSlides(parsed);
      } catch (cause) {
        if (alive) setError((cause as Error).message || "PPTX 解析失败");
      }
    })();
    return () => {
      alive = false;
    };
  }, [bytes]);
  if (error) return <p className="muted">无法预览此演示文稿（{error}），请下载原文件查看。</p>;
  if (!slides) return <p className="muted">正在解析演示文稿…</p>;
  if (!slides.length) return <p className="muted">未在演示文稿中找到幻灯片，请下载原文件查看。</p>;
  return (
    <div className="pptx-preview">
      {slides.map((texts, index) => (
        <article className="pptx-slide-wrap" key={index}>
          <div className="pptx-slide" aria-label={`第 ${index + 1} 页`}>
            <div className="pptx-slide-inner">
              {texts.length
                ? texts.map((text, line) => <p key={line}>{text}</p>)
                : <p className="muted">（此页无文本内容）</p>}
            </div>
          </div>
          <p className="pptx-slide-label">第 {index + 1} 页</p>
        </article>
      ))}
    </div>
  );
}
