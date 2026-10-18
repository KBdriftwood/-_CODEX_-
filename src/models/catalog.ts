export interface EquipmentDefinition {
  id: string;
  name: string;
  placeholder: boolean;
  dimensions: { length: number; diameter: number; height: number };
  kind?:
    | "horizontal"
    | "vertical"
    | "foundation"
    | "barrier"
    | "vaporizer"
    | "heater"
    | "gas-pipe"
    | "hot-pipe";
  asset:
    | { type: "procedural" }
    | { type: "glb"; url: string; scaleToMeters: number };
}

// 操作確認用の仮寸法。実在する製品の仕様ではありません。
export const BULK_MODEL: EquipmentDefinition = {
  id: "sample-bulk",
  name: "簡易バルクタンク",
  placeholder: true,
  dimensions: { length: 4, diameter: 1.4, height: 2.2 },
  asset: { type: "procedural" },
  kind: "horizontal",
};

export const EQUIPMENT_CATALOG: EquipmentDefinition[] = [
  {
    id: "vertical-bulk",
    name: "縦バルク",
    kind: "vertical",
    placeholder: true,
    dimensions: { length: 1.6, diameter: 1.6, height: 3.6 },
    asset: { type: "procedural" },
  },
  { ...BULK_MODEL, name: "横バルク" },
  {
    id: "foundation",
    name: "基礎",
    kind: "foundation",
    placeholder: true,
    dimensions: { length: 3.2, diameter: 2.0, height: 0.25 },
    asset: { type: "procedural" },
  },
  {
    id: "barrier",
    name: "障壁",
    kind: "barrier",
    placeholder: true,
    dimensions: { length: 3.5, diameter: 0.2, height: 2.0 },
    asset: { type: "procedural" },
  },
  {
    id: "vaporizer",
    name: "VR（ベーパーライザー）",
    kind: "vaporizer",
    placeholder: true,
    dimensions: { length: 1.2, diameter: 0.65, height: 1.6 },
    asset: { type: "procedural" },
  },
  {
    id: "heater",
    name: "熱源器",
    kind: "heater",
    placeholder: true,
    dimensions: { length: 1, diameter: 0.6, height: 1.8 },
    asset: { type: "procedural" },
  },
  {
    id: "gas-pipe",
    name: "LPガス配管",
    kind: "gas-pipe",
    placeholder: true,
    dimensions: { length: 2.5, diameter: 0.08, height: 0.2 },
    asset: { type: "procedural" },
  },
  {
    id: "hot-pipe",
    name: "お湯配管",
    kind: "hot-pipe",
    placeholder: true,
    dimensions: { length: 2.5, diameter: 0.08, height: 0.2 },
    asset: { type: "procedural" },
  },
];

export function getDefinition(id: string) {
  const definition = EQUIPMENT_CATALOG.find((item) => item.id === id);
  if (!definition) throw new Error("設備の定義が見つかりません。");
  return definition;
}
