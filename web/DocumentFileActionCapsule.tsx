import { SlideSwitch } from "./SlideSwitch";
import { UiIcon } from "./ui-icon";

export function DocumentFileActionCapsule({
  supportsPreview,
  supportsSource,
  isPreviewActive,
  isSourceActive,
  isPlainTextActive,
  onPreview,
  onSource,
  onPlainText,
}: {
  supportsPreview: boolean;
  supportsSource: boolean;
  isPreviewActive: boolean;
  isSourceActive: boolean;
  isPlainTextActive: boolean;
  onPreview: () => void;
  onSource: () => void;
  onPlainText: () => void;
}) {
  const items = [
    supportsPreview
      ? {
          value: "preview" as const,
          label: (
            <>
              <UiIcon name="preview" size={12} />
              预览
            </>
          ),
        }
      : null,
    supportsSource
      ? {
          value: "source" as const,
          label: (
            <>
              <UiIcon name="code" size={12} />
              源码
            </>
          ),
        }
      : null,
    supportsSource
      ? {
          value: "plain" as const,
          label: (
            <>
              <UiIcon name="list" size={12} />
              纯文本
            </>
          ),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const value = isPreviewActive
    ? "preview"
    : isSourceActive
      ? "source"
      : isPlainTextActive
        ? "plain"
        : items[0]?.value;
  if (!value || !items.length) return null;
  return (
    <SlideSwitch
      size="compact"
      label="文件操作"
      value={value}
      onChange={(next) => {
        if (next === "preview") onPreview();
        else if (next === "source") onSource();
        else onPlainText();
      }}
      items={items}
    />
  );
}
