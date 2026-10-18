import {
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Move,
  Rotate3D,
  ScanEye,
  SlidersHorizontal,
} from "lucide-react";
import { BULK_MODEL } from "../models/catalog";
import type { EditorState, Mode } from "../state/editor";
import { Adjustment } from "./Adjustment";

export const MODES = [
  {
    id: "move",
    name: "移動",
    icon: Move,
    instruction: "写真上をドラッグして、設備の設置位置を調整",
  },
  {
    id: "rotate",
    name: "設備の回転",
    icon: Rotate3D,
    instruction: "ドラッグして設備の向きを調整。背景写真は固定されます",
  },
  {
    id: "camera",
    name: "カメラ",
    icon: ScanEye,
    instruction: "ドラッグして設備を見る角度を調整。背景写真は固定されます",
  },
] as const;

interface Props {
  mode: Mode;
  state: EditorState;
  setMode: (mode: Mode) => void;
  onChange: (key: keyof EditorState, value: number) => void;
}

export function TankThumbnail() {
  return (
    <svg viewBox="0 0 150 105" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id="tank-shade"
          x1="65"
          y1="27"
          x2="65"
          y2="75"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fff" />
          <stop offset="0.5" stopColor="#dce5e8" />
          <stop offset="1" stopColor="#a4b4bb" />
        </linearGradient>
      </defs>
      <ellipse cx="77" cy="87" rx="57" ry="6" fill="#d7e2e5" />
      <path d="M46 67v17h12V67m39-2v17h12V65" fill="#a8b8bf" stroke="#849ba7" />
      <path d="m41 84 19-2 3 4-20 2zm51-2 19-2 3 4-20 2z" fill="#55717d" />
      <path
        d="M31 36 105 25c16-2 25 7 25 21s-8 22-21 24L36 80C9 84 7 41 31 36Z"
        fill="url(#tank-shade)"
        stroke="#91a7b1"
        strokeWidth="1.2"
      />
      <ellipse
        cx="31"
        cy="58"
        rx="17"
        ry="22"
        fill="url(#tank-shade)"
        stroke="#91a7b1"
      />
      <path d="m45 34 2 43m52-51 3 44" stroke="#9aadb6" strokeWidth="2" />
      <path d="m60 48 30-4v14l-30 4z" fill="#235266" />
      <path d="m66 51 18-3m-18 7 13-2" stroke="#d9ecec" strokeWidth="2" />
      <path
        d="M73 30v-9m-6 0 13-2"
        stroke="#7d775c"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ControlPanel({ mode, state, setMode, onChange }: Props) {
  const adjustment = (
    field: keyof EditorState,
    label: string,
    unit: string,
    ends?: [string, string],
  ) => (
    <Adjustment
      key={field}
      field={field}
      label={label}
      unit={unit}
      ends={ends}
      value={state[field]}
      onChange={onChange}
    />
  );
  return (
    <aside className="control-panel" aria-label="設備と操作の設定">
      <section className="panel-section equipment-section">
        <div className="section-heading">
          <h2>
            <Box size={16} /> 設備を選ぶ
          </h2>
          <span className="count">1 種類</span>
        </div>
        <button
          className="equipment-card"
          aria-pressed="true"
          aria-label="簡易バルクタンク（仮モデル）を選択"
        >
          <div className="equipment-image">
            <TankThumbnail />
            <span className="selected-check">
              <Check size={12} />
            </span>
          </div>
          <div className="equipment-copy">
            <span className="model-tag">仮モデル</span>
            <strong>{BULK_MODEL.name}</strong>
            <span>横置き / 操作確認用</span>
          </div>
        </button>
        <details className="model-details">
          <summary>
            仮寸法・モデルについて <ChevronDown size={14} />
          </summary>
          <dl>
            <div>
              <dt>全長</dt>
              <dd>4.0 m</dd>
            </div>
            <div>
              <dt>タンク直径</dt>
              <dd>1.4 m</dd>
            </div>
            <div>
              <dt>高さ（付属部品含む）</dt>
              <dd>約 2.2 m</dd>
            </div>
          </dl>
          <p>
            寸法・色・形状はすべて仮のものです。実在製品の仕様を示すものではありません。実寸は固定で、表示サイズとは別に管理しています。
          </p>
        </details>
      </section>

      <section className="panel-section adjustments-section">
        <div className="section-heading">
          <h2>
            <SlidersHorizontal size={16} /> 配置を調整
          </h2>
          <span className="section-kicker">ADJUST</span>
        </div>
        <div className="mode-tabs" role="group" aria-label="操作モード">
          {MODES.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={mode === id ? "active" : ""}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              <Icon size={17} />
              {name}
            </button>
          ))}
        </div>
        <div
          className="mode-fields"
          aria-label={`${MODES.find((item) => item.id === mode)!.name}の設定`}
        >
          {mode === "move" && (
            <>
              {adjustment("x", "横位置", "%", ["左", "右"])}
              {adjustment("y", "縦位置", "%", ["上", "下"])}
              <p className="field-note">
                位置は設備の足元を基準に、写真の左上からの割合で指定します。
              </p>
            </>
          )}
          {mode === "rotate" && (
            <>
              {adjustment("yaw", "左右の回転", "°")}
              {adjustment("pitch", "前後の傾き", "°")}
              {adjustment("roll", "左右の傾き", "°")}
              <p className="field-note">設備そのものの向きを変えます。</p>
            </>
          )}
          {mode === "camera" && (
            <>
              {adjustment("azimuth", "見る方向", "°")}
              {adjustment("elevation", "見下ろし角度", "°", [
                "低い位置",
                "高い位置",
              ])}
              {adjustment("fov", "遠近感（画角）", "°", [
                "弱い・望遠",
                "強い・広角",
              ])}
              <p className="field-note">
                設備を見るカメラだけを調整します。遠近感を変えても、足元の位置を保ちます。
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel-section size-section">
        <div className="section-heading">
          <h2>写真上の表示サイズ</h2>
          <span className="small-pill">実寸は固定</span>
        </div>
        {adjustment("size", "表示倍率", "%", ["小さく", "大きく"])}
      </section>
      <div className="panel-footnote">
        <CircleHelp size={16} />
        <p>
          写真だけから実際の寸法や距離は測れません。お客様への完成イメージとしてご利用ください。
        </p>
      </div>
    </aside>
  );
}
