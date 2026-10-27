import { useEffect, useState } from "react";
import { DialogBody } from "./DialogBody";
import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { TextAreaField } from "./TextAreaField";
import { api } from "./workspace-api";

export function MouthpieceDialog({
  projectId,
  scene,
  threadId,
  text,
  versionIds,
  onClose,
  onConfirm,
}: {
  projectId: string;
  scene: "group" | "elder";
  threadId?: string;
  text: string;
  versionIds: string[];
  onClose: () => void;
  onConfirm: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"polish" | "suggest" | "">("");
  const [basis, setBasis] = useState<"others" | "self" | "greet" | "">("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const versions = versionIds.join(",");

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    setError("");
    void api(
      `/projects/${projectId}/mouthpiece`,
      {
        scene,
        ...(scene === "group" && threadId ? { threadId } : {}),
        text,
        versionIds,
      },
      "POST",
      controller.signal,
    )
      .then((result) => {
        if (!alive) return;
        setDraft(typeof result?.text === "string" ? result.text : "");
        setMode(result?.mode === "suggest" ? "suggest" : "polish");
        setBasis(
          result?.basis === "self" || result?.basis === "greet"
            ? result.basis
            : result?.mode === "suggest"
              ? "others"
              : "",
        );
        setTruncated(!!result?.truncated);
      })
      .catch((reason) => {
        if (!alive || controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "AI嘴替没有完成");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
    // versionIds 在打开弹窗时已固定，用拼接后的 id 作为依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, projectId, scene, threadId, text, versions]);

  const subtitle = loading
    ? "小祥正在组织语言"
    : error
      ? "这次没有写出来"
      : mode === "suggest"
        ? basis === "greet"
          ? "先打一句招呼，可以直接改"
          : basis === "self"
            ? "按你刚说的话改写或续写，可以直接改"
            : "按别人刚说的话起草，可以直接改"
        : "按草稿和附件润色，可以直接改";

  return (
    <ModalBackdrop onClose={onClose}>
      {(close) => (
        <section
          className="mouthpiece-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mouthpiece-title"
          aria-busy={loading}
        >
          <DialogHeader
            title={<>AI嘴替</>}
            subtitle={subtitle}
            titleId="mouthpiece-title"
            onClose={close}
            closeLabel="关闭"
          />
          <DialogBody>
            <p className={`mouthpiece-status${error ? " is-error" : ""}`} role="status">
              {loading
                ? scene === "group"
                  ? "正在理解草稿、附件，或最近的群聊…"
                  : "正在理解草稿、附件，或最近的单聊…"
                : error ||
                  (truncated
                    ? "内容比较长，小祥只读了前面一部分。确认后只填入输入框，不会自动发送。"
                    : "确认后只填入输入框，不会自动发送。")}
            </p>
            <TextAreaField
              label="要填入的发言"
              value={draft}
              maxLength={20000}
              rows={8}
              disabled={loading}
              onChange={(event) => setDraft(event.target.value)}
            />
          </DialogBody>
          <DialogFooter
            left={
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                disabled={loading}
              >
                重新生成
              </button>
            }
          >
            <button type="button" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="primary"
              disabled={loading || !draft.trim()}
              onClick={() => onConfirm(draft.trim())}
            >
              填入对话框
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
