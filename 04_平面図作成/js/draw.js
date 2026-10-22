// 平面図描画。表示用の方眼間隔と、実移動単位(100mm)は分離する。

const DrawView = {
  scale: 0.012, // px / mm
  offsetX: 40,
  offsetY: 40,
  minScale: 0.004,
  maxScale: 0.4,
  printMode: false,
  _labelHitList: []
};

function printLabelBoost(basePx) {
  const base = Math.max(10, Number(basePx) || 11);
  if (!DrawView.printMode) {
    return base;
  }
  // 印刷キャンバスは高解像度なので、画面より大きくしないと紙面で潰れる
  return Math.max(17, Math.round(base * 1.65));
}

function worldToScreen(xMm, yMm) {
  return {
    x: DrawView.offsetX + xMm * DrawView.scale,
    y: DrawView.offsetY + yMm * DrawView.scale
  };
}

function screenToWorld(xPx, yPx) {
  return {
    xMm: (xPx - DrawView.offsetX) / DrawView.scale,
    yMm: (yPx - DrawView.offsetY) / DrawView.scale
  };
}

function fitSiteToCanvas(canvas, site) {
  const pad = 48;
  const sx = (canvas.clientWidth - pad * 2) / site.widthMm;
  const sy = (canvas.clientHeight - pad * 2) / site.depthMm;
  DrawView.scale = clamp(Math.min(sx, sy), DrawView.minScale, DrawView.maxScale);
  const w = site.widthMm * DrawView.scale;
  const h = site.depthMm * DrawView.scale;
  DrawView.offsetX = (canvas.clientWidth - w) / 2;
  DrawView.offsetY = (canvas.clientHeight - h) / 2;
}

function zoomAt(canvas, factor, cx, cy) {
  const before = screenToWorld(cx, cy);
  DrawView.scale = clamp(DrawView.scale * factor, DrawView.minScale, DrawView.maxScale);
  const after = worldToScreen(before.xMm, before.yMm);
  DrawView.offsetX += cx - after.x;
  DrawView.offsetY += cy - after.y;
}

function chooseGridStepMm() {
  const candidates = [100, 200, 500, 1000, 2000, 5000, 10000];
  let best = candidates[candidates.length - 1];
  for (let i = 0; i < candidates.length; i += 1) {
    const px = candidates[i] * DrawView.scale;
    if (px >= 24) {
      best = candidates[i];
      break;
    }
  }
  return best;
}

/**
 * @param {"before"|"after"} pageRole
 * @returns {"muted"|"emphasis"}
 */
function resolveDrawEmphasis(equipment, placement, pageRole) {
  if (pageRole === "after") {
    return isAfterOwnedItem(equipment, placement) ? "emphasis" : "muted";
  }
  // ビフォア画面は淡いパステルで統一
  return "muted";
}

// アフター変更は設備種類ごとに色分け（青・緑・黄・紫・桃色など）
const AFTER_ACCENT_FALLBACK = {
  fill: "#6faad4",
  stroke: "#1e4f7a",
  glow: "rgba(30, 90, 160, 0.38)",
  label: "#143a5c"
};
const AFTER_ACCENT_BY_TYPE = {
  foundation: { fill: "#6e737a", stroke: "#2f343a", glow: "rgba(47, 52, 58, 0.42)", label: "#1e2226" },
  road: { fill: "#9aa3ad", stroke: "#4a5560", glow: "rgba(74, 85, 96, 0.35)", label: "#2f3840" },
  underground_tank: { fill: "#6faad4", stroke: "#1e4f7a", glow: "rgba(30, 90, 160, 0.38)", label: "#143a5c" },
  pump_house: { fill: "#d4a574", stroke: "#8a5528", glow: "rgba(138, 85, 40, 0.36)", label: "#5c3718" },
  greenbelt: { fill: "#7ec98a", stroke: "#2f7a3d", glow: "rgba(47, 122, 61, 0.38)", label: "#1d4f28" },
  parking: { fill: "#b0b8c2", stroke: "#5a6570", glow: "rgba(90, 101, 112, 0.35)", label: "#3a424a" },
  factory: { fill: "#e0b87a", stroke: "#a06a28", glow: "rgba(160, 106, 40, 0.36)", label: "#6a4210" },
  office: { fill: "#8eb6e0", stroke: "#2f5f8f", glow: "rgba(47, 95, 143, 0.38)", label: "#1a3f66" },
  bulk_2_9t: { fill: "#7ec8e8", stroke: "#1f6a9a", glow: "rgba(31, 106, 154, 0.38)", label: "#134866" },
  bulk_1t: { fill: "#5bc4c4", stroke: "#1a7a7a", glow: "rgba(26, 122, 122, 0.38)", label: "#0f5555" },
  vaporizer: { fill: "#f0c94a", stroke: "#b8860b", glow: "rgba(184, 134, 11, 0.4)", label: "#7a5808" },
  heater: { fill: "#f0a060", stroke: "#c45c20", glow: "rgba(196, 92, 32, 0.38)", label: "#8a3a10" },
  pipe: { fill: "#e878a0", stroke: "#a83868", glow: "rgba(168, 56, 104, 0.4)", label: "#7a2448" },
  other: { fill: "#c9a0e0", stroke: "#7a3d9a", glow: "rgba(122, 61, 154, 0.38)", label: "#4e2470" }
};

// ビフォア／映し出し用の淡いパステル（色相は残し、明るさと淡さをそろえる）
const BEFORE_PASTEL_FALLBACK = {
  fill: "#efe8dc",
  stroke: "#a89a82",
  label: "#6f6758"
};
const BEFORE_PASTEL_BY_TYPE = {
  foundation: { fill: "#efe8dc", stroke: "#a89a82", label: "#6f6758" },
  road: { fill: "#dde2e7", stroke: "#8a929c", label: "#555b63" },
  underground_tank: { fill: "#e4ecf4", stroke: "#7f9bb4", label: "#3c5670" },
  pump_house: { fill: "#f2e5d0", stroke: "#c4a07a", label: "#8a6a45" },
  greenbelt: { fill: "#e4f0dc", stroke: "#92b984", label: "#4f7a3d" },
  parking: { fill: "#e6eaef", stroke: "#97a0aa", label: "#6e7680" },
  factory: { fill: "#f3e7d4", stroke: "#c9a882", label: "#7a5e3a" },
  office: { fill: "#e4ecf4", stroke: "#8fa6bc", label: "#4f657a" },
  bulk_2_9t: { fill: "#dde8f2", stroke: "#7f9bb4", label: "#456379" },
  bulk_1t: { fill: "#d8e8ee", stroke: "#7aa6b0", label: "#3a5874" },
  vaporizer: { fill: "#f8e9c8", stroke: "#d0a85a", label: "#8a5a18" },
  heater: { fill: "#f3d5c4", stroke: "#d08a6e", label: "#8d3d22" },
  pipe: { fill: "#f0d2c4", stroke: "#d08a6e", label: "#8a4a2e" },
  other: { fill: "#efe8dc", stroke: "#a89a82", label: "#6f6758" }
};

function afterAccentOf(type) {
  return AFTER_ACCENT_BY_TYPE[type] || AFTER_ACCENT_FALLBACK;
}

function beforePastelOf(type) {
  return BEFORE_PASTEL_BY_TYPE[type] || BEFORE_PASTEL_FALLBACK;
}

function emphasisAlpha(emphasis, selected) {
  if (selected) {
    return 1;
  }
  // パステル自体が薄いので、透明度はあまり下げない
  if (emphasis === "emphasis") {
    return 1;
  }
  return DrawView.printMode ? 0.94 : 0.9;
}

function mixHex(hexA, hexB, amount) {
  const parse = (hex) => {
    const raw = String(hex || "#cccccc").replace("#", "");
    if (raw.length !== 6) {
      return [200, 200, 200];
    }
    return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16));
  };
  const a = parse(hexA);
  const b = parse(hexB);
  const t = Math.max(0, Math.min(1, amount));
  return "#" + a.map((ch, i) => {
    return Math.round(ch + (b[i] - ch) * t).toString(16).padStart(2, "0");
  }).join("");
}

function mixHexWithWhite(hex, amount) {
  return mixHex(hex, "#ffffff", amount);
}

function emphasisFill(baseFill, emphasis, type) {
  if (emphasis === "emphasis") {
    return mixHex(baseFill, afterAccentOf(type).fill, 0.82);
  }
  // ビフォア／映し出し：淡いパステル（色相は残す）
  return mixHex(baseFill, beforePastelOf(type).fill, 0.88);
}

function emphasisStroke(baseStroke, emphasis, selected, type) {
  if (selected || emphasis === "emphasis") {
    return afterAccentOf(type).stroke;
  }
  return mixHex(baseStroke, beforePastelOf(type).stroke, 0.75);
}

function drawScene(canvas, doc, selectedPlacementIds, sizeOverride, options) {
  const selected = selectedPlacementIds instanceof Set
    ? selectedPlacementIds
    : new Set(selectedPlacementIds ? [selectedPlacementIds] : []);
  const pageRole = options && options.pageRole === "after" ? "after" : "before";
  const prevPrintMode = DrawView.printMode;
  DrawView.printMode = !!(options && options.printMode);
  const ctx = canvas.getContext("2d");
  const fixed = sizeOverride && sizeOverride.width && sizeOverride.height;
  const dpr = fixed ? 1 : (window.devicePixelRatio || 1);
  const cssW = fixed ? sizeOverride.width : (canvas.clientWidth || 1);
  const cssH = fixed ? sizeOverride.height : (canvas.clientHeight || 1);
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // 印刷は白地を優先（グレー紙面にならないようにする）
  ctx.fillStyle = DrawView.printMode
    ? "#ffffff"
    : (pageRole === "after" ? "#f5f7fa" : "#fafaf8");
  ctx.fillRect(0, 0, cssW, cssH);

  drawSiteFrame(ctx, doc.site);
  drawGrid(ctx, doc.site, cssW, cssH);

  const pairs = pairedItems(doc).map((pair) => ({
    equipment: pair.equipment,
    placement: pair.placement,
    emphasis: resolveDrawEmphasis(pair.equipment, pair.placement, pageRole)
  }));
  // 薄いもの→目立つものの順で重ね、アフター変更が手前に見えるようにする
  const drawOrder = pairs.slice().sort((a, b) => {
    const ae = a.emphasis === "emphasis" ? 1 : 0;
    const be = b.emphasis === "emphasis" ? 1 : 0;
    return ae - be;
  });
  drawOrder.forEach((pair) => {
    drawEquipmentBody(
      ctx,
      pair.equipment,
      pair.placement,
      selected.has(pair.placement.id),
      pair.emphasis
    );
  });

  drawGroupOverlays(ctx, doc, selected, pageRole);

  const labels = buildPlanLabels(doc);
  resolveLabelCollisions(labels);
  DrawView._labelHitList = labels;
  const emphasisByPlacement = new Map(
    pairs.map((pair) => [pair.placement.id, pair.emphasis])
  );
  const typeByPlacement = new Map(
    pairs.map((pair) => [pair.placement.id, pair.equipment.type])
  );
  labels.forEach((label) => {
    drawPlanLabel(
      ctx,
      label,
      selected.has(label.placementId),
      emphasisByPlacement.get(label.placementId) || "muted",
      typeByPlacement.get(label.placementId)
    );
  });
  DrawView.printMode = prevPrintMode;
}

function drawGroupOverlays(ctx, doc, selected, pageRole) {
  const groups = doc.drawing.groups || [];
  groups.forEach((group) => {
    const placements = getGroupPlacements(doc, group);
    if (placements.length < 2) {
      return;
    }
    const bounds = groupBoundsMm(doc, placements);
    if (!bounds) {
      return;
    }
    const a = worldToScreen(bounds.minX, bounds.minY);
    const b = worldToScreen(bounds.maxX, bounds.maxY);
    const active = placements.some((item) => selected.has(item.id));
    let accentType = null;
    if (pageRole === "after") {
      for (let i = 0; i < placements.length; i += 1) {
        const eq = findEquipment(doc, placements[i].equipmentId);
        if (isAfterOwnedItem(eq, placements[i])) {
          accentType = eq.type;
          break;
        }
      }
    }
    const afterOwned = !!accentType;
    const accent = afterAccentOf(accentType || "other");
    ctx.save();
    ctx.globalAlpha = active ? 1 : (afterOwned ? 1 : 0.55);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = active || afterOwned ? accent.stroke : "rgba(90, 101, 112, 0.45)";
    ctx.lineWidth = active ? 2.2 : (afterOwned ? 2 : 1.15);
    ctx.strokeRect(a.x - 3, a.y - 3, b.x - a.x + 6, b.y - a.y + 6);
    ctx.setLineDash([]);
    ctx.font = (DrawView.printMode ? "700 16px" : "11px") + " Yu Gothic UI, Meiryo, sans-serif";
    ctx.fillStyle = active || afterOwned
      ? (DrawView.printMode ? mixHex(accent.label, "#000000", 0.25) : accent.label)
      : (DrawView.printMode ? "#1a1e24" : "rgba(42, 46, 52, 0.55)");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = DrawView.printMode ? 4.5 : 3;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const label = group.name || DEFAULT_GROUP_NAME;
    ctx.strokeText(label, a.x, a.y - 4);
    ctx.fillText(label, a.x, a.y - 4);
    ctx.restore();
  });
}

function drawSiteFrame(ctx, site) {
  const a = worldToScreen(0, 0);
  const b = worldToScreen(site.widthMm, site.depthMm);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.strokeStyle = "#8a9099";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
}

function drawGrid(ctx, site, cssW, cssH) {
  const step = chooseGridStepMm();
  const minor = step <= 100 ? null : (step >= 5000 ? 1000 : 100);
  const origin = worldToScreen(0, 0);
  const end = worldToScreen(site.widthMm, site.depthMm);

  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.min(origin.x, end.x), Math.min(origin.y, end.y), Math.abs(end.x - origin.x), Math.abs(end.y - origin.y));
  ctx.clip();

  if (minor && minor * DrawView.scale >= 8) {
    const maxLines = 500;
    const countX = Math.ceil(site.widthMm / minor);
    const countY = Math.ceil(site.depthMm / minor);
    if (countX + countY <= maxLines * 2) {
      strokeGrid(
        ctx,
        site,
        minor,
        DrawView.printMode ? "rgba(180, 184, 190, 0.22)" : "rgba(180, 184, 190, 0.35)",
        DrawView.printMode ? 0.8 : 1
      );
    }
  }
  strokeGrid(
    ctx,
    site,
    step,
    DrawView.printMode ? "rgba(120, 126, 136, 0.35)" : "rgba(120, 126, 136, 0.55)",
    DrawView.printMode ? 1 : 1
  );

  ctx.fillStyle = DrawView.printMode ? "#2a2e34" : "#6b717a";
  ctx.font = (DrawView.printMode ? "700 16px" : "12px") + " Yu Gothic UI, Meiryo, sans-serif";
  ctx.fillText("0", origin.x + 4, origin.y + (DrawView.printMode ? 18 : 14));
  ctx.fillText(formatMm(site.widthMm), end.x - (DrawView.printMode ? 100 : 70), origin.y + (DrawView.printMode ? 18 : 14));
  ctx.fillText(formatMm(site.depthMm), origin.x + 4, end.y - (DrawView.printMode ? 12 : 8));

  ctx.restore();

  DrawView.gridStepMm = step;
  DrawView.gridMinorMm = minor;
}

function strokeGrid(ctx, site, step, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = 0; x <= site.widthMm; x += step) {
    const p0 = worldToScreen(x, 0);
    const p1 = worldToScreen(x, site.depthMm);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  for (let y = 0; y <= site.depthMm; y += step) {
    const p0 = worldToScreen(0, y);
    const p1 = worldToScreen(site.widthMm, y);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();
}

function drawEquipmentBody(ctx, equipment, placement, selected, emphasis) {
  const def = equipmentTypeOf(equipment.type);
  const tone = emphasis === "emphasis" ? "emphasis" : "muted";
  if (isPipeType(equipment.type)) {
    drawPipeBody(ctx, equipment, placement, selected, tone);
    return;
  }
  const fp = footprintOf(equipment, placement);
  const w = fp.widthMm;
  const d = fp.depthMm;
  if (w == null || d == null || w <= 0 || d <= 0) {
    return;
  }

  const p = worldToScreen(placement.xMm, placement.yMm);
  const size = {
    w: w * DrawView.scale,
    d: d * DrawView.scale
  };

  ctx.save();
  ctx.globalAlpha = emphasisAlpha(tone, selected);
  const accent = afterAccentOf(equipment.type);
  const fill = emphasisFill(def.fill, tone, equipment.type);
  const stroke = emphasisStroke(def.stroke, tone, selected, equipment.type);
  const lineW = DrawView.printMode
    ? (selected ? 3.4 : (tone === "emphasis" ? 3 : 2))
    : (selected ? 2.8 : (tone === "emphasis" ? 2.4 : 1.4));
  if (equipment.shape === "circle" || equipment.type === "underground_tank") {
    const cx = p.x + size.w / 2;
    const cy = p.y + size.d / 2;
    if (tone === "emphasis" && !selected) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, size.w / 2 + 3, size.d / 2 + 3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = accent.glow;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, size.w / 2, size.d / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();
  } else {
    if (tone === "emphasis" && !selected) {
      roundRect(ctx, p.x - 2.5, p.y - 2.5, size.w + 5, size.d + 5, 4);
      ctx.strokeStyle = accent.glow;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    roundRect(ctx, p.x, p.y, size.w, size.d, 3);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineW;
    ctx.stroke();
  }

  if (selected) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = accent.stroke;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(p.x - 4, p.y - 4, size.w + 8, size.d + 8);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function pipeStrokeWidthPx(equipment) {
  const diameter = equipment.dimensions && equipment.dimensions.diameterMm;
  // 呼び径（25A など）は実寸のmmではないので、平面図で見分けやすい見かけ太さに変換する
  const nominal = diameter != null && diameter > 0 ? Number(diameter) : 40;
  const apparentMm = Math.max(80, nominal * 8);
  const px = apparentMm * (DrawView.scale || 0.012);
  return Math.max(2.5, Math.min(40, px));
}

function drawPipeBody(ctx, equipment, placement, selected, emphasis) {
  const def = equipmentTypeOf(equipment.type);
  const tone = emphasis === "emphasis" ? "emphasis" : "muted";
  const accent = afterAccentOf(equipment.type);
  const ends = pipeEndpoints(placement);
  const a = worldToScreen(ends.x1, ends.y1);
  const b = worldToScreen(ends.x2, ends.y2);
  const width = pipeStrokeWidthPx(equipment);
  ctx.save();
  ctx.globalAlpha = emphasisAlpha(tone, selected);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (tone === "emphasis" && !selected) {
    ctx.strokeStyle = accent.glow;
    ctx.lineWidth = width + 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.strokeStyle = selected
    ? accent.stroke
    : emphasisStroke(def.stroke, tone, false, equipment.type);
  ctx.lineWidth = width + (selected ? 2.5 : (tone === "emphasis" ? 1.5 : 0));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = emphasisFill(def.fill, tone, equipment.type);
  ctx.lineWidth = Math.max(1.5, width * (tone === "emphasis" ? 0.68 : 0.5));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (selected) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent.stroke;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPipeDraft(ctx, startMm, endMm) {
  if (!startMm || !endMm) {
    return;
  }
  const a = worldToScreen(startMm.xMm, startMm.yMm);
  const b = worldToScreen(endMm.xMm, endMm.yMm);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#c45c26";
  ctx.lineWidth = Math.max(2, 40 * DrawView.scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#8a3d16";
  ctx.beginPath();
  ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function siteClipRect(placement, fp) {
  const site = typeof SITE_WIDTH_MM !== "undefined"
    ? { widthMm: SITE_WIDTH_MM, depthMm: SITE_DEPTH_MM }
    : null;
  const siteA = worldToScreen(0, 0);
  const siteB = worldToScreen(
    site ? site.widthMm : placement.xMm + (fp.widthMm || 0),
    site ? site.depthMm : placement.yMm + (fp.depthMm || 0)
  );
  return {
    left: Math.min(siteA.x, siteB.x) + 2,
    top: Math.min(siteA.y, siteB.y) + 2,
    right: Math.max(siteA.x, siteB.x) - 2,
    bottom: Math.max(siteA.y, siteB.y) - 2
  };
}

function measureLabelSize(text, fontPx, rotated) {
  const approx = Math.max(12, String(text).length * fontPx * 0.62);
  const h = fontPx + 4;
  if (rotated) {
    return { w: h, h: approx };
  }
  return { w: approx, h: h };
}

function buildPlanLabels(doc) {
  const labels = [];
  pairedItems(doc).forEach((pair) => {
    collectEquipmentLabels(labels, pair.equipment, pair.placement);
  });
  return labels;
}

function collectEquipmentLabels(labels, equipment, placement) {
  if (isPipeType(equipment.type)) {
    collectPipeLabels(labels, equipment, placement);
    return;
  }
  const fp = footprintOf(equipment, placement);
  const w = fp.widthMm;
  const d = fp.depthMm;
  if (w == null || d == null || w <= 0 || d <= 0) {
    return;
  }
  const p = worldToScreen(placement.xMm, placement.yMm);
  const size = { w: w * DrawView.scale, d: d * DrawView.scale };
  const dims = equipment.dimensions || {};
  const clip = siteClipRect(placement, fp);
  const pad = Math.max(10, Math.min(16, Math.min(size.w, size.d) * 0.08));
  const fontPx = printLabelBoost(size.w < 70 || size.d < 70 ? 11 : 12);
  const nameRow = size.w >= 24 && size.d >= 18 ? fontPx + 6 : 0;
  const offsets = placement.labelOffsets || {};

  // 横寸法線＝上辺全体、縦寸法線＝左辺全体（寄せない）
  const edgeTop = {
    x0: p.x + 4,
    y0: p.y + pad + nameRow + fontPx + 2,
    x1: p.x + size.w - 4,
    y1: p.y + pad + nameRow + fontPx + 2
  };
  const edgeSide = {
    x0: p.x + pad + fontPx + 2,
    y0: p.y + 4,
    x1: p.x + pad + fontPx + 2,
    y1: p.y + size.d - 4
  };
  const edgeInner = {
    x0: p.x + size.w * 0.25,
    y0: p.y + size.d - pad,
    x1: p.x + size.w * 0.75,
    y1: p.y + size.d - pad
  };

  if (size.w >= 24 && size.d >= 18) {
    const def = equipmentTypeOf(equipment.type);
    const rawName = equipment.name || def.label;
    const maxChars = Math.max(2, Math.floor((size.w - 8) / (fontPx * 0.6)));
    const text = rawName.length > maxChars ? rawName.slice(0, maxChars) + "…" : rawName;
    pushLabel(labels, {
      placementId: placement.id,
      key: "name",
      text: text,
      fontPx: fontPx,
      bold: true,
      rotated: false,
      baseX: p.x + 4,
      baseY: p.y + 4,
      align: "left",
      baseline: "top",
      anchorX: p.x + 8,
      anchorY: p.y + 8,
      edge: null,
      offset: offsets.name || null,
      locked: !!(offsets.name)
    });
  }

  let topLabel = "";
  let sideLabel = "";
  let innerLabel = "";
  if (equipment.type === "road") {
    topLabel = formatMm(dims.lengthMm);
    sideLabel = formatMm(dims.widthMm);
  } else if (equipment.type === "underground_tank") {
    topLabel = formatMm(dims.lengthMm);
    sideLabel = formatMm(dims.diameterMm);
    if (dims.burialDepthMm != null) {
      innerLabel = "深さ " + formatMm(dims.burialDepthMm);
    }
  } else if (equipment.type === "bulk_2_9t" || equipment.type === "bulk_1t") {
    topLabel = "φ " + formatMm(dims.diameterMm);
    innerLabel = dims.heightMm != null ? "H " + formatMm(dims.heightMm) : "H 未確認";
  } else {
    topLabel = formatMm(fp.widthMm);
    sideLabel = formatMm(fp.depthMm);
    if (dims.heightMm != null) {
      innerLabel = "H " + formatMm(dims.heightMm);
    } else if (equipmentTypeOf(equipment.type).fields.some((f) => f.key === "heightMm")) {
      innerLabel = "H 未確認";
    }
  }

  if (topLabel && size.w >= 36) {
    pushLabel(labels, {
      placementId: placement.id,
      key: "top",
      text: topLabel,
      fontPx: fontPx,
      bold: false,
      rotated: false,
      baseX: clamp(p.x + size.w / 2, clip.left + 20, clip.right - 20),
      baseY: clamp(p.y + pad + nameRow, clip.top + fontPx, clip.bottom - fontPx),
      align: "center",
      baseline: "top",
      anchorX: (edgeTop.x0 + edgeTop.x1) / 2,
      anchorY: edgeTop.y0,
      edge: edgeTop,
      offset: offsets.top || null,
      locked: !!(offsets.top)
    });
  }

  if (sideLabel && size.d >= 36) {
    pushLabel(labels, {
      placementId: placement.id,
      key: "side",
      text: sideLabel,
      fontPx: fontPx,
      bold: false,
      rotated: true,
      baseX: clamp(p.x + pad, clip.left + fontPx, clip.right - fontPx),
      baseY: clamp(p.y + size.d / 2, clip.top + 20, clip.bottom - 20),
      align: "center",
      baseline: "top",
      anchorX: edgeSide.x0,
      anchorY: (edgeSide.y0 + edgeSide.y1) / 2,
      edge: edgeSide,
      offset: offsets.side || null,
      locked: !!(offsets.side)
    });
  }

  if (innerLabel && size.w >= 40 && size.d >= 40) {
    pushLabel(labels, {
      placementId: placement.id,
      key: "inner",
      text: innerLabel,
      fontPx: fontPx,
      bold: false,
      rotated: false,
      baseX: clamp(p.x + size.w / 2, clip.left + 20, clip.right - 20),
      baseY: clamp(p.y + size.d - pad, clip.top + fontPx, clip.bottom - 2),
      align: "center",
      baseline: "bottom",
      anchorX: (edgeInner.x0 + edgeInner.x1) / 2,
      anchorY: edgeInner.y0,
      edge: edgeInner,
      offset: offsets.inner || null,
      locked: !!(offsets.inner)
    });
  }
}

function pushLabel(labels, spec) {
  const scale = DrawView.scale || 0.012;
  const dxPx = spec.offset ? spec.offset.dxMm * scale : 0;
  const dyPx = spec.offset ? spec.offset.dyMm * scale : 0;
  const x = spec.baseX + dxPx;
  const y = spec.baseY + dyPx;
  const box = measureLabelSize(spec.text, spec.fontPx, spec.rotated);
  const rect = labelScreenRect(x, y, box.w, box.h, spec.align, spec.baseline, spec.rotated);
  labels.push(Object.assign({}, spec, {
    x: x,
    y: y,
    autoDxPx: 0,
    autoDyPx: 0,
    boxW: box.w,
    boxH: box.h,
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom
  }));
}

function labelScreenRect(x, y, w, h, align, baseline, rotated) {
  let left = x;
  let top = y;
  if (!rotated) {
    if (align === "center") {
      left = x - w / 2;
    } else if (align === "right") {
      left = x - w;
    }
    if (baseline === "middle") {
      top = y - h / 2;
    } else if (baseline === "bottom") {
      top = y - h;
    }
  } else {
    left = x - w / 2;
    top = y - h / 2;
  }
  return { left: left, top: top, right: left + w, bottom: top + h };
}

function syncLabelRect(label) {
  const rect = labelScreenRect(
    label.x + label.autoDxPx,
    label.y + label.autoDyPx,
    label.boxW,
    label.boxH,
    label.align,
    label.baseline,
    label.rotated
  );
  label.left = rect.left;
  label.top = rect.top;
  label.right = rect.right;
  label.bottom = rect.bottom;
}

function labelsOverlap(a, b, pad) {
  const p = pad == null ? 2 : pad;
  return !(a.right + p <= b.left || b.right + p <= a.left || a.bottom + p <= b.top || b.bottom + p <= a.top);
}

function resolveLabelCollisions(labels) {
  const dirs = [
    { dx: 0, dy: -14 },
    { dx: 14, dy: 0 },
    { dx: 0, dy: 14 },
    { dx: -14, dy: 0 },
    { dx: 12, dy: -12 },
    { dx: 12, dy: 12 },
    { dx: -12, dy: 12 },
    { dx: -12, dy: -12 }
  ];
  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false;
    for (let i = 0; i < labels.length; i += 1) {
      const a = labels[i];
      for (let j = 0; j < i; j += 1) {
        const b = labels[j];
        syncLabelRect(a);
        syncLabelRect(b);
        if (!labelsOverlap(a, b, 3)) {
          continue;
        }
        const target = a.locked && !b.locked ? b : (!a.locked ? a : (b.locked ? a : b));
        const other = target === a ? b : a;
        let best = null;
        for (let d = 0; d < dirs.length; d += 1) {
          const trial = {
            left: target.left + dirs[d].dx,
            top: target.top + dirs[d].dy,
            right: target.right + dirs[d].dx,
            bottom: target.bottom + dirs[d].dy
          };
          if (!labelsOverlap(trial, other, 3)) {
            best = dirs[d];
            break;
          }
        }
        if (!best) {
          best = dirs[pass % dirs.length];
        }
        target.autoDxPx += best.dx;
        target.autoDyPx += best.dy;
        syncLabelRect(target);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  labels.forEach(syncLabelRect);
}

function drawPlanLabel(ctx, label, selected, emphasis, equipmentType) {
  const tone = emphasis === "emphasis" ? "emphasis" : "muted";
  const typeKey = equipmentType || "other";
  const accent = afterAccentOf(typeKey);
  const pastel = beforePastelOf(typeKey);
  const drawX = label.x + label.autoDxPx;
  const drawY = label.y + label.autoDyPx;
  const moved = Math.abs(drawX - label.baseX) > 1.5 || Math.abs(drawY - label.baseY) > 1.5;
  const print = !!DrawView.printMode;

  ctx.save();
  // 文字・数字はビフォア／アフターともはっきり見せる（設備本体の薄さとは分ける）
  ctx.globalAlpha = 1;

  if (label.edge) {
    drawEdgeTicks(ctx, label.edge.x0, label.edge.y0, label.edge.x1, label.edge.y1);
  }

  if (moved || label.locked) {
    drawLeaderLine(ctx, label, drawX, drawY, selected || tone === "emphasis" || print, accent);
  }

  const fontPx = print
    ? Math.max(18, (label.fontPx || 12) + 2)
    : Math.max(11, (label.fontPx || 11) + 1);
  ctx.font = ((selected || tone === "emphasis" || label.bold || print) ? "700 " : "650 ") +
    fontPx + "px Yu Gothic UI, Meiryo, sans-serif";
  // 印刷は黒い文字を優先。画面のビフォアはパステル系の区分色
  if (print) {
    ctx.fillStyle = selected || tone === "emphasis" ? mixHex(accent.label, "#000000", 0.35) : "#111418";
  } else if (selected || tone === "emphasis") {
    ctx.fillStyle = accent.label;
  } else {
    ctx.fillStyle = pastel.label;
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
  ctx.lineWidth = print ? 5.5 : (selected || tone === "emphasis" ? 4 : 3.5);
  if (label.rotated) {
    ctx.translate(drawX, drawY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    strokeFillText(ctx, label.text, 0, 0);
  } else {
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;
    strokeFillText(ctx, label.text, drawX, drawY);
  }
  ctx.restore();
}

function drawLeaderLine(ctx, label, drawX, drawY, strong, accent) {
  const toX = label.anchorX;
  const toY = label.anchorY;
  let fromX = drawX;
  let fromY = drawY;
  if (!label.rotated) {
    if (label.align === "left") {
      fromX = drawX + Math.min(10, label.boxW / 2);
    }
    if (label.baseline === "top") {
      fromY = drawY + label.fontPx;
    } else if (label.baseline === "bottom") {
      fromY = drawY - 2;
    }
  }
  const stroke = strong && accent
    ? accent.stroke
    : "rgba(26, 30, 36, 0.75)";
  const fill = strong && accent
    ? accent.stroke
    : "rgba(26, 30, 36, 0.85)";
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strong ? 1.5 : 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(toX, toY, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function strokeFillText(ctx, text, x, y) {
  // 白い縁取りを厚めにして、図面の上でも文字が沈まないようにする
  ctx.strokeText(text, x, y);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawEdgeTicks(ctx, x0, y0, x1, y1) {
  ctx.save();
  ctx.strokeStyle = DrawView.printMode ? "rgba(17, 20, 24, 0.92)" : "rgba(26, 30, 36, 0.78)";
  ctx.lineWidth = DrawView.printMode ? 2 : 1.25;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = (-dy / len) * 4;
  const py = (dx / len) * 4;
  ctx.beginPath();
  ctx.moveTo(x0 - px, y0 - py);
  ctx.lineTo(x0 + px, y0 + py);
  ctx.moveTo(x1 - px, y1 - py);
  ctx.lineTo(x1 + px, y1 + py);
  ctx.stroke();
  ctx.restore();
}

function hitTestLabel(xPx, yPx) {
  const list = DrawView._labelHitList || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const label = list[i];
    if (xPx >= label.left - 2 && xPx <= label.right + 2 && yPx >= label.top - 2 && yPx <= label.bottom + 2) {
      return label;
    }
  }
  return null;
}

function distancePointToSegmentMm(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 0) {
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + dx * t;
  const qy = y1 + dy * t;
  return Math.hypot(px - qx, py - qy);
}

function collectPipeLabels(labels, equipment, placement) {
  const ends = pipeEndpoints(placement);
  const length = pipeLengthMm(placement);
  if (length < MOVE_STEP_MM) {
    return;
  }
  const a = worldToScreen(ends.x1, ends.y1);
  const b = worldToScreen(ends.x2, ends.y2);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const fontPx = printLabelBoost(12);
  const offsets = placement.labelOffsets || {};
  const dims = equipment.dimensions || {};
  const def = equipmentTypeOf(equipment.type);
  pushLabel(labels, {
    placementId: placement.id,
    key: "name",
    text: equipment.name || def.label,
    fontPx: fontPx,
    bold: true,
    rotated: false,
    baseX: mx,
    baseY: my - 14,
    align: "center",
    baseline: "bottom",
    anchorX: mx,
    anchorY: my,
    edge: null,
    offset: offsets.name || null,
    locked: !!(offsets.name)
  });
  pushLabel(labels, {
    placementId: placement.id,
    key: "top",
    text: "L " + formatMm(length),
    fontPx: fontPx,
    bold: false,
    rotated: false,
    baseX: mx,
    baseY: my + 4,
    align: "center",
    baseline: "top",
    anchorX: mx,
    anchorY: my,
    edge: { x0: a.x, y0: a.y, x1: b.x, y1: b.y },
    offset: offsets.top || null,
    locked: !!(offsets.top)
  });
  if (dims.diameterMm != null) {
    pushLabel(labels, {
      placementId: placement.id,
      key: "inner",
      text: String(dims.diameterMm) + "A",
      fontPx: fontPx,
      bold: false,
      rotated: false,
      baseX: mx,
      baseY: my + 18,
      align: "center",
      baseline: "top",
      anchorX: mx,
      anchorY: my,
      edge: null,
      offset: offsets.inner || null,
      locked: !!(offsets.inner)
    });
  }
}

function hitTest(doc, xPx, yPx) {
  const world = screenToWorld(xPx, yPx);
  const pairs = pairedItems(doc).slice().reverse();
  for (let i = 0; i < pairs.length; i += 1) {
    const { equipment, placement } = pairs[i];
    if (isPipeType(equipment.type)) {
      const ends = pipeEndpoints(placement);
      const diameter = equipment.dimensions && equipment.dimensions.diameterMm;
      const nominal = diameter != null && diameter > 0 ? Number(diameter) : 40;
      const hitMm = Math.max(120, nominal * 4 + 80);
      if (distancePointToSegmentMm(world.xMm, world.yMm, ends.x1, ends.y1, ends.x2, ends.y2) <= hitMm) {
        return placement;
      }
      continue;
    }
    const fp = footprintOf(equipment, placement);
    if (fp.widthMm == null || fp.depthMm == null) {
      continue;
    }
    if (equipment.shape === "circle" || equipment.type === "underground_tank") {
      const cx = placement.xMm + fp.widthMm / 2;
      const cy = placement.yMm + fp.depthMm / 2;
      const nx = (world.xMm - cx) / (fp.widthMm / 2);
      const ny = (world.yMm - cy) / (fp.depthMm / 2);
      if (nx * nx + ny * ny <= 1) {
        return placement;
      }
    } else if (
      world.xMm >= placement.xMm &&
      world.xMm <= placement.xMm + fp.widthMm &&
      world.yMm >= placement.yMm &&
      world.yMm <= placement.yMm + fp.depthMm
    ) {
      return placement;
    }
  }
  return null;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
