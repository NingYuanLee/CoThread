import { useEffect, useRef, useState } from "react";
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
}: {
  value: DocumentChangeDateRange;
  onChange: (next: DocumentChangeDateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseDateKey(value.from) || parseDateKey(value.to) || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  return (
    <div className="document-change-log-date-range-picker" ref={rootRef}>
      <button
        type="button"
        className={`document-change-log-date-range-trigger${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{dateRangeLabel(value)}</span>
        <UiIcon name="layout" size={14} />
      </button>
      {open ? (
        <div
          className="document-change-log-date-range-popover"
          role="dialog"
          aria-label="选择日期范围"
        >
          <div className="document-change-log-date-range-toolbar">
            <button
              type="button"
              aria-label="上个月"
              onClick={() =>
                setViewMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              ‹
            </button>
            <strong>{`${viewMonth.getFullYear()}年${viewMonth.getMonth() + 1}月`}</strong>
            <button
              type="button"
              aria-label="下个月"
              onClick={() =>
                setViewMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              ›
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
                  className={`${inMonth ? "" : "is-outside"}${inRange ? " is-in-range" : ""}${selected ? " is-selected" : ""}`}
                  onMouseEnter={() => value.from && !value.to && setHovered(key)}
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
        </div>
      ) : null}
    </div>
  );
}
