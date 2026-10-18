export type Mode = "move" | "rotate" | "camera";

export interface PlacedEquipment {
  id: string;
  modelId: string;
  state: EditorState;
  visible: boolean;
  length: number;
  pipeShape: "straight" | "elbow" | "u";
}

export const CAMERA_KEYS = ["azimuth", "elevation", "fov"] as const;

export function newEquipment(
  modelId = "vertical-bulk",
  index = 0,
): PlacedEquipment {
  return {
    id: crypto.randomUUID(),
    modelId,
    state: { ...DEFAULT_STATE, x: 54 + (index % 4) * 3, y: 75 },
    visible: true,
    length: 2.5,
    pipeShape: "straight",
  };
}

export interface EditorState {
  x: number;
  y: number;
  size: number;
  yaw: number;
  pitch: number;
  roll: number;
  azimuth: number;
  elevation: number;
  fov: number;
}

export const DEFAULT_STATE: Readonly<EditorState> = {
  x: 54,
  y: 75,
  size: 100,
  yaw: 0,
  pitch: 0,
  roll: 0,
  azimuth: 28,
  elevation: 14,
  fov: 38,
};

export const limits: Record<keyof EditorState, [number, number]> = {
  x: [0, 100],
  y: [0, 100],
  size: [20, 200],
  yaw: [-180, 180],
  pitch: [-45, 45],
  roll: [-45, 45],
  azimuth: [-180, 180],
  elevation: [-10, 75],
  fov: [20, 80],
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function updateValue(
  state: EditorState,
  key: keyof EditorState,
  value: number,
): EditorState {
  if (!Number.isFinite(value)) return state;
  return {
    ...state,
    [key]: Math.round(clamp(value, ...limits[key]) * 10) / 10,
  };
}

export function fitRect(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.min(
    Math.max(1, width) / imageWidth,
    Math.max(1, height) / imageHeight,
  );
  return { width: imageWidth * scale, height: imageHeight * scale };
}

export function dragState(
  initial: EditorState,
  mode: Mode,
  dx: number,
  dy: number,
  width: number,
  height: number,
  fine = false,
) {
  const factor = fine ? 0.2 : 1;
  if (mode === "move") {
    return updateValue(
      updateValue(initial, "x", initial.x + (dx / width) * 100 * factor),
      "y",
      initial.y + (dy / height) * 100 * factor,
    );
  }
  if (mode === "rotate") {
    return updateValue(
      updateValue(initial, "yaw", initial.yaw + dx * 0.4 * factor),
      "pitch",
      initial.pitch + dy * 0.25 * factor,
    );
  }
  return updateValue(
    updateValue(initial, "azimuth", initial.azimuth + dx * 0.35 * factor),
    "elevation",
    initial.elevation + dy * 0.2 * factor,
  );
}
