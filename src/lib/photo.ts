import sampleSite from "../assets/sample-site.svg?raw";

export interface Photo {
  image: HTMLImageElement;
  url: string;
  name: string;
  width: number;
  height: number;
  sample: boolean;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "画像を読み込めませんでした。JPEG・PNG・WebPの画像を選び直してください。",
        ),
      );
    image.src = url;
  });
}

export async function loadSamplePhoto(): Promise<Photo> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sampleSite)}`;
  const image = await loadImage(url);
  return {
    image,
    url,
    name: "サンプル背景（イラスト）",
    width: image.naturalWidth,
    height: image.naturalHeight,
    sample: true,
  };
}

export async function loadPhoto(file: File): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPEG・PNG・WebPの画像を選んでください。");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("画像は30MB以下のファイルを選んでください。");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    ) {
      throw new Error(
        "画像が大きすぎます。4,000万画素以下に縮小してから読み込んでください。",
      );
    }
    return {
      image,
      url,
      name: file.name,
      width: image.naturalWidth,
      height: image.naturalHeight,
      sample: false,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function releasePhoto(photo: Photo | null) {
  if (photo && !photo.sample) URL.revokeObjectURL(photo.url);
}
