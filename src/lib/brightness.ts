import type { Photo } from './photo';

// Sample only the background, at bounded resolution; never the composited model.
export function brightnessSampler(photo: Photo | null) {
  if (!photo || photo.sample) return () => 1;
  const canvas = document.createElement('canvas');
  const scale = 160 / Math.max(photo.width, photo.height);
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return () => 1;
  try {
    context.drawImage(photo.image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return (x: number, y: number) => {
      const samples: number[] = [];
      const cx = Math.round(x / 100 * (canvas.width - 1));
      const cy = Math.round(y / 100 * (canvas.height - 1));
      for (let dy = -12; dy <= 4; dy++) {
        for (let dx = -12; dx <= 12; dx++) {
          const px = cx + dx, py = cy + dy;
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const i = (py * canvas.width + px) * 4;
          if (data[i + 3] < 128) continue;
          samples.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
        }
      }
      if (!samples.length) return 1;
      samples.sort((a, b) => a - b);
      // Median resists small highlights. Limit automatic exposure to -20% / +10%.
      return Math.max(0.8, Math.min(1.1, 1 + (samples[Math.floor(samples.length / 2)] - 0.55) * 0.5));
    };
  } catch {
    return () => 1;
  }
}
