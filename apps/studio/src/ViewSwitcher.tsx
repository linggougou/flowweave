export type StudioView = "flow" | "executions" | "versions";

type ViewSwitcherProps = {
  value: StudioView;
  onChange: (view: StudioView) => void;
};

const options: Array<{ value: StudioView; label: string }> = [
  { value: "flow", label: "任务步骤" },
  { value: "executions", label: "运行记录" },
  { value: "versions", label: "版本记录" },
];

export function ViewSwitcher({ value, onChange }: ViewSwitcherProps) {
  return (
    <div className="toolbar" aria-label="任务视图">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? "tab-btn active" : "tab-btn"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
