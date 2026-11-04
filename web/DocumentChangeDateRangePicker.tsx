import { FloatingPanel } from "./FloatingPanel";
import { FloatingPortal } from "./FloatingPortal";
import { Field } from "./Field";
import { useEffect, useId, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";

export type DocumentChangeDateRange = { from: string; to: string };

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function dateRangeLabel({ from, to }: DocumentChangeDateRange) {
  if (!from && !to) return "选择日期范围";
  return `${from || "开始日期"} 至 ${to || "结束日期"}`;
}

export function DocumentChangeDateRangePicker({
  value,
  onChange,
  label,
  min = "1900-01-01",
  max,
}: {
  value: DocumentChangeDateRange;
  onChange: (next: DocumentChangeDateRange) => void;
  /** 传入时把标签放在输入框内左上角；不传则沿用外部标签布局。 */
  label?: string;
  /** 最早可选日期（YYYY-MM-DD），默认 1900-01-01。 */
  min?: string;
  /** 最晚可选日期（YYYY-MM-DD），默认今天。 */
  max?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const minKey = min;
  const maxKey = max ?? dateKey(new Date());
  const canSelect = (key: string) => key >= minKey && key <= maxKey;
  const monthFirstKey = (date: Date) => dateKey(new Date(date.getFullYear(), date.getMonth(), 1));
  const monthLastKey = (date: Date) =>
    dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  const canShowMonth = (date: Date) =>
    monthLastKey(date) >= minKey && monthFirstKey(date) <= maxKey;
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseDateKey(value.from) || parseDateKey(value.to) || new Date();
    let month = new Date(initial.getFullYear(), initial.getMonth(), 1);
    if (monthLastKey(month) < minKey) {
      const lower = parseDateKey(minKey);
      if (lower) month = new Date(lower.getFullYear(), lower.getMonth(), 1);
    }
    if (monthFirstKey(month) > maxKey) {
      const upper = parseDateKey(maxKey);
      if (upper) month = new Date(upper.getFullYear(), upper.getMonth(), 1);
    }
    return month;
  });

  const shiftMonth = (delta: number) =>
    setViewMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
      return canShowMonth(next) ? next : current;
    });

  const toggle = () => {
    if (!open) {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: rect.bottom + 6,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 360)),
        });
    }
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const firstCell = new Date(monthStart);
  firstCell.setDate(1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstCell);
    day.setDate(firstCell.getDate() + index);
    return day;
  });
  const rangeEnd = value.to || (value.from && hovered ? hovered : "");
  const rangeStart = value.from && rangeEnd && rangeEnd < value.from ? rangeEnd : value.from;
  const normalizedEnd = value.from && rangeEnd && rangeEnd < value.from ? value.from : rangeEnd;

  const selectDate = (selected: string) => {
    if (!canSelect(selected)) return;
    if (!value.from || value.to) {
      onChange({ from: selected, to: "" });
      setHovered("");
      return;
    }
    onChange(
      selected < value.from
        ? { from: selected, to: value.from }
        : { from: value.from, to: selected },
    );
    setHovered("");
    setOpen(false);
  };

  const trigger = (
    <button
      id={triggerId}
      type="button"
      className={`document-change-log-date-range-trigger${open ? " is-open" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={toggle}
    >
      <span>{dateRangeLabel(value)}</span>
      <UiIcon name="layout" size={14} />
    </button>
  );

  return (
    <div className="document-change-log-date-range-picker" ref={rootRef}>
      {label ? (
        <Field
          label={label}
          /* 时间段是筛选字段名，始终上浮压在边框线上，框内留给值/占位。 */
          hasValue
          state={open ? "active" : "idle"}
          controlId={triggerId}
        >
          <button
            id={triggerId}
            type="button"
            className="field-select"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={toggle}
          >
            <span className="field-select-value">{dateRangeLabel(value)}</span>
            <UiIcon name="layout" size={14} className="field-select-arrow" />
          </button>
        </Field>
      ) : (
        trigger
      )}
      {open && position ? (
        <FloatingPortal>
          <FloatingPanel
            ref={panelRef}
            onDismiss={() => setOpen(false)}
            className="document-change-log-date-range-popover is-floating"
            role="dialog"
            aria-label="选择日期范围"
            style={{ position: "fixed", top: position.top, left: position.left }}
          >
            <div className="document-change-log-date-range-toolbar">
              <button
                type="button"
                aria-label="上一年"
                disabled={
                  !canShowMonth(new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1))
                }
                onClick={() => shiftMonth(-12)}
              >
                «
              </button>
              <button
                type="button"
                aria-label="上个月"
                disabled={
                  !canShowMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
                }
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <strong>{`${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`}</strong>
              <button
                type="button"
                aria-label="下个月"
                disabled={
                  !canShowMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
                }
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
              <button
                type="button"
                aria-label="下一年"
                disabled={
                  !canShowMonth(new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1))
                }
                onClick={() => shiftMonth(12)}
              >
                »
              </button>
            </div>
            <div className="document-change-log-date-range-weekdays">
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="document-change-log-date-range-calendar">
              {days.map((day) => {
                const key = dateKey(day);
                const inMonth = day.getMonth() === viewMonth.getMonth();
                const inRange = Boolean(
                  rangeStart && normalizedEnd && key >= rangeStart && key <= normalizedEnd,
                );
                const selected = key === value.from || key === value.to;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!canSelect(key)}
                    className={`${inMonth ? "" : "is-outside"}${inRange ? " is-in-range" : ""}${selected ? " is-selected" : ""}`}
                    onMouseEnter={() =>
                      canSelect(key) && value.from && !value.to && setHovered(key)
                    }
                    onClick={() => selectDate(key)}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="document-change-log-date-range-footer">
              <span>{value.from && !value.to ? "请选择结束日期" : dateRangeLabel(value)}</span>
              {(value.from || value.to) && (
                <button
                  type="button"
                  onClick={() => {
                    onChange({ from: "", to: "" });
                    setHovered("");
                  }}
                >
                  清空
                </button>
              )}
            </div>
          </FloatingPanel>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
