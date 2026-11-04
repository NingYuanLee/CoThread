import { useRef, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { fullTime } from "./agent-monitor-model";

export type MemoryObservationItem = {
  id: string;
  question: string;
  status: string;
  reviewAfter: string;
  reviewAttempts: number;
  reviewNote?: string | null;
};

type ObservationsJob = {
  key?: string;
  label: string;
  observations?: MemoryObservationItem[];
};

const OBSERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "待复核",
  promoting: "正在形成议题",
  resolved: "已提升为核心议题",
  dismissed: "已关闭",
};

function observationStatusLabel(status: string) {
  return OBSERVATION_STATUS_LABELS[status] || status;
}

function MemoryObservationDetail({
  item,
  onClose,
}: {
  item: MemoryObservationItem;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="memory-observation-detail-title"
    >
      <DialogHeader
        title="待观察项详情"
        titleId="memory-observation-detail-title"
        subtitle={<>状态：{observationStatusLabel(item.status)}</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭待观察项详情"
      />
      <div className="l1-history-content">
        <div className="l1-history-body dialog-scroll-region">
          <dl className="memory-job-detail">
            <dt>问题</dt>
            <dd>{item.question || "—"}</dd>
            <dt>状态</dt>
            <dd>{observationStatusLabel(item.status)}</dd>
            <dt>下次复核</dt>
            <dd>{fullTime(item.reviewAfter)}</dd>
            <dt>复核次数</dt>
            <dd>{item.reviewAttempts}</dd>
            <dt>复核备注</dt>
            <dd>{item.reviewNote || "—"}</dd>
            <dt>说明</dt>
            <dd>
              待观察项不进入关键发言与核心议题：到期复核时，保留则延期，提升则先写核心议题再标记解决，不值得保留则关闭；关闭
              30 天后清理并写审计。
            </dd>
          </dl>
        </div>
      </div>
    </Dialog>
  );
}

export function MemoryObservations({ job }: { job: ObservationsJob }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MemoryObservationItem | null>(null);
  const items = job.observations || [];
  return (
    <>
      <button type="button" className="wiki-action" onClick={() => setOpen(true)}>
        待观察项 {items.length}
      </button>
      {open ? (
        <MemoryObservationsDialog
          label={job.label}
          items={items}
          onDetail={setDetail}
          onClose={() => {
            setOpen(false);
            setDetail(null);
          }}
        />
      ) : null}
      {detail ? <MemoryObservationDetail item={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

function MemoryObservationsDialog({
  label,
  items,
  onDetail,
  onClose,
}: {
  label: string;
  items: MemoryObservationItem[];
  onDetail: (item: MemoryObservationItem) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      className="l1-history-dialog dialog-list"
      aria-labelledby="memory-observations-title"
    >
      <DialogHeader
        title="待观察项"
        titleId="memory-observations-title"
        subtitle={
          <>
            {label} ·
            老翁暂存的问题候选；到期复核后才决定保留、提升或关闭，不计入关键发言与核心议题。
          </>
        }
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭待观察项"
      />
      <div className="l1-history-content">
        <div className="l1-history-body admin-table-wrap dialog-scroll-region">
          <table className="admin-table">
            <thead>
              <tr>
                <th>问题</th>
                <th>状态</th>
                <th>下次复核</th>
                <th>复核次数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="memory-observation-question">{item.question}</td>
                    <td>{observationStatusLabel(item.status)}</td>
                    <td>{fullTime(item.reviewAfter)}</td>
                    <td>{item.reviewAttempts}</td>
                    <td>
                      <button
                        type="button"
                        className="wiki-action"
                        aria-label={`查看待观察项详情：${item.question}`}
                        onClick={() => onDetail(item)}
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="monitor-empty" colSpan={5}>
                    当前没有待观察项。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
