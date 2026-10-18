import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  FilePlus2,
  Mail,
  Maximize2,
  Printer,
  X,
} from "lucide-react";
import {
  drawComparison,
  initialMetadata,
  printComparison,
  readPdf,
  saveProposal,
  type ComparisonSnapshot,
  type Orientation,
  type ProposalMetadata,
  type ProposalPart,
} from "../proposal/documents";

interface Props {
  snapshot: ComparisonSnapshot;
  onNotice: (message: string, error?: boolean) => void;
}

export function ProposalView({ snapshot, onNotice }: Props) {
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [metadata, setMetadata] = useState(initialMetadata);
  const [layout, setLayout] = useState<"compare" | "paper">("compare");
  const [parts, setParts] = useState<ProposalPart[]>([
    { id: "comparison", kind: "comparison" },
  ]);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<"before" | "after" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let active = true;
    document.fonts.ready.then(() => {
      if (active) setCanvas(drawComparison(snapshot, metadata, orientation));
    });
    return () => {
      active = false;
    };
  }, [snapshot, metadata, orientation]);
  useEffect(() => {
    if (!canvas || !canvasRef.current) return;
    const visible = canvasRef.current;
    visible.width = canvas.width;
    visible.height = canvas.height;
    visible.getContext("2d")!.drawImage(canvas, 0, 0);
  }, [canvas, layout]);
  useEffect(() => {
    if (!zoom) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoom]);
  const field = (
    key: keyof ProposalMetadata,
    label: string,
    maximum: number,
    type = "text",
  ) => (
    <label className="proposal-field">
      {label}
      <input
        aria-label={label}
        type={type}
        maxLength={maximum}
        value={metadata[key]}
        onChange={(event) =>
          setMetadata((previous) => ({
            ...previous,
            [key]: event.target.value,
          }))
        }
      />
    </label>
  );
  const addPdfs = async (files: File[]) => {
    if (!files.length) return;
    if (
      parts.filter((part) => part.kind === "pdf").length + files.length >
      20
    ) {
      onNotice("追加できるPDFは20ファイルまでです。", true);
      return;
    }
    const total =
      parts.reduce(
        (sum, part) => sum + (part.kind === "pdf" ? part.bytes.byteLength : 0),
        0,
      ) + [...files].reduce((sum, file) => sum + file.size, 0);
    if (total > 100 * 1024 * 1024) {
      onNotice("PDFの合計を100MB以下にしてください。", true);
      return;
    }
    setBusy(true);
    const additions: ProposalPart[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        additions.push({ kind: "pdf", ...(await readPdf(file)) });
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    setParts((previous) => [...previous, ...additions]);
    setBusy(false);
    if (errors.length) onNotice(errors.join(" ／ "), true);
    else
      onNotice(
        `${additions.length}個のPDFを追加しました。上下ボタンで提出順に並べ替えられます。`,
      );
  };
  const move = (index: number, delta: number) =>
    setParts((previous) => {
      const result = [...previous];
      [result[index], result[index + delta]] = [
        result[index + delta],
        result[index],
      ];
      return result;
    });
  const output = async (mail = false) => {
    setBusy(true);
    try {
      await document.fonts.ready;
      const current = drawComparison(snapshot, metadata, orientation);
      await saveProposal(current, orientation, metadata, parts);
      onNotice(
        mail
          ? "PDFを保存しました。普段のメールに、このPDFを添付して送ってください。"
          : "切替提案書PDFを保存しました。",
      );
    } catch (error) {
      onNotice((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const print = async () => {
    try {
      await printComparison(
        drawComparison(snapshot, metadata, orientation),
        orientation,
      );
    } catch (error) {
      onNotice((error as Error).message, true);
    }
  };
  const totalPages = parts.reduce(
    (sum, part) => sum + (part.kind === "comparison" ? 1 : part.pages),
    0,
  );
  return (
    <div className="proposal-layout">
      <section className="comparison-workspace">
        <div className="comparison-toolbar">
          <div className="view-switch">
            <button
              className={layout === "compare" ? "active" : ""}
              onClick={() => setLayout("compare")}
            >
              写真を大きく比較
            </button>
            <button
              className={layout === "paper" ? "active" : ""}
              onClick={() => setLayout("paper")}
            >
              印刷プレビュー
            </button>
          </div>
          <span>
            A4 {orientation === "portrait" ? "縦・上下配置" : "横・左右配置"}
          </span>
        </div>
        <div className="comparison-photos" hidden={layout !== "compare"}>
          {["before", "after"].map((value) => (
            <article className="comparison-photo" key={value}>
              <div>
                <h2>
                  {value === "before" ? "現状（元の写真）" : "切替後の完成予想"}
                </h2>
                <button
                  className="icon-button"
                  aria-label={`${value === "before" ? "元の写真" : "完成予想"}を拡大`}
                  onClick={() => setZoom(value as "before" | "after")}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
              <img
                alt={
                  value === "before"
                    ? "比較用の元の写真"
                    : "加工後の写真と配置した設備"
                }
                src={
                  value === "before"
                    ? snapshot.original.url
                    : snapshot.after.src
                }
              />
            </article>
          ))}
        </div>
        <div
          className={`paper-preview ${orientation}`}
          hidden={layout !== "paper"}
        >
          <canvas
            ref={canvasRef}
            aria-label={`A4${orientation === "portrait" ? "縦" : "横"}の印刷プレビュー`}
          />
        </div>
        <p className="comparison-caption">
          元写真を保持しています。完成予想には仮モデル・仮寸法を使用しています。
        </p>
      </section>
      <aside className="proposal-controls">
        <section className="panel-section">
          <div className="section-heading">
            <h2>写真比較ページ</h2>
            <span className="small-pill">A4 1ページ</span>
          </div>
          <div
            className="orientation-options"
            role="group"
            aria-label="用紙の向き"
          >
            <button
              aria-pressed={orientation === "portrait"}
              className={orientation === "portrait" ? "active" : ""}
              onClick={() => setOrientation("portrait")}
            >
              A4縦・上下に比較
            </button>
            <button
              aria-pressed={orientation === "landscape"}
              className={orientation === "landscape" ? "active" : ""}
              onClick={() => setOrientation("landscape")}
            >
              A4横・左右に比較
            </button>
          </div>
          {field("title", "提案書の題名", 40)}
          {field("customer", "お客様名", 40)}
          {field("site", "現場名", 60)}
          {field("date", "提案日", 10, "date")}
          {field("sender", "会社名・担当者", 60)}
          <label className="proposal-field">
            説明文
            <textarea
              aria-label="説明文"
              maxLength={240}
              rows={3}
              value={metadata.note}
              onChange={(event) =>
                setMetadata((previous) => ({
                  ...previous,
                  note: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="button full-button"
            onClick={() => void print()}
            disabled={busy || !canvas}
          >
            <Printer size={15} />
            比較ページを印刷
          </button>
        </section>
        <section className="panel-section">
          <div className="section-heading">
            <h2>提出するPDFの順番</h2>
            <span>{totalPages}ページ</span>
          </div>
          <p className="field-note">
            Word・Excel・図面を先にPDFで保存し、ここに追加します。縦・横が混ざっていても結合できます。
          </p>
          <button
            className="button full-button"
            disabled={busy}
            onClick={() => pdfInput.current?.click()}
          >
            <FilePlus2 size={15} />
            ほかのPDFを追加
          </button>
          <input
            className="visually-hidden"
            aria-label="追加するPDFファイル"
            ref={pdfInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
              void addPdfs(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <ol className="pdf-order">
            {parts.map((part, index) => (
              <li key={part.id}>
                <span>
                  <strong>
                    {part.kind === "comparison"
                      ? "現状・完成予想の比較"
                      : part.name}
                  </strong>
                  <small>
                    {part.kind === "comparison"
                      ? "A4・1ページ"
                      : `${part.pages}ページ`}
                  </small>
                </span>
                <button
                  className="icon-button"
                  aria-label={`${index + 1}番目のPDFを上へ`}
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || busy}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${index + 1}番目のPDFを下へ`}
                  onClick={() => move(index, 1)}
                  disabled={index === parts.length - 1 || busy}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${index + 1}番目のPDFを削除`}
                  disabled={busy}
                  onClick={() =>
                    setParts((previous) =>
                      previous.filter((value) => value.id !== part.id),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
          {!parts.some((part) => part.kind === "comparison") && (
            <button
              className="text-button"
              onClick={() =>
                setParts((previous) => [
                  { kind: "comparison", id: "comparison" },
                  ...previous,
                ])
              }
            >
              比較ページを追加する
            </button>
          )}
          <button
            className="button primary-button full-button"
            disabled={busy || !parts.length || !canvas}
            onClick={() => void output()}
          >
            <Download size={16} />
            {busy ? "処理中…" : "切替提案書PDFを保存"}
          </button>
          <button
            className="button full-button"
            disabled={busy || !parts.length || !canvas}
            onClick={() => void output(true)}
          >
            <Mail size={15} />
            メール添付用PDFを保存
          </button>
          <p className="field-note">
            保存したPDFを普段のOutlookなどに添付してください。
          </p>
          <a
            className="text-button mail-link"
            href={`mailto:?subject=${encodeURIComponent(metadata.title)}&body=${encodeURIComponent(`${metadata.customer ? metadata.customer + " 様\n\n" : ""}LPガス設備の切替提案書をお送りいたします。\nご確認のほど、よろしくお願いいたします。\n\n※送信前に、保存したPDFを添付してください。`)}`}
          >
            メール作成画面を開く
          </a>
        </section>
      </aside>
      {zoom && (
        <div
          className="photo-modal"
          role="dialog"
          aria-modal="true"
          aria-label="比較写真の拡大"
        >
          <button className="button" autoFocus onClick={() => setZoom(null)}>
            <X size={18} />
            閉じる
          </button>
          <img
            alt={zoom === "before" ? "元の写真の拡大" : "完成予想の拡大"}
            src={zoom === "before" ? snapshot.original.url : snapshot.after.src}
          />
        </div>
      )}
    </div>
  );
}
