export type DocumentVersionHistoryOption = {
  id: string;
  value: string;
  title: string;
  label: string;
};

export function DocumentVersionHistorySelect({
  selected,
  title,
  options,
  onChange,
}: {
  selected: string;
  title: string;
  options: DocumentVersionHistoryOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="doc-browser-version-select"
      aria-label="文档历史版本"
      title={title}
      value={selected}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.value} title={option.title}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
