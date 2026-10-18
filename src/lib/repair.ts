import type { Photo } from "./photo";

export interface Point {
  x: number;
  y: number;
}
export function copyCanvas(canvas: HTMLCanvasElement) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d")!.drawImage(canvas, 0, 0);
  return copy;
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("修復した写真を作成できませんでした。")),
      "image/png",
    ),
  );
}
export async function repairedPhoto(
  canvas: HTMLCanvasElement,
  photo: Photo,
): Promise<Photo> {
  const blob = await canvasBlob(canvas);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      image,
      url,
      width: canvas.width,
      height: canvas.height,
      sample: photo.sample,
      name: `${photo.name.replace(/\.[^.]+$/, "")}_修復済み.png`,
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("修復した写真を読み込めませんでした。");
  }
}

// 各ストロークの開始時の画像からサンプリングし、描画済み部分が連鎖してにじむことを防ぐ。
export class CloneStroke {
  private readonly source: HTMLCanvasElement;
  private readonly brush = document.createElement("canvas");
  private readonly radius: number;
  private previous: Point;
  private readonly offset: Point;
  clipped = false;
  constructor(
    private readonly target: HTMLCanvasElement,
    origin: Point,
    start: Point,
    diameter: number,
    private readonly feather: number,
  ) {
    this.source = copyCanvas(target);
    this.radius = Math.max(1, diameter / 2);
    this.brush.width = this.brush.height = Math.ceil(this.radius * 2);
    this.offset = { x: origin.x - start.x, y: origin.y - start.y };
    this.previous = start;
    this.stamp(start);
  }
  get sourcePoint() {
    return {
      x: this.previous.x + this.offset.x,
      y: this.previous.y + this.offset.y,
    };
  }
  move(point: Point) {
    const distance = Math.hypot(
      point.x - this.previous.x,
      point.y - this.previous.y,
    );
    const steps = Math.max(
      1,
      Math.ceil(distance / Math.max(1, this.radius * 0.2)),
    );
    const start = this.previous;
    for (let i = 1; i <= steps; i++)
      this.stamp({
        x: start.x + ((point.x - start.x) * i) / steps,
        y: start.y + ((point.y - start.y) * i) / steps,
      });
    this.previous = point;
  }
  private stamp(point: Point) {
    const sourceX = point.x + this.offset.x,
      sourceY = point.y + this.offset.y;
    const radius = this.radius,
      diameter = radius * 2;
    if (
      sourceX - radius < 0 ||
      sourceY - radius < 0 ||
      sourceX + radius > this.source.width ||
      sourceY + radius > this.source.height
    ) {
      this.clipped = true;
      return;
    }
    const ctx = this.brush.getContext("2d")!;
    ctx.clearRect(0, 0, this.brush.width, this.brush.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(
      this.source,
      sourceX - radius,
      sourceY - radius,
      diameter,
      diameter,
      0,
      0,
      diameter,
      diameter,
    );
    const mask = ctx.createRadialGradient(
      radius,
      radius,
      radius * Math.min(0.999, 1 - this.feather / 100),
      radius,
      radius,
      radius,
    );
    mask.addColorStop(0, "#fff");
    mask.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = mask;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.globalCompositeOperation = "source-over";
    this.target
      .getContext("2d")!
      .drawImage(this.brush, point.x - radius, point.y - radius);
  }
}
