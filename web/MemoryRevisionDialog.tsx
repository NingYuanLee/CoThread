import { useEffect, useRef, useState } from "react";
import { Dialog } from "./dialog-fx";
import { DialogHeader } from "./DialogHeader";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";
import { api } from "./workspace-api";

export function MemoryRevisionDialog({
  revisionId,
  onClose,
}: {
  revisionId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [revision, setRevision] = useState<{
    title: string;
    body: string;
    recordedAt: string;
    captureKind: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api(`/memory-revisions/${revisionId}`, undefined, undefined, controller.signal)
      .then(setRevision)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message || "无法读取历史依据");
      });
    return () => controller.abort();
  }, [revisionId]);
  return (
    <Dialog
      ref={dialog}
      onRequestClose={onClose}
      style={{ width: "min(860px,92vw)", maxHeight: "86vh" }}
    >
      <DialogHeader
        title={revision?.title || "当时引用的记忆"}
        subtitle={revision ? `记录于 ${revision.recordedAt}` : ""}
        onClose={onClose}
      />
      <div className="project-memory-detail-body">
        {error ? (
          <p role="alert">{error}</p>
        ) : revision ? (
          <MarkdownDocumentPreview
            mode="preview"
            text={revision.body}
            selected={null}
            nativeSourceFrame={null}
          />
        ) : (
          <p>正在读取历史依据…</p>
        )}
      </div>
    </Dialog>
  );
}
