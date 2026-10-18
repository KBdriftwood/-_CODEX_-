import { PDFDocument } from "pdf-lib";
import type { Photo } from "../lib/photo";
import { fitRect } from "../state/editor";
import { downloadBlob } from "../export/exportPng";

export type Orientation = "portrait" | "landscape";
export interface ProposalMetadata {
  title: string;
  customer: string;
  site: string;
  date: string;
  sender: string;
  note: string;
}
export interface ComparisonSnapshot {
  original: Photo;
  after: HTMLImageElement;
}
export interface PdfAttachment {
  id: string;
  name: string;
  bytes: Uint8Array;
  pages: number;
}
export type ProposalPart =
  { id: string; kind: "comparison" } | ({ kind: "pdf" } & PdfAttachment);

export function todayInJapan() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((name) => parts.find((part) => part.type === name)!.value)
    .join("-");
}

export const initialMetadata = (): ProposalMetadata => ({
  title: "LPガス設備 切替ご提案",
  customer: "",
  site: "",
  date: todayInJapan(),
  sender: "",
  note: "",
});

function lines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maximum: number,
) {
  let line = "",
    row = 0;
  for (const char of text) {
    if (char === "\n" || ctx.measureText(line + char).width > width) {
      ctx.fillText(line, x, y + row++ * lineHeight);
      line = "";
      if (row >= maximum) return;
      if (char === "\n") continue;
    }
    line += char;
  }
  if (line) ctx.fillText(line, x, y + row * lineHeight);
}

export function drawComparison(
  snapshot: ComparisonSnapshot,
  metadata: ProposalMetadata,
  orientation: Orientation,
) {
  const canvas = document.createElement("canvas");
  canvas.width = orientation === "portrait" ? 2480 : 3508;
  canvas.height = orientation === "portrait" ? 3508 : 2480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("提案書を描画できません。");
  const { width: w, height: h } = canvas;
  const margin = 120,
    bodyTop = 355,
    footer = h - 270;
  const font = '"Yu Gothic", "Meiryo", sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#184c5e";
  ctx.fillRect(margin, 90, 12, 70);
  ctx.font = `700 58px ${font}`;
  ctx.textBaseline = "top";
  ctx.fillText(
    metadata.title || "LPガス設備 切替ご提案",
    margin + 35,
    91,
    w - margin * 2 - 50,
  );
  ctx.font = `36px ${font}`;
  ctx.fillStyle = "#273e49";
  ctx.fillText(
    metadata.customer ? `${metadata.customer} 様` : "お客様名：未入力",
    margin,
    200,
    w - margin * 2,
  );
  ctx.font = `30px ${font}`;
  ctx.fillStyle = "#6a7b83";
  ctx.fillText(
    metadata.site ? `現場：${metadata.site}` : "現場名：未入力",
    margin,
    265,
    w - margin * 2 - 300,
  );
  ctx.textAlign = "right";
  ctx.fillText(metadata.date.replaceAll("-", "/"), w - margin, 265);
  ctx.textAlign = "left";
  ctx.strokeStyle = "#dce5e9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(margin, 320);
  ctx.lineTo(w - margin, 320);
  ctx.stroke();
  const available = footer - bodyTop - 70;
  const gap = 80;
  const frameW =
    orientation === "portrait" ? w - margin * 2 : (w - margin * 2 - gap) / 2;
  const frameH = orientation === "portrait" ? (available - gap) / 2 : available;
  for (let i = 0; i < 2; i++) {
    const x = margin + (orientation === "landscape" ? i * (frameW + gap) : 0);
    const y = bodyTop + (orientation === "portrait" ? i * (frameH + gap) : 0);
    ctx.fillStyle = "#f4f7f8";
    ctx.fillRect(x, y, frameW, frameH);
    ctx.fillStyle = i === 0 ? "#6a7c87" : "#155768";
    ctx.fillRect(x, y, frameW, 62);
    ctx.font = `700 32px ${font}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(
      i === 0 ? "現状（元の写真）" : "切替後の完成予想",
      x + 25,
      y + 14,
    );
    const image = i === 0 ? snapshot.original.image : snapshot.after;
    const fitted = fitRect(
      image.naturalWidth,
      image.naturalHeight,
      frameW - 24,
      frameH - 86,
    );
    ctx.drawImage(
      image,
      x + (frameW - fitted.width) / 2,
      y + 74 + (frameH - 86 - fitted.height) / 2,
      fitted.width,
      fitted.height,
    );
  }
  ctx.font = `30px ${font}`;
  ctx.fillStyle = "#435a66";
  lines(ctx, metadata.note, margin, footer, w - margin * 2, 42, 4);
  ctx.font = `25px ${font}`;
  ctx.fillStyle = "#8a7860";
  ctx.fillText(
    "仮モデル・仮寸法による完成予想です。実測値・施工図を示すものではありません。",
    margin,
    h - 83,
    w - margin * 2,
  );
  ctx.fillStyle = "#78909b";
  ctx.textAlign = "right";
  ctx.fillText(
    metadata.sender || "LP VISION",
    w - margin,
    h - 43,
    w - margin * 2,
  );
  return canvas;
}

export async function readPdf(file: File): Promise<PdfAttachment> {
  if (file.size > 30 * 1024 * 1024)
    throw new Error(`${file.name}：PDFは1ファイル30MB以下にしてください。`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const pdf = await PDFDocument.load(bytes);
    if (!pdf.getPageCount()) throw new Error("ページがありません。");
    return {
      id: crypto.randomUUID(),
      name: file.name,
      bytes,
      pages: pdf.getPageCount(),
    };
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message))
      throw new Error(
        `${file.name}：パスワード保護を解除したPDFを選んでください。`,
      );
    throw new Error(
      `${file.name}：PDFを読み込めません。PDF形式で保存し直してください。`,
    );
  }
}

export async function createProposalPdf(
  canvas: HTMLCanvasElement,
  orientation: Orientation,
  metadata: ProposalMetadata,
  parts: ProposalPart[],
) {
  if (!parts.length)
    throw new Error("保存するページを1つ以上追加してください。");
  const output = await PDFDocument.create();
  output.setTitle(metadata.title || "LPガス設備 切替ご提案");
  output.setAuthor(metadata.sender || "LP VISION");
  for (const part of parts) {
    if (part.kind === "comparison") {
      const image = await output.embedJpg(canvas.toDataURL("image/jpeg", 0.94));
      const size: [number, number] =
        orientation === "portrait" ? [595.28, 841.89] : [841.89, 595.28];
      const page = output.addPage(size);
      page.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
    } else {
      const source = await PDFDocument.load(part.bytes);
      for (const page of await output.copyPages(
        source,
        source.getPageIndices(),
      ))
        output.addPage(page);
    }
  }
  return new Blob([(await output.save()) as Uint8Array<ArrayBuffer>], {
    type: "application/pdf",
  });
}

export async function saveProposal(
  canvas: HTMLCanvasElement,
  orientation: Orientation,
  metadata: ProposalMetadata,
  parts: ProposalPart[],
) {
  const blob = await createProposalPdf(canvas, orientation, metadata, parts);
  const name = (metadata.customer || metadata.site || "LPガス設備").replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  downloadBlob(blob, `${name}_切替提案書.pdf`);
}

export async function printComparison(
  canvas: HTMLCanvasElement,
  orientation: Orientation,
) {
  const frame = document.createElement("iframe");
  frame.className = "print-frame";
  frame.title = "比較ページの印刷";
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("印刷画面を開けませんでした。");
  }
  doc.open();
  doc.write(
    `<!doctype html><html lang="ja"><head><title>切替提案書 写真比較</title><style>@page{size:A4 ${orientation};margin:0}html,body{margin:0;padding:0}img{display:block;width:${orientation === "portrait" ? 210 : 297}mm;height:${orientation === "portrait" ? 297 : 210}mm}</style></head><body><img alt="現状と切替後の完成予想の比較"></body></html>`,
  );
  doc.close();
  const image = doc.querySelector("img")!;
  image.src = canvas.toDataURL("image/jpeg", 0.96);
  await image.decode();
  frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), {
    once: true,
  });
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 120_000);
}
