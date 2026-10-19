import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  Check,
  ImagePlus,
  Maximize2,
  MousePointer2,
  Move,
  Rotate3D,
  ScanEye,
  Upload,
} from "lucide-react";
import type { Photo } from "../lib/photo";
import { composeImage, exportPng } from "../export/exportPng";
import { EquipmentScene } from "../scene/EquipmentScene";
import {
  dragState,
  fitRect,
  updateValue,
  type EditorState,
  type Mode,
  type PlacedEquipment,
} from "../state/editor";
import { MODES } from "./ControlPanel";

interface Props {
  photo: Photo | null;
  state: EditorState;
  mode: Mode;
  shadowDirection?: number;
  loading: boolean;
  onState: (state: EditorState, id?: string) => void;
  onUpload: () => void;
  onSample: () => void;
  onReady: (ready: boolean) => void;
  onError: (message: string) => void;
  items?: PlacedEquipment[];
  onSelect?: (id: string) => void;
}

export interface WorkspaceHandle {
  save: () => Promise<{ width: number; height: number }>;
  snapshot: () => Promise<HTMLCanvasElement>;
}

export const PhotoWorkspace = forwardRef<WorkspaceHandle, Props>(
  function PhotoWorkspace(
    {
      photo,
      state,
      mode,
      shadowDirection = 0,
      loading,
      onState,
      onUpload,
      onSample,
      onReady,
      onError,
      items,
      onSelect,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const areaRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<EquipmentScene | null>(null);
    const latestState = useRef(state);
    latestState.current = state;
    const [bounds, setBounds] = useState({ width: 900, height: 600 });
    const [dragging, setDragging] = useState(false);
    const [sceneError, setSceneError] = useState(false);
    const failed = useRef(false);
    const drag = useRef<{
      x: number;
      y: number;
      state: EditorState;
      mode: Mode;
      width: number;
      height: number;
      pointer: number;
      itemId?: string;
    } | null>(null);
    const callbacks = useRef({ onReady, onError });
    callbacks.current = { onReady, onError };
    const aspect = photo ? photo.width / photo.height : 1.6;
    const fitted = fitRect(aspect, 1, bounds.width - 48, bounds.height - 48);

    useLayoutEffect(() => {
      const observer = new ResizeObserver(([entry]) =>
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        }),
      );
      if (areaRef.current) observer.observe(areaRef.current);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      let active = true;
      failed.current = false;
      let scene: EquipmentScene | undefined;
      const fail = () => {
        if (!active) return;
        failed.current = true;
        setSceneError(true);
        callbacks.current.onReady(false);
        callbacks.current.onError(
          "3D表示を開始できません。Edge・Chromeのグラフィックアクセラレーションを有効にして、画面を再読み込みしてください。",
        );
      };
      const canvas = canvasRef.current!;
      const lost = (event: Event) => {
        event.preventDefault();
        fail();
      };
      canvas.addEventListener("webglcontextlost", lost);
      try {
        scene = new EquipmentScene(canvas);
        sceneRef.current = scene;
        scene.resize(
          canvas.clientWidth,
          canvas.clientHeight,
          canvas.clientWidth / Math.max(1, canvas.clientHeight),
        );
        scene.update(latestState.current);
        scene
          .load()
          .then(() => {
            if (active && !failed.current) {
              scene!.update(latestState.current);
              callbacks.current.onReady(true);
            }
          })
          .catch(fail);
      } catch {
        fail();
      }
      return () => {
        active = false;
        callbacks.current.onReady(false);
        canvas.removeEventListener("webglcontextlost", lost);
        scene?.dispose();
        sceneRef.current = null;
      };
    }, []);

    useLayoutEffect(() => {
      sceneRef.current?.resize(fitted.width, fitted.height, aspect);
    }, [fitted.width, fitted.height, aspect]);
    useEffect(() => {
      sceneRef.current?.setShadowDirection(shadowDirection);
    }, [shadowDirection]);
    useEffect(() => {
      sceneRef.current?.update(state);
    }, [state]);
    useEffect(() => {
      if (!items || !sceneRef.current) return;
      let active = true;
      callbacks.current.onReady(false);
      sceneRef.current
        .setItems(items)
        .then(() => {
          if (active && !failed.current) callbacks.current.onReady(true);
        })
        .catch(() => {
          if (active) callbacks.current.onError("設備を表示できませんでした。");
        });
      return () => {
        active = false;
      };
    }, [items]);
    useImperativeHandle(
      ref,
      () => ({
        save: async () => {
          if (!photo || !sceneRef.current)
            throw new Error("写真と3Dモデルを読み込んでから保存してください。");
          // 入力直後でも、保存に使う状態を画面と一致させる。
          await sceneRef.current.settle();
          sceneRef.current.update(state);
          return exportPng(photo, sceneRef.current);
        },
        snapshot: async () => {
          if (!photo || !sceneRef.current)
            throw new Error("写真を読み込んでください。");
          await sceneRef.current.settle();
          sceneRef.current.update(state);
          return composeImage(photo, sceneRef.current, 2400);
        },
      }),
      [photo, state],
    );

    const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (
        !photo ||
        sceneError ||
        !sceneRef.current?.ready ||
        event.button !== 0 ||
        drag.current
      )
        return;
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      const picked =
        mode !== "camera"
          ? sceneRef.current.pick(
              (event.clientX - rect.x) / rect.width,
              (event.clientY - rect.y) / rect.height,
            )
          : null;
      const pickedItem = items?.find((item) => item.id === picked);
      if (picked) onSelect?.(picked);
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        state: {
          ...state,
          ...(pickedItem
            ? {
                x: pickedItem.state.x,
                y: pickedItem.state.y,
                size: pickedItem.state.size,
                yaw: pickedItem.state.yaw,
                pitch: pickedItem.state.pitch,
                roll: pickedItem.state.roll,
              }
            : {}),
        },
        mode,
        width: rect.width,
        height: rect.height,
        pointer: event.pointerId,
        itemId: picked ?? undefined,
      };
      setDragging(true);
    };
    const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      onState(
        dragState(
          current.state,
          current.mode,
          event.clientX - current.x,
          event.clientY - current.y,
          current.width,
          current.height,
          event.shiftKey,
        ),
        current.itemId,
      );
    };
    const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
      if (drag.current?.pointer !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!photo || sceneError || !sceneRef.current?.ready) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = directions[event.key];
      if (!delta) return;
      event.preventDefault();
      const amount = event.shiftKey ? 0.1 : 1;
      const [horizontal, vertical] =
        mode === "move"
          ? (["x", "y"] as const)
          : mode === "rotate"
            ? (["yaw", "pitch"] as const)
            : (["azimuth", "elevation"] as const);
      onState(
        updateValue(
          updateValue(state, horizontal, state[horizontal] + delta[0] * amount),
          vertical,
          state[vertical] + delta[1] * amount,
        ),
      );
    };
    const selectedMode = MODES.find((item) => item.id === mode)!;
    const ModeIcon = { move: Move, rotate: Rotate3D, camera: ScanEye }[mode];
    return (
      <section className="workspace" aria-label="完成イメージの編集">
        <div className="workspace-toolbar">
          <div className="workspace-title">
            <span className="live-dot" />
            <h2>プレビュー</h2>
            <span className="background-label">背景固定</span>
          </div>
          <div className="photo-actions">
            <button
              className="text-button sample-button"
              onClick={onSample}
              disabled={loading}
            >
              サンプル背景
            </button>
            <button
              className="button upload-button"
              onClick={onUpload}
              disabled={loading}
            >
              <ImagePlus size={16} />
              {loading ? "読み込み中…" : "写真を読み込む"}
            </button>
          </div>
        </div>
        <div className="mode-strip">
          <div>
            <ModeIcon size={16} />
            <strong>{selectedMode.name}モード</strong>
            <span>{selectedMode.instruction}</span>
          </div>
          <span className="fine-hint">
            <kbd>Shift</kbd> 微調整
          </span>
        </div>
        <div className="stage-viewport" ref={areaRef}>
          <div
            className={`photo-stage ${dragging ? "dragging" : ""} mode-${mode}`}
            style={{ width: fitted.width, height: fitted.height }}
            tabIndex={0}
            aria-label="写真と3D設備の作業領域。ドラッグまたは矢印キーで調整できます。"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
            onKeyDown={keyDown}
          >
            {photo && (
              <img
                className="background-photo"
                src={photo.url}
                alt={photo.sample ? photo.name : "読み込んだ現場写真"}
                draggable={false}
              />
            )}
            <canvas
              ref={canvasRef}
              className="equipment-canvas"
              aria-label="バルクタンクの3D表示"
            />
            {photo && (
              <>
                <div className="stage-top-badge">
                  <span />
                  {photo.sample ? "サンプル背景（イラスト）" : "現場写真"}
                </div>
                <div className="stage-model-badge">
                  <span />
                  仮モデル・仮寸法
                </div>
              </>
            )}
            {!photo && (
              <div className="stage-empty">
                <Upload size={30} />
                <strong>現場写真を読み込んで、はじめましょう</strong>
                <span>JPEG・PNG・WebP / 30MBまで</span>
              </div>
            )}
            {sceneError && (
              <div className="scene-error">
                <strong>3D表示を利用できません</strong>
                <span>ブラウザの設定を確認して再読み込みしてください。</span>
              </div>
            )}
          </div>
        </div>
        <div className="workspace-status">
          <span className="photo-file">
            <Maximize2 size={13} />
            {photo
              ? `${photo.width.toLocaleString()} × ${photo.height.toLocaleString()} px`
              : "写真未選択"}
            <span className="status-divider" />
            <span className="file-name" title={photo?.name}>
              {photo?.name ?? "写真を読み込んでください"}
            </span>
          </span>
          <span className="fit-label">
            <Check size={13} />
            比率を維持して表示
          </span>
        </div>
        <div className="workspace-help">
          <MousePointer2 size={14} />
          <span>
            写真上をドラッグして調整できます。右の数値入力でも細かく指定できます。
          </span>
        </div>
      </section>
    );
  },
);
