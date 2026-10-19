// 設備種類の定義。寸法は mm。未入力は null（未確認）を許容する。
// 見た目のアイコンと、実寸法に基づく外形描画は分離する。

const EQUIPMENT_TYPES = [
  {
    type: "foundation",
    label: "基礎",
    shape: "rect",
    fill: "#d9d2c5",
    stroke: "#6f6758",
    icon: "foundation",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "road",
    label: "道路",
    shape: "rect",
    fill: "#b0b5bb",
    stroke: "#555b63",
    icon: "road",
    fields: [
      { key: "lengthMm", label: "長さ（mm）", required: true },
      { key: "widthMm", label: "幅（mm）", required: true }
    ]
  },
  {
    type: "underground_tank",
    label: "地下タンク",
    shape: "circle",
    fill: "#d5dee8",
    stroke: "#3c5670",
    icon: "tank",
    fields: [
      { key: "lengthMm", label: "長さ（mm）", required: true },
      { key: "diameterMm", label: "直径（mm）", required: true },
      {
        key: "burialDepthMm",
        label: "埋設深さ（mm）",
        required: false,
        hint: "地盤面を±0mmとした深さ。不明なら空欄。"
      }
    ]
  },
  {
    type: "pump_house",
    label: "ポンプ小屋",
    shape: "rect",
    fill: "#e6d3b5",
    stroke: "#8a6a45",
    icon: "pump",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "greenbelt",
    label: "緑地帯",
    shape: "rect",
    fill: "#a8c992",
    stroke: "#4f7a3d",
    icon: "green",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "parking",
    label: "駐車場",
    shape: "rect",
    fill: "#cfd4da",
    stroke: "#6e7680",
    icon: "parking",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "factory",
    label: "工場",
    shape: "rect",
    fill: "#ead7b8",
    stroke: "#a88462",
    icon: "factory",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "office",
    label: "事務所",
    shape: "rect",
    fill: "#d7e0ea",
    stroke: "#5a6d82",
    icon: "office",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "bulk_2_9t",
    label: "2.9ｔバルク",
    shape: "circle",
    fill: "#c8d7e8",
    stroke: "#35506c",
    icon: "bulk29",
    fields: [
      { key: "diameterMm", label: "直径（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "bulk_1t",
    label: "1ｔバルク",
    shape: "circle",
    fill: "#bcd0e4",
    stroke: "#3a5874",
    icon: "bulk1",
    fields: [
      { key: "diameterMm", label: "直径（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "vaporizer",
    label: "ＶＲ",
    shape: "rect",
    fill: "#f0c98a",
    stroke: "#8a5a18",
    icon: "vr",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "heater",
    label: "熱源器",
    shape: "rect",
    fill: "#e28655",
    stroke: "#8d3d22",
    icon: "heater",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ]
  },
  {
    type: "pipe",
    label: "配管",
    shape: "pipe",
    fill: "#c45c26",
    stroke: "#8a3d16",
    icon: "pipe",
    placeMode: "line",
    fields: [
      { key: "diameterMm", label: "太さ", required: false, unitSuffix: "A" }
    ]
  },
  {
    type: "other",
    label: "その他",
    shape: "rect",
    fill: "#d8d2c6",
    stroke: "#6f6758",
    icon: "other",
    fields: [
      { key: "widthMm", label: "幅（mm）", required: true },
      { key: "depthMm", label: "奥行き（mm）", required: true },
      { key: "heightMm", label: "高さ（mm）", required: false }
    ],
    allowsCustomShape: true
  }
];

function equipmentTypeOf(type) {
  return EQUIPMENT_TYPES.find((item) => item.type === type) || EQUIPMENT_TYPES[EQUIPMENT_TYPES.length - 1];
}

function isPipeType(type) {
  return type === "pipe";
}

function isLinePlaceType(type) {
  const def = equipmentTypeOf(type);
  return !!(def && def.placeMode === "line");
}

function iconSvg(name) {
  const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const paths = {
    foundation: '<rect x="3" y="14" width="18" height="5" rx="1"/><path d="M5 14V9h4v5M10 14V7h4v7M15 14V10h4v4"/>',
    road: '<path d="M4 19L8 5h8l4 14"/><path d="M12 7v2M12 12v2M12 17v1"/>',
    tank: '<ellipse cx="12" cy="8" rx="6" ry="3"/><path d="M6 8v8c0 1.7 2.7 3 6 3s6-1.3 6-3V8"/><path d="M6 12c0 1.7 2.7 3 6 3s6-1.3 6-3"/>',
    bulk29: '<circle cx="12" cy="12" r="8"/><text x="12" y="14" text-anchor="middle" font-size="5.5" fill="currentColor" stroke="none" font-weight="700">2.9</text>',
    bulk1: '<circle cx="12" cy="12" r="7.5"/><text x="12" y="14.2" text-anchor="middle" font-size="7" fill="currentColor" stroke="none" font-weight="700">1</text>',
    vr: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M8 8h8M8 12h8M8 16h8M7 8c2 1.5 2 2.5 0 4M17 8c-2 1.5-2 2.5 0 4"/>',
    heater: '<rect x="4" y="7" width="16" height="12" rx="1"/><path d="M7 7V5h4v2M13 7V4h4v3M8 12h2M12 12h2M16 12h1M8 16h8"/>',
    pump: '<rect x="4" y="8" width="12" height="10" rx="1"/><path d="M16 11h3v4h-3M8 8V6h4v2"/>',
    green: '<path d="M12 20V11"/><path d="M12 14c-3-1-5-4-4-7 3 0 5 2 4 5"/><path d="M12 13c3-1 5-4 4-7-3 0-5 2-4 5"/><path d="M7 20h10"/>',
    parking: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M9 15V9h3.2a2.4 2.4 0 010 4.8H9"/>',
    factory: '<path d="M3 20V10l5 3V10l5 3V8l8 4v8z"/><path d="M7 20v-3M12 20v-3M17 20v-3"/>',
    office: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M8 8h2M12 8h2M8 12h2M12 12h2M8 16h8"/>',
    other: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 12h6M12 9v6"/>',
    pipe: '<path d="M4 14h7l2-4h7"/><circle cx="5" cy="14" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="10" r="1.6" fill="currentColor" stroke="none"/>'
  };
  return `<svg class="icon" ${common}>${paths[name] || paths.other}</svg>`;
}
