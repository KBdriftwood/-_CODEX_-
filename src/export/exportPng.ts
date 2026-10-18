import type { Photo } from "../lib/photo";
import type { EquipmentScene } from "../scene/EquipmentScene";

export function exportDimensions(
  width: number,
  height: number,
  maxDimension: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function exportPng(photo: Photo, scene: EquipmentScene) {
  const { width, height } = exportDimensions(
    photo.width,
    photo.height,
    scene.maxExportDimension(),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("画像を保存できません。別のブラウザでお試しください。");
  ctx.drawImage(photo.image, 0, 0, width, height);
  ctx.drawImage(scene.capture(width, height), 0, 0);
  // 仮モデルの画像が実製品の完成図として独り歩きしないよう、PNGにも明記する。
  const fontSize = Math.max(10, Math.round(width * 0.013));
  const padding = Math.max(6, Math.round(width * 0.011));
  ctx.font = `600 ${fontSize}px "Yu Gothic", "Meiryo", sans-serif`;
  const label = photo.sample
    ? "仮モデル・仮寸法 / サンプル背景（イラスト）"
    : "仮モデル・仮寸法 / 完成イメージ";
  const labelWidth = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(18, 38, 45, 0.82)";
  ctx.fillRect(
    0,
    height - fontSize - padding * 2,
    Math.min(width, labelWidth + padding * 2),
    fontSize + padding * 2,
  );
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(
    label,
    padding,
    height - padding - fontSize / 2,
    Math.max(1, width - padding * 2),
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("PNG画像の作成に失敗しました。")),
      "image/png",
    ),
  );
  const name = photo.sample ? "サンプル" : photo.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}_完成イメージ.png`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return { width, height };
}
