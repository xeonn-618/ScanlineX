import React, { useState } from "react";

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  unit?: string;
  onChange: (val: number) => void;
}

export const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit = "",
  onChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(String(value));

  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleCommitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editVal);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
  };

  return (
    <div className="slider-container" style={{ margin: "3px 0" }}>
      <div className="slider-header">
        <span
          className="slider-label"
          onDoubleClick={() => onChange(defaultValue)}
          title="Double-click to reset"
        >
          {label}
        </span>
        {isEditing ? (
          <input
            type="text"
            className="tabular-nums"
            style={{
              width: "50px",
              height: "18px",
              background: "var(--bg-control)",
              border: "1px solid var(--border-active)",
              borderRadius: "2px",
              color: "var(--text-primary)",
              fontSize: "11px",
              textAlign: "right",
              padding: "0 3px",
            }}
            value={editVal}
            autoFocus
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={handleCommitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitEdit();
              if (e.key === "Escape") setIsEditing(false);
            }}
          />
        ) : (
          <span
            className="slider-val"
            onClick={() => {
              setEditVal(step < 1 ? value.toFixed(2) : String(value));
              setIsEditing(true);
            }}
            onDoubleClick={() => onChange(defaultValue)}
            title="Click to edit, double-click to reset"
          >
            {step < 1 ? value.toFixed(2) : value}
            {unit}
          </span>
        )}
      </div>

      <div
        className="uxp-slider-track"
        onDoubleClick={() => onChange(defaultValue)}
      >
        <div className="uxp-slider-fill" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="uxp-slider-input"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};
