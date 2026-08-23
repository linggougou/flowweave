export type WebView = "executions" | "versions";

type ViewSwitcherProps = {
  value: WebView;
  onChange: (view: WebView) => void;
};

const options: Array<{ value: WebView; label: string }> = [
  { value: "executions", label: "最近运行结果" },
  { value: "versions", label: "版本记录" },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div className="main-tabs" aria-label="任务视图">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? "main-tab active" : "main-tab"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
