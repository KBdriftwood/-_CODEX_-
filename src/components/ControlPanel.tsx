import {
  CircleHelp,
  Move,
  Rotate3D,
  ScanEye,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import type { EditorState, Mode } from "../state/editor";
import { SHADOW_DIRECTIONS } from "../scene/GroundShadow";
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
  library?: ReactNode;
  selected?: boolean;
  shadowDirection?: number;
  onShadowDirection?: () => void;
}

export function ControlPanel({
  mode,
  state,
  setMode,
  onChange,
  library,
  selected = true,
  shadowDirection = 0,
  onShadowDirection,
}: Props) {
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
      {library}
      <section className="panel-section" aria-label="全設備の影">
        <button className="button" onClick={onShadowDirection}>
          影の向き：{SHADOW_DIRECTIONS[shadowDirection]}
        </button>
        <p>押すたびに4方向へ切り替わります。全設備に共通です。</p>
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
        <fieldset
          disabled={!selected && mode !== "camera"}
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
                配置した全設備を見るカメラを共通で調整します。遠近感を変えても、足元の位置を保ちます。
              </p>
            </>
          )}
        </fieldset>
      </section>

      <fieldset className="panel-section size-section" disabled={!selected}>
        <div className="section-heading">
          <h2>写真上の表示サイズ</h2>
          <span className="small-pill">表示倍率</span>
        </div>
        {adjustment("size", "表示倍率", "%", ["小さく", "大きく"])}
      </fieldset>
      <div className="panel-footnote">
        <CircleHelp size={16} />
        <p>
          写真だけから実際の寸法や距離は測れません。お客様への完成イメージとしてご利用ください。
        </p>
      </div>
    </aside>
  );
}
