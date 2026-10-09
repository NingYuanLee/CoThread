import {
  HtmlBrowserToolbar,
  type HtmlBrowserFile,
  type HtmlDeviceMode,
} from "./HtmlBrowserToolbar";
import { UiIcon } from "./ui-icon";

export function HtmlBrowserEmptyState({
  files,
  addressQuery,
  onAddressQueryChange,
  onSelectFile,
  deviceMode,
  onDeviceModeChange,
  focusAddressKey,
  onAddressFocused,
}: {
  files: HtmlBrowserFile[];
  addressQuery: string;
  onAddressQueryChange: (value: string) => void;
  onSelectFile: (id: string) => void;
  deviceMode: HtmlDeviceMode;
  onDeviceModeChange: (mode: HtmlDeviceMode) => void;
  focusAddressKey?: string;
  onAddressFocused?: () => void;
}) {
  return (
    <div className="doc-html-preview-shell">
      <HtmlBrowserToolbar
        files={files}
        addressQuery={addressQuery}
        onAddressQueryChange={onAddressQueryChange}
        onSelectFile={onSelectFile}
        deviceMode={deviceMode}
        onDeviceModeChange={onDeviceModeChange}
        focusAddressKey={focusAddressKey}
        onAddressFocused={onAddressFocused}
      />
      <div className="doc-html-browser-empty">
        <UiIcon name="preview" size={22} />
        <strong>浏览器尚未打开页面</strong>
        <span>在上方地址栏输入关键词，选择项目中的 HTML 文件。</span>
      </div>
    </div>
  );
}
