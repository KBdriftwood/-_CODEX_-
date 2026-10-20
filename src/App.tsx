import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Box,
  Check,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import { ControlPanel } from "./components/ControlPanel";
import { EquipmentLibrary } from "./components/EquipmentLibrary";
import {
  PhotoWorkspace,
  type WorkspaceHandle,
} from "./components/PhotoWorkspace";
import { ProposalView } from "./components/ProposalView";
import { PhotoRepair } from "./components/PhotoRepair";
import {
  loadPhoto,
  loadSamplePhoto,
  releasePhoto,
  type Photo,
} from "./lib/photo";
import {
  DEFAULT_STATE,
  newEquipment,
  updateValue,
  type EditorState,
  type Mode,
  type PlacedEquipment,
} from "./state/editor";
import type { ComparisonSnapshot } from "./proposal/documents";

type Notice = { message: string; kind: "success" | "error" };

export default function App() {
  const [items, setItems] = useState<PlacedEquipment[]>(() => [newEquipment()]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => items[0].id,
  );
  const selected = items.find((item) => item.id === selectedId);
  const state: EditorState = selected?.state ?? { ...DEFAULT_STATE };
  const [shadowDirection, setShadowDirection] = useState(0);
  const [mode, setMode] = useState<Mode>("move");
  const [original, setOriginal] = useState<Photo | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [history, setHistory] = useState<Photo[]>([]);
  const [view, setView] = useState<"editor" | "proposal">("editor");
  const [repairOpen, setRepairOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processedInput = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const requestId = useRef(0);
  const retained = useRef(new Map<string, Photo>());
  const notify = useCallback(
    (message: string, error = false) =>
      setNotice({ message, kind: error ? "error" : "success" }),
    [],
  );
  const onError = useCallback(
    (message: string) => notify(message, true),
    [notify],
  );

  // 元写真・背景・取り消し履歴・比較表示のどこからも使われなくなった画像だけを解放する。
  useEffect(() => {
    const next = new Map<string, Photo>();
    for (const value of [original, photo, snapshot?.original, ...history])
      if (value) next.set(value.url, value);
    for (const [url, value] of retained.current)
      if (!next.has(url)) releasePhoto(value);
    retained.current = next;
  }, [original, photo, history, snapshot]);
  useEffect(
    () => () => {
      for (const value of retained.current.values()) releasePhoto(value);
      retained.current.clear();
    },
    [],
  );
  useEffect(() => {
    const id = ++requestId.current;
    loadSamplePhoto()
      .then((value) => {
        if (id === requestId.current) {
          setPhoto(value);
          setOriginal(value);
        } else releasePhoto(value);
      })
      .catch(() => {
        if (id === requestId.current)
          onError(
            "サンプル背景を読み込めませんでした。現場写真を選んでください。",
          );
      });
    return () => {
      requestId.current++;
    };
  }, [onError]);
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const replacePhoto = async (file?: File, processed = false) => {
    if (processed && (!original || original.sample)) {
      onError("先に元の現場写真を読み込んでください。");
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const value = await (file ? loadPhoto(file) : loadSamplePhoto());
      if (id !== requestId.current) {
        releasePhoto(value);
        return;
      }
      if (processed && original) {
        const ratio =
          value.width / value.height / (original.width / original.height);
        if (Math.abs(ratio - 1) > 0.002) {
          releasePhoto(value);
          throw new Error(
            "加工済み写真は元写真と同じ縦横比にしてください。切り抜きや余白の追加をせずに保存してください。",
          );
        }
        setHistory((previous) => [...previous, photo!].slice(-5));
        setPhoto(value);
        notify(
          "加工済み写真を背景にしました。比較画面の元写真は保持しています。",
        );
      } else {
        setPhoto(value);
        setOriginal(value);
        setHistory([]);
        notify(
          file
            ? "写真を読み込みました。設備の位置を調整してください。"
            : "サンプル背景に切り替えました。",
        );
      }
    } catch (error) {
      if (id === requestId.current)
        onError(
          error instanceof Error
            ? error.message
            : "写真を読み込めませんでした。",
        );
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  const patch = (id: string, value: Partial<PlacedEquipment>) =>
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );
  const onChange = (key: keyof EditorState, value: number) => {
    if (selected)
      patch(selected.id, { state: updateValue(selected.state, key, value) });
  };
  const onState = (next: EditorState, id = selectedId ?? undefined) => {
    if (id) patch(id, { state: next });
  };
  const add = (modelId: string) => {
    if (items.length >= 50) {
      onError("配置できる設備は50個までです。");
      return;
    }
    const value = newEquipment(modelId, items.length);
    setItems((previous) => [...previous, value]);
    setSelectedId(value.id);
  };
  const duplicate = () => {
    if (!selected) return;
    if (items.length >= 50) {
      onError("配置できる設備は50個までです。");
      return;
    }
    const value = {
      ...selected,
      id: crypto.randomUUID(),
      state: updateValue(
        updateValue(selected.state, "x", selected.state.x + 3),
        "y",
        selected.state.y + 3,
      ),
    };
    setItems((previous) => [...previous, value]);
    setSelectedId(value.id);
  };
  const remove = () => {
    const remaining = items.filter((item) => item.id !== selectedId);
    setItems(remaining);
    setSelectedId(remaining.at(-1)?.id ?? null);
  };
  const reset = () => {
    setItems((previous) =>
      previous.map((item, index) => ({
        ...item,
        state: newEquipment(item.modelId, index).state,
        autoBrightness: true,
      })),
    );
    setMode("move");
    notify("設備とカメラを初期状態に戻しました。背景写真はそのままです。");
  };
  const save = async () => {
    if (!workspaceRef.current || saving || !ready || loading) return;
    setSaving(true);
    try {
      await document.fonts.ready;
      const size = await workspaceRef.current.save();
      notify(
        `PNGを作成しました（${size.width.toLocaleString()} × ${size.height.toLocaleString()} px）。ブラウザのダウンロード先をご確認ください。`,
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "保存に失敗しました。画像を小さくしてお試しください。",
      );
    } finally {
      setSaving(false);
    }
  };
  const openProposal = async () => {
    if (
      view === "proposal" ||
      !workspaceRef.current ||
      !original ||
      saving ||
      !ready ||
      loading
    )
      return;
    setSaving(true);
    try {
      await document.fonts.ready;
      const canvas = await workspaceRef.current.snapshot();
      const image = new Image();
      image.src = canvas.toDataURL("image/png");
      await image.decode();
      setSnapshot({ original, after: image });
      setView("proposal");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "比較画像を作成できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header" inert={repairOpen}>
        <div className="brand" aria-label="LP VISION">
          <span className="brand-symbol">
            <Box size={24} strokeWidth={1.5} />
          </span>
          <span className="brand-name">
            LP <b>VISION</b>
            <span>設備配置・切替提案ツール</span>
          </span>
        </div>
        <div className="header-divider" />
        <span className="header-description">
          現場写真から、切り替え後のイメージを。
        </span>
        <span className="local-status">
          <LockKeyhole size={13} />
          写真は端末内で処理
        </span>
        <span className="version-badge">仮モデル版</span>
      </header>
      <main className="main" inert={repairOpen}>
        <div className="page-heading">
          <div>
            <div className="breadcrumb">提案ツール / 完成イメージ作成</div>
            <h1>
              {view === "editor"
                ? "写真に、設備を配置する"
                : "切替前と後を、並べて伝える"}
              <span className="title-dot">.</span>
            </h1>
            <p>
              {view === "editor"
                ? "設備を選んで配置。元写真を残して、完成予想と比較できます。"
                : "A4縦・横を選び、ほかの書類と一緒にPDFで提出できます。"}
            </p>
          </div>
          <div className="main-actions">
            <button
              className="button reset-button"
              onClick={reset}
              disabled={saving || view !== "editor"}
            >
              <RotateCcw size={16} />
              <span>初期状態に戻す</span>
            </button>
            <button
              className="button primary-button"
              onClick={save}
              disabled={
                !photo || !ready || saving || loading || view !== "editor"
              }
            >
              {saving ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowDownToLine size={17} />
              )}
              {saving ? "画像を作成中…" : "PNG保存"}
            </button>
          </div>
        </div>
        <nav className="page-tabs" aria-label="作業画面">
          <button
            className={view === "editor" ? "active" : ""}
            aria-current={view === "editor" ? "page" : undefined}
            onClick={() => setView("editor")}
          >
            1 設備を配置
          </button>
          <button
            className={view === "proposal" ? "active" : ""}
            aria-current={view === "proposal" ? "page" : undefined}
            onClick={() => void openProposal()}
            disabled={saving || !ready || loading}
          >
            2 比較・提案書
          </button>
          <span>
            作業内容は画面を閉じると消えます。画像・PDFを保存してください。
          </span>
        </nav>
        <div hidden={view !== "editor"}>
          <div className="photo-workflow">
            <div>
              <strong>写真の下準備</strong>
              <span>
                簡易修復で既存設備を隠すか、別アプリで加工した写真を背景にできます。
              </span>
            </div>
            <div className="photo-workflow-actions">
              <button
                className="button"
                disabled={!photo || loading || saving}
                onClick={() => setRepairOpen(true)}
              >
                写真を簡易修復
              </button>
              <button
                className="button"
                disabled={loading || !original || original.sample}
                onClick={() => processedInput.current?.click()}
              >
                加工済み写真を読み込む
              </button>
              <button
                className="text-button"
                disabled={loading || !history.length}
                onClick={() => {
                  setPhoto(history.at(-1)!);
                  setHistory((previous) => previous.slice(0, -1));
                }}
              >
                背景を1つ戻す
              </button>
              <button
                className="text-button"
                disabled={loading || photo === original}
                onClick={() => {
                  setPhoto(original);
                  setHistory([]);
                }}
              >
                元の背景に戻す
              </button>
            </div>
            <p>
              簡易修復は近くの背景を写す方式です。大きな設備・複雑な背景は不自然になる場合があります。
            </p>
          </div>
          <div className="editor-layout">
            <PhotoWorkspace
              ref={workspaceRef}
              photo={photo}
              state={state}
              mode={mode}
              shadowDirection={shadowDirection}
              loading={loading}
              onState={onState}
              items={items}
              onSelect={setSelectedId}
              onUpload={() => inputRef.current?.click()}
              onSample={() => void replacePhoto()}
              onReady={setReady}
              onError={onError}
            />
            <ControlPanel
              state={state}
              mode={mode}
              setMode={setMode}
              shadowDirection={shadowDirection}
              onShadowDirection={() => setShadowDirection((value) => (value + 1) % 4)}
              onChange={onChange}
              selected={!!selected}
              autoBrightness={selected?.autoBrightness !== false}
              onAutoBrightness={(enabled) => selected && patch(selected.id, { autoBrightness: enabled })}
              onResetBrightness={() => selected && patch(selected.id, {
                autoBrightness: false,
                state: { ...selected.state, brightness: 100 },
              })}
              library={
                <EquipmentLibrary
                  items={items}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onAdd={add}
                  onDelete={remove}
                  onDuplicate={duplicate}
                  onPatch={patch}
                />
              }
            />
          </div>
        </div>
        {snapshot && (
          <div hidden={view !== "proposal"}>
            <ProposalView snapshot={snapshot} onNotice={notify} />
          </div>
        )}
        <footer className="page-footer">
          <span>
            <span className="footer-dot" />
            ブラウザ内で完結・写真の外部送信なし
          </span>
          <span>LP VISION / CONCEPT PREVIEW</span>
        </footer>
      </main>
      <input
        ref={inputRef}
        className="visually-hidden"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="現場写真ファイル"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void replacePhoto(file);
          event.target.value = "";
        }}
      />
      <input
        ref={processedInput}
        className="visually-hidden"
        tabIndex={-1}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="加工済み写真ファイル"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void replacePhoto(file, true);
          event.target.value = "";
        }}
      />
      {repairOpen && photo && (
        <PhotoRepair
          photo={photo}
          onClose={() => setRepairOpen(false)}
          onApply={(value) => {
            setHistory((previous) => [...previous, photo].slice(-5));
            setPhoto(value);
            setRepairOpen(false);
            notify(
              "修復した写真を背景に反映しました。元写真は比較用に保持しています。",
            );
          }}
        />
      )}
      {notice && !repairOpen && (
        <div
          className={`notice ${notice.kind}`}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.kind === "error" ? (
            <CircleAlert size={19} />
          ) : (
            <Check size={19} />
          )}
          <span>{notice.message}</span>
          <button aria-label="通知を閉じる" onClick={() => setNotice(null)}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
