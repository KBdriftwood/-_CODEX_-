export interface EquipmentDefinition {
  id: string;
  name: string;
  placeholder: boolean;
  dimensions: { length: number; diameter: number; height: number };
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
};
