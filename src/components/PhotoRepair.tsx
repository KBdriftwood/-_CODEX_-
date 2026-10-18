import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Brush, Check, Crosshair, RotateCcw, Undo2, X } from "lucide-react";
import { releasePhoto, type Photo } from "../lib/photo";
import { fitRect } from "../state/editor";
import {
  canvasBlob,
  CloneStroke,
  repairedPhoto,
  type Point,
} from "../lib/repair";

interface Props {
  photo: Photo;
  onApply: (photo: Photo) => void;
  onClose: () => void;
}
export function PhotoRepair({ photo, onApply, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 800, height: 600 });
  const fitted = fitRect(
    photo.width,
    photo.height,
    bounds.width - 36,
    bounds.height - 36,
  );
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
  const sourceRef = useRef<Point | null>(null);
  const [source, setSource] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [mode, setMode] = useState<"source" | "paint">("source");
  const [diameter, setDiameter] = useState(6);
  const [feather, setFeather] = useState(60);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [message, setMessage] = useState(
    "まず、写し込みたいきれいな背景を写真上でクリックしてください。",
  );
  const history = useRef<Promise<Blob>[]>([]);
  const stroke = useRef<{ tool: CloneStroke; pointer: number } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const canvas = canvasRef.current!;
    const scale = Math.min(1, 4096 / Math.max(photo.width, photo.height));
    canvas.width = Math.max(1, Math.round(photo.width * scale));
    canvas.height = Math.max(1, Math.round(photo.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(photo.image, 0, 0, canvas.width, canvas.height);
    return () => {
      document.body.style.overflow = previousOverflow;
      mounted.current = false;
      stroke.current = null;
      history.current = [];
    };
  }, [photo]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.x) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.y) / rect.height) * event.currentTarget.height,
    };
  };
  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (busy || stroke.current || event.button !== 0) return;
    event.preventDefault();
    const position = point(event);
    setCursor(position);
    if (mode === "source") {
      sourceRef.current = position;
      setSource(position);
      setMode("paint");
      setMessage(
        "修復元を選びました。消したい部分をなぞってください。背景が不自然なら修復元を選び直してください。",
      );
      return;
    }
    if (!sourceRef.current) return;
    const canvas = event.currentTarget;
    const saved = canvasBlob(canvas); // Promiseを保存し、PNG圧縮中も筆を動かせる。
    saved.catch(() => {});
    history.current = [...history.current, saved].slice(-5);
    setUndoCount(history.current.length);
    stroke.current = {
      tool: new CloneStroke(
        canvas,
        sourceRef.current,
        position,
        (canvas.width * diameter) / 100,
        feather,
      ),
      pointer: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const position = point(event);
    setCursor(position);
    if (!stroke.current || stroke.current.pointer !== event.pointerId) return;
    stroke.current.tool.move(position);
    setSource(stroke.current.tool.sourcePoint);
  };
  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (current.tool.clipped)
      setMessage(
        "修復元が写真の端を越えた部分は塗っていません。写真の内側で修復元を選び直してください。",
      );
    stroke.current = null;
    setSteps((value) => value + 1);
    setSource(sourceRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const undo = async () => {
    if (busy || stroke.current || !history.current.length) return;
    setBusy(true);
    try {
      const blob = await history.current.at(-1)!;
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (mounted.current) {
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
          history.current.pop();
          setUndoCount(history.current.length);
          setSteps((value) => Math.max(0, value - 1));
          setMessage("修復を1回取り消しました。");
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setMessage(
        "取り消しに失敗しました。「この画面の修復をやり直す」で元に戻せます。",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const reset = () => {
    if (busy || stroke.current) return;
    const canvas = canvasRef.current!;
    canvas
      .getContext("2d")!
      .drawImage(photo.image, 0, 0, canvas.width, canvas.height);
    history.current = [];
    setSteps(0);
    setUndoCount(0);
    setSource(null);
    sourceRef.current = null;
    setMode("source");
    setMessage("修復を始める前の背景に戻しました。修復元を選んでください。");
  };
  const apply = async () => {
    if (busy || stroke.current || !steps) return;
    setBusy(true);
    try {
      const result = await repairedPhoto(canvasRef.current!, photo);
      if (mounted.current) onApply(result);
      else releasePhoto(result);
    } catch (error) {
      if (mounted.current) {
        setMessage((error as Error).message);
        setBusy(false);
      }
    }
  };
  const marker = (position: Point) => ({
    left: `${(position.x / canvasRef.current!.width) * 100}%`,
    top: `${(position.y / canvasRef.current!.height) * 100}%`,
    width: `${diameter}%`,
    aspectRatio: "1",
  });
  return (
    <div
      className="repair-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="写真の簡易修復"
    >
      <header className="repair-header">
        <div>
          <h2>
            <Brush size={21} />
            写真の簡易修復
          </h2>
          <p>きれいな背景を写し込んで、不要な部分を隠します。</p>
        </div>
        <button className="button" disabled={busy} autoFocus onClick={onClose}>
          <X size={16} />
          反映せず閉じる
        </button>
      </header>
      <div className="repair-layout">
        <section className="repair-workspace">
          <div className="repair-instruction" role="status">
            {message}
          </div>
          <div className="repair-stage-area" ref={areaRef}>
            <div
              className="repair-stage"
              style={{ width: fitted.width, height: fitted.height }}
            >
              <canvas
                ref={canvasRef}
                aria-label="簡易修復の作業写真"
                onPointerDown={begin}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onLostPointerCapture={end}
                onPointerLeave={() => {
                  if (!stroke.current) setCursor(null);
                }}
              />
              {source && canvasRef.current && (
                <div className="repair-marker source" style={marker(source)}>
                  <span>修復元</span>
                </div>
              )}
              {cursor && mode === "paint" && canvasRef.current && (
                <div className="repair-marker brush" style={marker(cursor)} />
              )}
            </div>
          </div>
          <p className="repair-caption">
            設備の3D表示を隠して、背景写真だけを加工しています。
            {Math.max(photo.width, photo.height) > 4096
              ? "修復後の背景は、比率を保って長辺4096pxに縮小します。"
              : "写真の縦横比は保持します。"}
          </p>
        </section>
        <aside className="repair-controls">
          <section className="panel-section">
            <h3>1 修復元を選ぶ</h3>
            <p className="field-note">
              消す設備の近くにある、何もない壁や地面を選びます。使う場所を変えたいときは、もう一度このボタンを押してください。
            </p>
            <button
              className={`button full-button ${mode === "source" ? "active" : ""}`}
              aria-pressed={mode === "source"}
              disabled={busy}
              onClick={() => {
                setMode("source");
                setMessage("写し込みたいきれいな背景をクリックしてください。");
              }}
            >
              <Crosshair size={16} />
              修復元を選ぶ
            </button>
          </section>
          <section className="panel-section">
            <h3>2 不要な部分を塗る</h3>
            <p className="field-note">
              ドラッグした範囲に背景を写します。小さい範囲から試してください。
            </p>
            <button
              className={`button full-button ${mode === "paint" ? "active" : ""}`}
              aria-pressed={mode === "paint"}
              disabled={!source || busy}
              onClick={() => setMode("paint")}
            >
              <Brush size={16} />
              塗って修復
            </button>
            <label className="repair-adjustment">
              ブラシの大きさ（写真幅の%）
              <div>
                <input
                  aria-label="修復ブラシの大きさ"
                  type="range"
                  min=".5"
                  max="20"
                  step=".5"
                  value={diameter}
                  disabled={busy}
                  onChange={(event) => setDiameter(Number(event.target.value))}
                />
                <input
                  aria-label="修復ブラシの大きさの数値"
                  type="number"
                  min=".5"
                  max="20"
                  step=".5"
                  value={diameter}
                  disabled={busy}
                  onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber))
                      setDiameter(
                        Math.max(0.5, Math.min(20, event.target.valueAsNumber)),
                      );
                  }}
                />
              </div>
            </label>
            <label className="repair-adjustment">
              境界のぼかし <span>{feather}%</span>
              <input
                aria-label="修復ブラシの境界のぼかし"
                type="range"
                min="0"
                max="100"
                value={feather}
                disabled={busy}
                onChange={(event) => setFeather(Number(event.target.value))}
              />
            </label>
            <button
              className="button full-button"
              disabled={busy || !undoCount}
              onClick={() => void undo()}
            >
              <Undo2 size={16} />
              修復を1回取り消す
            </button>
            <p className="field-note">直近5回まで取り消せます。</p>
            <button
              className="text-button"
              disabled={busy || !steps}
              onClick={reset}
            >
              <RotateCcw size={13} />
              この画面の修復をやり直す
            </button>
          </section>
          <section className="panel-section">
            <p className="repair-limitation">
              AI消去ではありません。大きな設備や複雑な背景では、模様の繰り返しや継ぎ目が残ります。元写真は比較用に保持します。
            </p>
            <button
              className="button primary-button full-button"
              disabled={busy || !steps}
              onClick={() => void apply()}
            >
              <Check size={16} />
              {busy ? "処理中…" : "修復を背景に反映"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
