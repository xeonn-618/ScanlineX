import React from "react";
import { PRESETS } from "@webview/types/params";

interface AppHeaderProps {
  status: "ready" | "busy" | "error";
  statusText: string;
  preset: string;
  customPresets: Record<string, unknown>;
  onSelectPreset: (name: string) => void;
  onSaveCustomPreset: () => void;
  onResetParams: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  status,
  statusText,
  preset,
  customPresets,
  onSelectPreset,
  onSaveCustomPreset,
  onResetParams,
}) => {
  return (
    <header
      style={{
        height: "46px",
        padding: "0 12px",
        borderBottom: "1px solid var(--border-grid)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "var(--bg-canvas)",
        flexShrink: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--border-control)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "2px",
            backgroundColor: "var(--bg-control)",
          }}
        >
          <div style={{ width: "12px", height: "1.5px", background: "var(--text-primary)" }} />
          <div style={{ width: "14px", height: "1.5px", background: "var(--accent-glow)" }} />
          <div style={{ width: "10px", height: "1.5px", background: "var(--text-primary)" }} />
        </div>
        <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.02em" }}>
          ScanlineX
        </span>
        <div
          title={statusText}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "var(--radius-status)",
            backgroundColor:
              status === "ready"
                ? "var(--status-ready)"
                : status === "busy"
                ? "var(--status-busy)"
                : "var(--status-err)",
            transition: "background-color 150ms ease",
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <select
          className="uxp-select"
          value={preset}
          onChange={(e) => onSelectPreset(e.target.value)}
        >
          <optgroup label="Default Presets">
            {Object.keys(PRESETS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </optgroup>
          {Object.keys(customPresets).length > 0 && (
            <optgroup label="Custom Presets">
              {Object.keys(customPresets).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </optgroup>
          )}
        </select>
        <button className="uxp-btn uxp-btn-sm" onClick={onSaveCustomPreset} title="Save Current Preset">+</button>
        <button className="uxp-btn uxp-btn-sm" onClick={onResetParams} title="Reset to Defaults">↺</button>
      </div>
    </header>
  );
};
