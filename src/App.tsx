import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Box,
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import { ControlPanel } from "./components/ControlPanel";
import {
  PhotoWorkspace,
  type WorkspaceHandle,
} from "./components/PhotoWorkspace";
import {
  loadPhoto,
  loadSamplePhoto,
  releasePhoto,
  type Photo,
} from "./lib/photo";
import {
  DEFAULT_STATE,
  updateValue,
  type EditorState,
  type Mode,
} from "./state/editor";

type Notice = { message: string; kind: "success" | "error" };

export default function App() {
  const [state, setState] = useState<EditorState>({ ...DEFAULT_STATE });
  const [mode, setMode] = useState<Mode>("move");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const requestId = useRef(0);

  useEffect(() => () => releasePhoto(photo), [photo]);
  useEffect(() => {
    const id = ++requestId.current;
    loadSamplePhoto()
      .then((value) => {
        if (id === requestId.current) setPhoto(value);
      })
      .catch(() => {
        if (id === requestId.current)
          setNotice({
            message:
              "サンプル背景を読み込めませんでした。現場写真を選んでください。",
            kind: "error",
          });
      });
    return () => {
      requestId.current++;
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const replacePhoto = async (file?: File) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const value = await (file ? loadPhoto(file) : loadSamplePhoto());
      if (id !== requestId.current) {
        releasePhoto(value);
        return;
      }
      setPhoto(value);
      setNotice({
        message: file
          ? "写真を読み込みました。設備の位置を調整してください。"
          : "サンプル背景に切り替えました。",
        kind: "success",
      });
    } catch (error) {
      if (id === requestId.current)
        setNotice({
          message:
            error instanceof Error
              ? error.message
              : "写真を読み込めませんでした。",
          kind: "error",
        });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };
  const onError = useCallback(
    (message: string) => setNotice({ message, kind: "error" }),
    [],
  );
  const onChange = (key: keyof EditorState, value: number) =>
    setState((previous) => updateValue(previous, key, value));
  const reset = () => {
    setState({ ...DEFAULT_STATE });
    setMode("move");
    setNotice({
      message: "設備とカメラを初期状態に戻しました。背景写真はそのままです。",
      kind: "success",
    });
  };
  const save = async () => {
    if (!workspaceRef.current || saving || !ready || loading) return;
    setSaving(true);
    try {
      await document.fonts.ready;
      const size = await workspaceRef.current.save();
      setNotice({
        message: `PNGを作成しました（${size.width.toLocaleString()} × ${size.height.toLocaleString()} px）。ブラウザのダウンロード先をご確認ください。`,
        kind: "success",
      });
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand" aria-label="LP VISION">
          <span className="brand-symbol">
            <Box size={24} strokeWidth={1.5} />
          </span>
          <span className="brand-name">
            LP <b>VISION</b>
            <span>設備配置シミュレーター</span>
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
        <span className="version-badge">初期版</span>
      </header>
      <main className="main">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              提案ツール
              <ChevronRight size={12} />
              <span>完成イメージ作成</span>
            </div>
            <h1>
              写真に、設備を配置する<span className="title-dot">.</span>
            </h1>
            <p>現場写真にバルクタンクを重ねて、導入後の姿をわかりやすく。</p>
          </div>
          <div className="main-actions">
            <button
              className="button reset-button"
              onClick={reset}
              disabled={saving}
            >
              <RotateCcw size={16} />
              <span>初期状態に戻す</span>
            </button>
            <button
              className="button primary-button"
              onClick={save}
              disabled={!photo || !ready || saving || loading}
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
        <div className="editor-layout">
          <PhotoWorkspace
            ref={workspaceRef}
            photo={photo}
            state={state}
            mode={mode}
            loading={loading}
            onState={setState}
            onUpload={() => inputRef.current?.click()}
            onSample={() => void replacePhoto()}
            onReady={setReady}
            onError={onError}
          />
          <ControlPanel
            state={state}
            mode={mode}
            setMode={setMode}
            onChange={onChange}
          />
        </div>
        <footer className="page-footer">
          <span>
            <span className="footer-dot" />
            ブラウザ内で完結・写真の外部送信なし
          </span>
          <span>
            LP VISION <span className="footer-slash">/</span> CONCEPT PREVIEW
          </span>
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
      {notice && (
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
