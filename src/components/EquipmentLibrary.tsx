import { Box, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EQUIPMENT_CATALOG, getDefinition } from "../models/catalog";
import type { PlacedEquipment } from "../state/editor";

interface Props {
  items: PlacedEquipment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (modelId: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPatch: (id: string, value: Partial<PlacedEquipment>) => void;
}

function PipeLengthInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft.trim() === "" || !Number.isFinite(Number(draft))) {
      setDraft(String(value));
      return;
    }
    const normalized =
      Math.round(Math.max(0.2, Math.min(12, Number(draft))) * 10) / 10;
    onCommit(normalized);
    setDraft(String(normalized));
  };
  return (
    <input
      aria-label="配管の仮長さ"
      type="number"
      min="0.2"
      max="12"
      step="0.1"
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function EquipmentLibrary({
  items,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
  onPatch,
}: Props) {
  const [choice, setChoice] = useState("vertical-bulk");
  const selected = items.find((item) => item.id === selectedId);
  const definition = selected ? getDefinition(selected.modelId) : null;
  const pipe =
    definition?.kind === "gas-pipe" || definition?.kind === "hot-pipe";
  return (
    <section className="panel-section equipment-section">
      <div className="section-heading">
        <h2>
          <Box size={16} />
          設備を追加・選択
        </h2>
        <span className="count">{EQUIPMENT_CATALOG.length} 種類</span>
      </div>
      <div className="add-equipment">
        <select
          aria-label="追加する設備"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {EQUIPMENT_CATALOG.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          className="button"
          onClick={() => onAdd(choice)}
          aria-label="設備を追加"
        >
          <Plus size={16} />
          追加
        </button>
      </div>
      <div className="placed-list" role="group" aria-label="配置した設備">
        {items.map((item, index) => (
          <div
            className={`placed-row ${item.id === selectedId ? "selected" : ""}`}
            key={item.id}
          >
            <button
              className="placed-select"
              aria-pressed={item.id === selectedId}
              onClick={() => onSelect(item.id)}
              aria-label={`${getDefinition(item.modelId).name} ${index + 1}を選択`}
            >
              <span className="item-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{getDefinition(item.modelId).name}</span>
            </button>
            <button
              className="icon-button"
              aria-label={`${getDefinition(item.modelId).name}を${item.visible ? "非表示" : "表示"}`}
              onClick={() => onPatch(item.id, { visible: !item.visible })}
            >
              {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        ))}
        {!items.length && (
          <p className="field-note">一覧から設備を追加してください。</p>
        )}
      </div>
      <div className="selection-actions">
        <span>{items.length} 個を配置</span>
        <button
          className="text-button"
          onClick={onDuplicate}
          disabled={!selected}
          aria-label="選択設備を複製"
        >
          <Copy size={12} />
          複製
        </button>
        <button
          className="text-button"
          onClick={onDelete}
          disabled={!selected}
          aria-label="選択設備を削除"
        >
          <Trash2 size={12} />
          削除
        </button>
      </div>
      {selected && definition && (
        <>
          <div className="selected-equipment-name">
            調整中：<strong>{definition.name}</strong>
            <span className="model-tag">仮モデル</span>
          </div>
          {pipe && (
            <div className="pipe-options">
              <label>
                配管の仮長さ（m）
                <PipeLengthInput
                  key={selected.id}
                  value={selected.length}
                  onCommit={(length) => onPatch(selected.id, { length })}
                />
              </label>
              <label>
                形状
                <select
                  aria-label="配管の形状"
                  value={selected.pipeShape}
                  onChange={(event) =>
                    onPatch(selected.id, {
                      pipeShape: event.target
                        .value as PlacedEquipment["pipeShape"],
                    })
                  }
                >
                  <option value="straight">直線</option>
                  <option value="elbow">L字</option>
                  <option value="u">コの字</option>
                </select>
              </label>
              <p className="field-note pipe-length-note">
                長さはEnterキー、または入力欄を離れると反映します。
              </p>
            </div>
          )}
          <details className="model-details">
            <summary>仮寸法・モデルについて</summary>
            <p>
              幅・長さ 約{pipe ? selected.length : definition.dimensions.length}
              m ／ 奥行・直径 約{definition.dimensions.diameter}m ／ 高さ 約
              {pipe && selected.pipeShape !== "straight"
                ? Math.round(
                    (Math.max(0.3, selected.length * 0.55) + 0.055) * 100,
                  ) / 100
                : definition.dimensions.height}
              m。寸法・形状・色はすべて操作確認用です。配管の色も識別用の仮色です。
            </p>
            <p>
              表示倍率は写真上の大きさです。配管の仮長さはモデルの形状を変える設定です。
            </p>
          </details>
        </>
      )}
    </section>
  );
}
