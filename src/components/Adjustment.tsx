import { useEffect, useState } from "react";
import type { EditorState } from "../state/editor";
import { limits } from "../state/editor";

interface Props {
  label: string;
  field: keyof EditorState;
  value: number;
  unit: string;
  ends?: [string, string];
  onChange: (key: keyof EditorState, value: number) => void;
}

export function Adjustment({
  label,
  field,
  value,
  unit,
  ends,
  onChange,
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const [min, max] = limits[field];
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft.trim() === "" || !Number.isFinite(Number(draft)))
      setDraft(String(value));
    else {
      const normalized =
        Math.round(Math.min(max, Math.max(min, Number(draft))) * 10) / 10;
      onChange(field, normalized);
      setDraft(String(normalized));
    }
  };
  return (
    <div className="adjustment">
      <div className="adjustment-heading">
        <label htmlFor={`${field}-number`}>{label}</label>
        <div className="number-wrap">
          <input
            id={`${field}-number`}
            type="number"
            min={min}
            max={max}
            step="0.1"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (
                event.target.value.trim() !== "" &&
                Number.isFinite(event.target.valueAsNumber)
              )
                onChange(field, event.target.valueAsNumber);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span>{unit}</span>
        </div>
      </div>
      <input
        className="range"
        type="range"
        aria-label={`${label}のスライダー`}
        min={min}
        max={max}
        step="0.1"
        value={value}
        style={
          {
            "--range-progress": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
        onChange={(event) => onChange(field, event.target.valueAsNumber)}
      />
      {ends && (
        <div className="range-ends">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}
