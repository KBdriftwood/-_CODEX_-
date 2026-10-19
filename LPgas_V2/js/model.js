// V2データモデル。
// - pages.before / pages.after: ビフォア・アフターの独立した図面ページ
// - 各ページ内: equipment（設備）と drawing.placements（配置）
// - elevation 用の地盤基準（±0）も設備側に持つ。
// V1の localStorage キーには一切触れない。

const MOVE_STEP_MM = 100;
const SITE_WIDTH_MM = 50000;
const SITE_DEPTH_MM = 50000;
const STORAGE_KEY_V2 = "lp-gas-equipment-drawing-v2";
const SCHEMA_ID = "lp-gas-drawing-v2";
const PAGE_BEFORE = "before";
const PAGE_AFTER = "after";
const PAGE_COMPARE = "compare";
const VIEW_LABEL_PLAN = "上から平面図";
const DEFAULT_SHEET_NAME = "ニイミ産業";

function emptyPage() {
  return {
    equipment: [],
    drawing: {
      view: "plan",
      placements: [],
      groups: []
    }
  };
}

function todayIsoDate() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}

function emptyMeta() {
  return {
    date: todayIsoDate(),
    title: "",
    name: DEFAULT_SHEET_NAME
  };
}

function emptyDocument() {
  return {
    version: 2,
    schema: SCHEMA_ID,
    meta: emptyMeta(),
    site: {
      widthMm: SITE_WIDTH_MM,
      depthMm: SITE_DEPTH_MM,
      groundLevelMm: 0
    },
    activePage: PAGE_BEFORE,
    pages: {
      before: emptyPage(),
      after: null
    }
  };
}

function normalizeMeta(raw) {
  const base = emptyMeta();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  const date = String(raw.date || "").trim();
  base.date = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : base.date;
  base.title = String(raw.title || "").slice(0, 60);
  const name = String(raw.name == null ? DEFAULT_SHEET_NAME : raw.name).slice(0, 40);
  base.name = name;
  return base;
}

function fileNamePart(value) {
  return String(value || "").replace(/[\\/:*?"<>|]/g, "").trim();
}

/** ダウンロード用ファイル名（拡張子なし）: 20261012_上から平面図_タイトル_名前 */
function buildDownloadBaseName(meta, viewLabel) {
  const info = normalizeMeta(meta);
  const date = info.date ? info.date.replace(/-/g, "") : "";
  const pieces = [
    date,
    viewLabel || VIEW_LABEL_PLAN,
    fileNamePart(info.title),
    fileNamePart(info.name)
  ].filter(Boolean);
  return pieces.join("_") || (viewLabel || VIEW_LABEL_PLAN);
}

function workDocFromProject(project, pageKey) {
  const key = pageKey === PAGE_AFTER ? PAGE_AFTER : PAGE_BEFORE;
  const page = project.pages[key];
  if (!page) {
    return null;
  }
  return {
    site: project.site,
    equipment: page.equipment,
    drawing: page.drawing
  };
}

function hasAfterPage(project) {
  return !!(project.pages && project.pages.after);
}

/**
 * アフター画面で「アフター側の変更／追加」として目立たせるか。
 * - originId なし … アフターで新規追加
 * - followBefore === false … アフターで移動・寸法変更などして切り離した
 */
function isAfterOwnedItem(equipment, placement) {
  if (!equipment) {
    return false;
  }
  if (!equipment.originId) {
    return true;
  }
  if (placement && placement.followBefore === false) {
    return true;
  }
  return false;
}

function clonePageDeep(sourcePage) {
  const source = normalizePage(sourcePage) || emptyPage();
  const eqIdMap = {};
  const plIdMap = {};
  const equipment = source.equipment.map((eq) => {
    const copy = JSON.parse(JSON.stringify(eq));
    const newId = makeId("eq");
    eqIdMap[eq.id] = newId;
    copy.id = newId;
    // ビフォア側の設備ID。あとから増えた分だけアフターへ追記するために使う。
    copy.originId = eq.id;
    return copy;
  });
  const placements = source.drawing.placements.map((pl) => {
    const newId = makeId("pl");
    plIdMap[pl.id] = newId;
    const copy = {
      id: newId,
      equipmentId: eqIdMap[pl.equipmentId],
      originId: pl.id,
      followBefore: true,
      xMm: pl.xMm,
      yMm: pl.yMm,
      rotationDeg: pl.rotationDeg,
      labelOffsets: normalizeLabelOffsets(pl.labelOffsets)
    };
    if (pl.endXMm != null) {
      copy.endXMm = pl.endXMm;
    }
    if (pl.endYMm != null) {
      copy.endYMm = pl.endYMm;
    }
    return copy;
  }).filter((pl) => pl.equipmentId);
  const groups = (source.drawing.groups || []).map((group) => ({
    id: makeId("grp"),
    name: group.name,
    placementIds: (group.placementIds || []).map((id) => plIdMap[id]).filter(Boolean)
  })).filter((group) => group.placementIds.length >= 2);
  return {
    equipment: equipment,
    drawing: {
      view: "plan",
      placements: placements,
      groups: groups
    }
  };
}

function createAfterFromBefore(project) {
  project.pages.after = clonePageDeep(project.pages.before);
  return project.pages.after;
}

/**
 * ビフォアにあってアフターに未反映の設備だけを追記する。
 * アフター側の削除・追加・移動は残す（上書きしない）。
 * @returns {number} 追記した設備数
 */
function syncNewBeforeEquipmentToAfter(project) {
  if (!hasAfterPage(project)) {
    return 0;
  }
  seedAfterOriginLinksIfNeeded(project);
  const before = project.pages.before;
  const after = project.pages.after;
  const linkedOriginIds = new Set(
    after.equipment.map((eq) => eq.originId).filter(Boolean)
  );
  let added = 0;
  before.equipment.forEach((eq) => {
    if (linkedOriginIds.has(eq.id)) {
      return;
    }
    const copy = JSON.parse(JSON.stringify(eq));
    copy.id = makeId("eq");
    copy.originId = eq.id;
    after.equipment.push(copy);
    before.drawing.placements
      .filter((pl) => pl.equipmentId === eq.id)
      .forEach((pl) => {
        const afterPl = {
          id: makeId("pl"),
          equipmentId: copy.id,
          originId: pl.id,
          followBefore: true,
          xMm: pl.xMm,
          yMm: pl.yMm,
          rotationDeg: pl.rotationDeg,
          labelOffsets: normalizeLabelOffsets(pl.labelOffsets)
        };
        if (pl.endXMm != null) {
          afterPl.endXMm = pl.endXMm;
        }
        if (pl.endYMm != null) {
          afterPl.endYMm = pl.endYMm;
        }
        after.drawing.placements.push(afterPl);
      });
    linkedOriginIds.add(eq.id);
    added += 1;
  });
  return added;
}

/**
 * アフター配置がビフォアを映し出し中か。
 * followBefore === false はアフターで独自操作済み。
 * 未設定（旧データ）は、位置がビフォアと一致しているときだけ追従中とみなす。
 */
function placementFollowsBefore(afterPl, beforePl) {
  if (!afterPl) {
    return false;
  }
  if (afterPl.followBefore === false) {
    return false;
  }
  if (afterPl.followBefore === true) {
    return true;
  }
  if (!beforePl) {
    return true;
  }
  const sameStart = snapMm(afterPl.xMm) === snapMm(beforePl.xMm)
    && snapMm(afterPl.yMm) === snapMm(beforePl.yMm)
    && afterPl.rotationDeg === beforePl.rotationDeg;
  if (!sameStart) {
    return false;
  }
  const beforeEndX = beforePl.endXMm != null ? snapMm(beforePl.endXMm) : null;
  const beforeEndY = beforePl.endYMm != null ? snapMm(beforePl.endYMm) : null;
  const afterEndX = afterPl.endXMm != null ? snapMm(afterPl.endXMm) : null;
  const afterEndY = afterPl.endYMm != null ? snapMm(afterPl.endYMm) : null;
  return beforeEndX === afterEndX && beforeEndY === afterEndY;
}

/**
 * アフター側で動かした／寸法変更した配置を、ビフォア追従から外す。
 */
function detachAfterPlacements(placements) {
  if (!placements || !placements.length) {
    return;
  }
  placements.forEach((placement) => {
    if (placement) {
      placement.followBefore = false;
    }
  });
}

/**
 * ビフォア配置に対応するアフター配置を探す。欠けた originId は修復する。
 */
function findLinkedAfterPlacement(before, after, beforePl) {
  if (!before || !after || !beforePl) {
    return null;
  }
  let afterPl = after.drawing.placements.find((pl) => pl.originId === beforePl.id);
  if (afterPl) {
    return afterPl;
  }

  const beforeEq = before.equipment.find((eq) => eq.id === beforePl.equipmentId) || null;
  if (beforeEq) {
    const afterEq = after.equipment.find((eq) => eq.originId === beforeEq.id);
    if (afterEq) {
      afterPl = after.drawing.placements.find((pl) => pl.equipmentId === afterEq.id) || null;
      if (afterPl) {
        afterPl.originId = beforePl.id;
        return afterPl;
      }
    }
  }
  return null;
}

/**
 * ビフォアをアフターへ映し出す。
 * - 追従中の設備：位置・向き・寸法・名称をビフォアに合わせる
 * - アフターで動かした／寸法変更した設備：位置はそのまま残す（追従は外れたまま）
 * - ビフォアで増えた設備：追記
 * - ビフォアで消した設備：リンクのあるアフター設備も削除（追従／切り離し問わず）
 * - アフターだけで追加した設備（originIdなし）：そのまま残す
 * @returns {{ added: number, mirrored: number, removed: number }}
 */
function mirrorBeforeToAfter(project) {
  const empty = { added: 0, mirrored: 0, removed: 0 };
  if (!hasAfterPage(project)) {
    return empty;
  }
  seedAfterOriginLinksIfNeeded(project);
  const before = project.pages.before;
  const after = project.pages.after;
  const afterDoc = workDocFromProject(project, PAGE_AFTER);
  const added = syncNewBeforeEquipmentToAfter(project);

  let removed = 0;
  const beforeEqIds = new Set(before.equipment.map((eq) => eq.id));
  const orphanPlacements = after.drawing.placements.slice();
  orphanPlacements.forEach((afterPl) => {
    const afterEq = after.equipment.find((eq) => eq.id === afterPl.equipmentId);
    if (!afterEq || !afterEq.originId) {
      return;
    }
    if (beforeEqIds.has(afterEq.originId)) {
      return;
    }
    // ビフォア側が消えたリンク先は、アフターで切り離していても連動削除する
    removePair(afterDoc, afterPl.id);
    removed += 1;
  });

  let mirrored = 0;
  before.drawing.placements.forEach((beforePl) => {
    const afterPl = findLinkedAfterPlacement(before, after, beforePl);
    if (!afterPl || !placementFollowsBefore(afterPl, beforePl)) {
      return;
    }
    const beforeEq = before.equipment.find((eq) => eq.id === beforePl.equipmentId);
    const afterEq = after.equipment.find((eq) => eq.id === afterPl.equipmentId);
    if (!beforeEq || !afterEq) {
      return;
    }
    afterPl.xMm = beforePl.xMm;
    afterPl.yMm = beforePl.yMm;
    afterPl.rotationDeg = beforePl.rotationDeg;
    if (beforePl.endXMm != null || beforePl.endYMm != null) {
      afterPl.endXMm = beforePl.endXMm;
      afterPl.endYMm = beforePl.endYMm;
    }
    afterPl.followBefore = true;
    afterEq.name = beforeEq.name;
    afterEq.shape = beforeEq.shape;
    afterEq.dimensions = JSON.parse(JSON.stringify(beforeEq.dimensions));
    afterEq.elevation = JSON.parse(JSON.stringify(beforeEq.elevation));
    clampPlacementToSite(afterPl, afterEq, project.site);
    mirrored += 1;
  });

  return { added: added, mirrored: mirrored, removed: removed };
}

/**
 * 旧データ（originIdなし／欠け）のアフターに対応IDを付ける。
 * 設備に originId があっても配置側が欠けている場合は修復する。
 */
function seedAfterOriginLinksIfNeeded(project) {
  const before = project.pages.before;
  const after = project.pages.after;
  if (!before || !after) {
    return;
  }

  // 設備の originId から配置の originId を修復
  after.equipment.forEach((afterEq) => {
    if (!afterEq.originId) {
      return;
    }
    const beforeEq = before.equipment.find((eq) => eq.id === afterEq.originId);
    if (!beforeEq) {
      return;
    }
    const beforePl = before.drawing.placements.find((pl) => pl.equipmentId === beforeEq.id);
    const afterPl = after.drawing.placements.find((pl) => pl.equipmentId === afterEq.id);
    if (beforePl && afterPl && !afterPl.originId) {
      afterPl.originId = beforePl.id;
    }
    if (beforePl && afterPl && afterPl.followBefore == null) {
      afterPl.followBefore = placementFollowsBefore(afterPl, beforePl) ? true : false;
    }
  });

  const usedBeforeEq = new Set(
    after.equipment.map((eq) => eq.originId).filter(Boolean)
  );
  after.drawing.placements.forEach((afterPl) => {
    const afterEq = after.equipment.find((eq) => eq.id === afterPl.equipmentId);
    if (!afterEq || afterEq.originId) {
      return;
    }
    const matchPl = before.drawing.placements.find((beforePl) => {
      if (usedBeforeEq.has(beforePl.equipmentId)) {
        return false;
      }
      const beforeEq = before.equipment.find((eq) => eq.id === beforePl.equipmentId);
      if (!beforeEq || beforeEq.type !== afterEq.type) {
        return false;
      }
      return snapMm(beforePl.xMm) === snapMm(afterPl.xMm)
        && snapMm(beforePl.yMm) === snapMm(afterPl.yMm)
        && beforePl.rotationDeg === afterPl.rotationDeg;
    });
    if (!matchPl) {
      return;
    }
    afterEq.originId = matchPl.equipmentId;
    afterPl.originId = matchPl.id;
    usedBeforeEq.add(matchPl.equipmentId);
  });
}

function normalizePage(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const page = emptyPage();
  page.equipment = Array.isArray(raw.equipment)
    ? raw.equipment.map(normalizeEquipment).filter(Boolean)
    : [];
  page.drawing.placements = Array.isArray(raw.drawing && raw.drawing.placements)
    ? raw.drawing.placements.map(normalizePlacement).filter(Boolean)
    : [];
  const eqIds = new Set(page.equipment.map((item) => item.id));
  page.drawing.placements = page.drawing.placements.filter((item) => eqIds.has(item.equipmentId));
  const plIds = new Set(page.drawing.placements.map((item) => item.id));
  page.drawing.groups = Array.isArray(raw.drawing && raw.drawing.groups)
    ? raw.drawing.groups.map(normalizeGroup).filter(Boolean)
    : [];
  page.drawing.groups = page.drawing.groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      placementIds: group.placementIds.filter((id) => plIds.has(id))
    }))
    .filter((group) => group.placementIds.length >= 2);
  return page;
}

const DEFAULT_GROUP_NAME = "一式";

function createEquipment(type, values) {
  const def = equipmentTypeOf(type);
  const dims = normalizeDimensions(type, values);
  const equipment = {
    id: makeId("eq"),
    type: def.type,
    name: String(values.name || def.label).slice(0, 40),
    shape: values.shape || def.shape,
    dimensions: dims,
    // 側面図連携用。地盤面 = 0。地下はマイナス。
    elevation: buildElevation(type, dims)
  };
  return equipment;
}

function buildElevation(type, dims) {
  if (type === "pipe") {
    return {
      groundRefMm: 0,
      topMm: dims.diameterMm == null ? null : dims.diameterMm,
      bottomMm: 0,
      note: dims.diameterMm == null ? "太さ未確認" : ""
    };
  }
  if (type === "underground_tank") {
    const burial = dims.burialDepthMm;
    const diameter = dims.diameterMm;
    if (burial == null) {
      return {
        groundRefMm: 0,
        topMm: null,
        bottomMm: null,
        note: "埋設深さ未確認"
      };
    }
    const top = -burial;
    const bottom = diameter == null ? null : top - diameter;
    return {
      groundRefMm: 0,
      topMm: top,
      bottomMm: bottom,
      note: ""
    };
  }
  const height = dims.heightMm;
  return {
    groundRefMm: 0,
    topMm: height == null ? null : height,
    bottomMm: 0,
    note: height == null ? "高さ未確認" : ""
  };
}

function normalizeDimensions(type, values) {
  const def = equipmentTypeOf(type);
  const out = {};
  def.fields.forEach((field) => {
    out[field.key] = parseOptionalMm(values[field.key]);
  });
  if (type === "road") {
    // 平面: 長さ→X方向、幅→Y方向
    out.planWidthMm = out.lengthMm;
    out.planDepthMm = out.widthMm;
  } else if (type === "underground_tank") {
    const length = parseOptionalMm(values.lengthMm);
    const diameter = parseOptionalMm(values.diameterMm);
    out.lengthMm = length;
    out.diameterMm = diameter;
    out.burialDepthMm = parseOptionalMm(values.burialDepthMm);
    out.planWidthMm = length;
    out.planDepthMm = diameter;
  } else if (type === "bulk_2_9t" || type === "bulk_1t") {
    // 平面は真円（○）：直径×直径
    const diameter = parseOptionalMm(values.diameterMm);
    out.diameterMm = diameter;
    out.heightMm = parseOptionalMm(values.heightMm);
    out.planWidthMm = diameter;
    out.planDepthMm = diameter;
  } else if (type === "pipe") {
    out.diameterMm = parseOptionalMm(values.diameterMm);
    out.lengthMm = parseOptionalMm(values.lengthMm);
    out.planWidthMm = out.lengthMm;
    out.planDepthMm = out.diameterMm != null ? out.diameterMm : MOVE_STEP_MM;
  } else {
    out.planWidthMm = out.widthMm;
    out.planDepthMm = out.depthMm;
  }
  return out;
}

function roundMm(value) {
  return Math.round(finite(value, 0));
}

function pipeEndpoints(placement) {
  // 配置クリック時は方眼にスナップするが、長さ変更後の端点は連続座標のまま扱う。
  // ここで 100mm スナップし直すと、斜め配管の長さ変更が潰れる。
  const x1 = finite(placement.xMm, 0);
  const y1 = finite(placement.yMm, 0);
  const x2 = placement.endXMm != null ? finite(placement.endXMm, x1) : x1;
  const y2 = placement.endYMm != null ? finite(placement.endYMm, y1) : y1;
  return { x1: x1, y1: y1, x2: x2, y2: y2 };
}

function pipeLengthMm(placement) {
  const ends = pipeEndpoints(placement);
  return Math.max(0, Math.round(Math.hypot(ends.x2 - ends.x1, ends.y2 - ends.y1)));
}

function pipeBoundsMm(placement) {
  const ends = pipeEndpoints(placement);
  return {
    minX: Math.min(ends.x1, ends.x2),
    minY: Math.min(ends.y1, ends.y2),
    maxX: Math.max(ends.x1, ends.x2),
    maxY: Math.max(ends.y1, ends.y2)
  };
}

function syncPipeDimensions(equipment, placement) {
  if (!equipment || !isPipeType(equipment.type) || !placement) {
    return;
  }
  const length = pipeLengthMm(placement);
  const diameter = equipment.dimensions ? equipment.dimensions.diameterMm : null;
  equipment.dimensions = equipment.dimensions || {};
  equipment.dimensions.lengthMm = length;
  equipment.dimensions.diameterMm = diameter;
  equipment.dimensions.planWidthMm = Math.max(MOVE_STEP_MM, length);
  equipment.dimensions.planDepthMm = diameter != null ? diameter : MOVE_STEP_MM;
  equipment.elevation = buildElevation(equipment.type, equipment.dimensions);
}

/**
 * 始点と向きを保ったまま、配管長さを変更する（終点を動かす）。
 * 斜め配管でも指定長さになるよう、終点は方眼スナップしない。
 * @returns {{ ok: boolean, message?: string, truncated?: boolean }}
 */
function setPipeLengthMm(placement, equipment, lengthMm, site) {
  if (!placement || !equipment || !isPipeType(equipment.type)) {
    return { ok: false, message: "配管を選べませんでした。" };
  }
  const length = snapMm(lengthMm);
  if (length < MOVE_STEP_MM) {
    return { ok: false, message: "長さは " + formatMm(MOVE_STEP_MM) + " 以上にしてください。" };
  }
  const ends = pipeEndpoints(placement);
  let dx = ends.x2 - ends.x1;
  let dy = ends.y2 - ends.y1;
  const current = Math.hypot(dx, dy);
  let ux;
  let uy;
  if (current < 1) {
    ux = 1;
    uy = 0;
  } else {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    // ほぼ水平／垂直なら軸に揃える（微小な斜めズレで長さ変更が不安定になるのを防ぐ）
    if (ay < MOVE_STEP_MM && ax >= ay) {
      ux = dx >= 0 ? 1 : -1;
      uy = 0;
    } else if (ax < MOVE_STEP_MM && ay >= ax) {
      ux = 0;
      uy = dy >= 0 ? 1 : -1;
    } else {
      ux = dx / current;
      uy = dy / current;
    }
  }
  placement.xMm = ends.x1;
  placement.yMm = ends.y1;
  placement.endXMm = ends.x1 + ux * length;
  placement.endYMm = ends.y1 + uy * length;
  if (site) {
    clampPlacementToSite(placement, equipment, site);
  } else {
    syncPipeDimensions(equipment, placement);
  }
  const actual = pipeLengthMm(placement);
  if (actual < length - 1) {
    return {
      ok: true,
      truncated: true,
      message: "敷地の端まで伸ばしました（" + formatMm(actual) + "）。"
    };
  }
  return { ok: true };
}

function footprintOf(equipment, placement) {
  if (equipment && isPipeType(equipment.type) && placement) {
    const bounds = pipeBoundsMm(placement);
    return {
      widthMm: Math.max(MOVE_STEP_MM, bounds.maxX - bounds.minX),
      depthMm: Math.max(MOVE_STEP_MM, bounds.maxY - bounds.minY)
    };
  }
  const d = (equipment && equipment.dimensions) || {};
  let w = d.planWidthMm;
  let depth = d.planDepthMm;
  if (w == null) {
    w = d.widthMm != null ? d.widthMm : d.lengthMm;
  }
  if (depth == null) {
    depth = d.depthMm != null ? d.depthMm : d.diameterMm;
  }
  // 必須寸法が欠ける場合でも描画できるように最小プレースホルダは使わない。
  // 呼び出し側で配置前に必須チェックする。
  return {
    widthMm: w,
    depthMm: depth
  };
}

function createPlacement(equipmentId, xMm, yMm) {
  return {
    id: makeId("pl"),
    equipmentId: equipmentId,
    xMm: snapMm(xMm),
    yMm: snapMm(yMm),
    rotationDeg: 0,
    labelOffsets: emptyLabelOffsets()
  };
}

function createPipePlacement(equipmentId, x1Mm, y1Mm, x2Mm, y2Mm) {
  return {
    id: makeId("pl"),
    equipmentId: equipmentId,
    xMm: snapMm(x1Mm),
    yMm: snapMm(y1Mm),
    endXMm: snapMm(x2Mm),
    endYMm: snapMm(y2Mm),
    rotationDeg: 0,
    labelOffsets: emptyLabelOffsets()
  };
}

function emptyLabelOffsets() {
  return {};
}

function normalizeLabelOffsets(raw) {
  const out = emptyLabelOffsets();
  if (!raw || typeof raw !== "object") {
    return out;
  }
  ["name", "top", "side", "inner"].forEach((key) => {
    const item = raw[key];
    if (!item || typeof item !== "object") {
      return;
    }
    const dxMm = finite(item.dxMm, 0);
    const dyMm = finite(item.dyMm, 0);
    if (dxMm === 0 && dyMm === 0) {
      return;
    }
    out[key] = { dxMm: dxMm, dyMm: dyMm };
  });
  return out;
}

function ensureLabelOffsets(placement) {
  if (!placement.labelOffsets || typeof placement.labelOffsets !== "object") {
    placement.labelOffsets = emptyLabelOffsets();
  }
  return placement.labelOffsets;
}

function setLabelOffset(placement, key, dxMm, dyMm) {
  const offsets = ensureLabelOffsets(placement);
  if (!dxMm && !dyMm) {
    delete offsets[key];
    return;
  }
  offsets[key] = { dxMm: finite(dxMm, 0), dyMm: finite(dyMm, 0) };
}

function clearLabelOffsets(placement) {
  placement.labelOffsets = emptyLabelOffsets();
}

function findEquipment(doc, id) {
  return doc.equipment.find((item) => item.id === id) || null;
}

function findPlacement(doc, id) {
  return doc.drawing.placements.find((item) => item.id === id) || null;
}

function findPlacementByEquipment(doc, equipmentId) {
  return doc.drawing.placements.find((item) => item.equipmentId === equipmentId) || null;
}

function pairedItems(doc) {
  return doc.drawing.placements.map((placement) => ({
    placement: placement,
    equipment: findEquipment(doc, placement.equipmentId)
  })).filter((pair) => pair.equipment);
}

function contentBoundsMm(doc) {
  if (!doc) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  pairedItems(doc).forEach((pair) => {
    if (isPipeType(pair.equipment.type)) {
      const bounds = pipeBoundsMm(pair.placement);
      if (bounds.maxX === bounds.minX && bounds.maxY === bounds.minY) {
        return;
      }
      found = true;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
      return;
    }
    const fp = footprintOf(pair.equipment, pair.placement);
    const w = fp.widthMm || 0;
    const d = fp.depthMm || 0;
    if (w <= 0 || d <= 0) {
      return;
    }
    found = true;
    minX = Math.min(minX, pair.placement.xMm);
    minY = Math.min(minY, pair.placement.yMm);
    maxX = Math.max(maxX, pair.placement.xMm + w);
    maxY = Math.max(maxY, pair.placement.yMm + d);
  });
  if (!found) {
    return null;
  }
  // 余白を少し持たせる
  const pad = 1000;
  return {
    minX: Math.max(0, minX - pad),
    minY: Math.max(0, minY - pad),
    maxX: maxX + pad,
    maxY: maxY + pad
  };
}

function unionBoundsMm(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

function updateEquipmentDimensions(equipment, values) {
  const dims = normalizeDimensions(equipment.type, {
    ...flattenDims(equipment),
    ...values,
    name: values.name != null ? values.name : equipment.name
  });
  equipment.name = String(values.name != null ? values.name : equipment.name).slice(0, 40);
  if (values.shape) {
    equipment.shape = values.shape;
  }
  equipment.dimensions = dims;
  equipment.elevation = buildElevation(equipment.type, dims);
}

function flattenDims(equipment) {
  const d = equipment.dimensions || {};
  return {
    name: equipment.name,
    shape: equipment.shape,
    widthMm: d.widthMm,
    depthMm: d.depthMm,
    heightMm: d.heightMm,
    lengthMm: d.lengthMm,
    diameterMm: d.diameterMm,
    burialDepthMm: d.burialDepthMm
  };
}

function nudgePlacement(placement, dxMm, dyMm, site) {
  placement.xMm = clamp(snapMm(placement.xMm + dxMm), 0, site.widthMm);
  placement.yMm = clamp(snapMm(placement.yMm + dyMm), 0, site.depthMm);
}

function clipPipeEndToSite(x1, y1, x2, y2, site) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMax = 1;
  if (dx > 0) {
    tMax = Math.min(tMax, (site.widthMm - x1) / dx);
  } else if (dx < 0) {
    tMax = Math.min(tMax, (0 - x1) / dx);
  }
  if (dy > 0) {
    tMax = Math.min(tMax, (site.depthMm - y1) / dy);
  } else if (dy < 0) {
    tMax = Math.min(tMax, (0 - y1) / dy);
  }
  tMax = Math.max(0, Math.min(1, tMax));
  return { x: x1 + dx * tMax, y: y1 + dy * tMax };
}

function clampPlacementToSite(placement, equipment, site) {
  if (equipment && isPipeType(equipment.type)) {
    // 始点を敷地内へ。はみ出し分は終点も同じだけずらして長さを維持する。
    const x0 = finite(placement.xMm, 0);
    const y0 = finite(placement.yMm, 0);
    const endX0 = placement.endXMm != null ? finite(placement.endXMm, x0) : x0;
    const endY0 = placement.endYMm != null ? finite(placement.endYMm, y0) : y0;
    const x1 = clamp(x0, 0, site.widthMm);
    const y1 = clamp(y0, 0, site.depthMm);
    const shiftedEnd = { x: endX0 + (x1 - x0), y: endY0 + (y1 - y0) };
    // 終点がまだ外なら、向きを保ったまま敷地端まで縮める（軸別に切ると斜め長さが壊れる）
    const clipped = clipPipeEndToSite(x1, y1, shiftedEnd.x, shiftedEnd.y, site);
    placement.xMm = x1;
    placement.yMm = y1;
    placement.endXMm = clipped.x;
    placement.endYMm = clipped.y;
    syncPipeDimensions(equipment, placement);
    return;
  }
  const fp = footprintOf(equipment, placement);
  const w = fp.widthMm || 0;
  const d = fp.depthMm || 0;
  placement.xMm = clamp(snapMm(placement.xMm), 0, Math.max(0, site.widthMm - w));
  placement.yMm = clamp(snapMm(placement.yMm), 0, Math.max(0, site.depthMm - d));
}

/**
 * 選択中の配置を最前面または最背面へ移す。
 * 配列の後ろほど上に描画／優先選択される。
 * 選択同士の相対順は保つ。
 * @param {"front"|"back"} direction
 * @returns {boolean}
 */
function reorderPlacements(doc, placementIds, direction) {
  if (!doc || !doc.drawing || !Array.isArray(placementIds) || !placementIds.length) {
    return false;
  }
  const idSet = new Set(placementIds);
  const list = doc.drawing.placements;
  const moving = [];
  const staying = [];
  list.forEach((placement) => {
    if (idSet.has(placement.id)) {
      moving.push(placement);
    } else {
      staying.push(placement);
    }
  });
  if (!moving.length || moving.length === list.length) {
    return false;
  }
  doc.drawing.placements = direction === "back"
    ? moving.concat(staying)
    : staying.concat(moving);
  return true;
}

function removePair(doc, placementId) {
  const placement = findPlacement(doc, placementId);
  if (!placement) {
    return;
  }
  doc.drawing.placements = doc.drawing.placements.filter((item) => item.id !== placementId);
  doc.equipment = doc.equipment.filter((item) => item.id !== placement.equipmentId);
  detachPlacementFromGroups(doc, placementId);
}

function ensureGroups(doc) {
  if (!doc.drawing.groups) {
    doc.drawing.groups = [];
  }
  return doc.drawing.groups;
}

function findGroup(doc, groupId) {
  return ensureGroups(doc).find((item) => item.id === groupId) || null;
}

function findGroupByPlacement(doc, placementId) {
  return ensureGroups(doc).find((group) => (group.placementIds || []).includes(placementId)) || null;
}

function getGroupPlacements(doc, group) {
  if (!group) {
    return [];
  }
  return (group.placementIds || [])
    .map((id) => findPlacement(doc, id))
    .filter(Boolean);
}

function detachPlacementFromGroups(doc, placementId) {
  const groups = ensureGroups(doc);
  groups.forEach((group) => {
    group.placementIds = (group.placementIds || []).filter((id) => id !== placementId);
  });
  doc.drawing.groups = groups.filter((group) => (group.placementIds || []).length >= 2);
}

const COPY_OFFSET_MM = 1000;

/**
 * 選択中の配置をクリップボード用データにする。
 * @returns {{ items: Array, groups: Array } | null}
 */
function captureClipboard(doc, placementIds) {
  if (!doc || !placementIds || !placementIds.length) {
    return null;
  }
  const idSet = new Set(placementIds);
  const items = [];
  placementIds.forEach((placementId) => {
    const placement = findPlacement(doc, placementId);
    const equipment = placement ? findEquipment(doc, placement.equipmentId) : null;
    if (!placement || !equipment) {
      return;
    }
    items.push({
      equipment: JSON.parse(JSON.stringify({
        type: equipment.type,
        name: equipment.name,
        shape: equipment.shape,
        dimensions: equipment.dimensions || {},
        elevation: equipment.elevation || null
      })),
      placement: JSON.parse(JSON.stringify({
        xMm: placement.xMm,
        yMm: placement.yMm,
        endXMm: placement.endXMm,
        endYMm: placement.endYMm,
        rotationDeg: placement.rotationDeg || 0,
        labelOffsets: normalizeLabelOffsets(placement.labelOffsets)
      })),
      sourcePlacementId: placement.id
    });
  });
  if (!items.length) {
    return null;
  }
  const groups = (doc.drawing.groups || [])
    .filter((group) => (group.placementIds || []).every((id) => idSet.has(id))
      && (group.placementIds || []).length >= 2)
    .map((group) => ({
      name: group.name || DEFAULT_GROUP_NAME,
      sourcePlacementIds: group.placementIds.slice()
    }));
  return { items: items, groups: groups };
}

/**
 * クリップボード内容を図面へ貼り付ける。
 * @returns {{ placements: Array, count: number } | null}
 */
function pasteClipboardIntoDoc(doc, clipboard, pasteIndex) {
  if (!doc || !clipboard || !clipboard.items || !clipboard.items.length) {
    return null;
  }
  const step = Math.max(1, Math.round(Number(pasteIndex) || 1));
  const dx = COPY_OFFSET_MM * step;
  const dy = COPY_OFFSET_MM * step;
  const idMap = {};
  const newPlacements = [];
  clipboard.items.forEach((item) => {
    const srcEq = item.equipment || {};
    const srcPl = item.placement || {};
    const equipment = {
      id: makeId("eq"),
      type: srcEq.type,
      name: String(srcEq.name || equipmentTypeOf(srcEq.type).label).slice(0, 40),
      shape: srcEq.shape || equipmentTypeOf(srcEq.type).shape,
      dimensions: JSON.parse(JSON.stringify(srcEq.dimensions || {})),
      elevation: srcEq.elevation
        ? JSON.parse(JSON.stringify(srcEq.elevation))
        : buildElevation(srcEq.type, srcEq.dimensions || {})
    };
    const placement = {
      id: makeId("pl"),
      equipmentId: equipment.id,
      xMm: finite(srcPl.xMm, 0) + dx,
      yMm: finite(srcPl.yMm, 0) + dy,
      rotationDeg: [0, 90, 180, 270].includes(srcPl.rotationDeg) ? srcPl.rotationDeg : 0,
      labelOffsets: normalizeLabelOffsets(srcPl.labelOffsets)
    };
    if (srcPl.endXMm != null && Number.isFinite(Number(srcPl.endXMm))) {
      placement.endXMm = finite(srcPl.endXMm, placement.xMm) + dx;
    }
    if (srcPl.endYMm != null && Number.isFinite(Number(srcPl.endYMm))) {
      placement.endYMm = finite(srcPl.endYMm, placement.yMm) + dy;
    }
    if (isPipeType(equipment.type)) {
      syncPipeDimensions(equipment, placement);
    }
    doc.equipment.push(equipment);
    doc.drawing.placements.push(placement);
    newPlacements.push(placement);
    if (item.sourcePlacementId) {
      idMap[item.sourcePlacementId] = placement.id;
    }
  });
  // 相対位置を保ったまま、敷地内へまとめて収める
  movePlacementsBy(doc, newPlacements, 0, 0, doc.site);
  (clipboard.groups || []).forEach((group) => {
    const nextIds = (group.sourcePlacementIds || [])
      .map((id) => idMap[id])
      .filter(Boolean);
    if (nextIds.length >= 2) {
      createGroup(doc, nextIds, group.name || DEFAULT_GROUP_NAME);
    }
  });
  return { placements: newPlacements, count: newPlacements.length };
}

function createGroup(doc, placementIds, name) {
  const unique = Array.from(new Set(placementIds.filter((id) => findPlacement(doc, id))));
  if (unique.length < 2) {
    return null;
  }
  // 既存グループから外してから新しい一式へ
  unique.forEach((id) => detachPlacementFromGroups(doc, id));
  const group = {
    id: makeId("grp"),
    name: String(name || DEFAULT_GROUP_NAME).slice(0, 40),
    placementIds: unique
  };
  ensureGroups(doc).push(group);
  return group;
}

function ungroup(doc, groupId) {
  const groups = ensureGroups(doc);
  const before = groups.length;
  doc.drawing.groups = groups.filter((group) => group.id !== groupId);
  return doc.drawing.groups.length < before;
}

function groupBoundsMm(doc, placements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  placements.forEach((placement) => {
    const equipment = findEquipment(doc, placement.equipmentId);
    if (equipment && isPipeType(equipment.type)) {
      const bounds = pipeBoundsMm(placement);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
      return;
    }
    const fp = footprintOf(equipment || {}, placement);
    const w = fp.widthMm || 0;
    const d = fp.depthMm || 0;
    minX = Math.min(minX, placement.xMm);
    minY = Math.min(minY, placement.yMm);
    maxX = Math.max(maxX, placement.xMm + w);
    maxY = Math.max(maxY, placement.yMm + d);
  });
  if (!Number.isFinite(minX)) {
    return null;
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

function movePlacementsBy(doc, placements, dxMm, dyMm, site) {
  if (!placements.length) {
    return;
  }
  const bounds = groupBoundsMm(doc, placements);
  if (!bounds) {
    return;
  }
  let dx = snapMm(dxMm);
  let dy = snapMm(dyMm);
  const nextMinX = bounds.minX + dx;
  const nextMinY = bounds.minY + dy;
  const nextMaxX = bounds.maxX + dx;
  const nextMaxY = bounds.maxY + dy;
  if (nextMinX < 0) {
    dx -= nextMinX;
  }
  if (nextMinY < 0) {
    dy -= nextMinY;
  }
  if (nextMaxX > site.widthMm) {
    dx -= nextMaxX - site.widthMm;
  }
  if (nextMaxY > site.depthMm) {
    dy -= nextMaxY - site.depthMm;
  }
  dx = snapMm(dx);
  dy = snapMm(dy);
  placements.forEach((placement) => {
    const equipment = findEquipment(doc, placement.equipmentId);
    const isPipe = equipment && isPipeType(equipment.type);
    if (isPipe) {
      // 配管は両端を同じだけ動かして長さ・向きを保つ（個別スナップはしない）
      const x0 = finite(placement.xMm, 0);
      const y0 = finite(placement.yMm, 0);
      const endX = placement.endXMm != null ? finite(placement.endXMm, x0) : x0;
      const endY = placement.endYMm != null ? finite(placement.endYMm, y0) : y0;
      placement.xMm = x0 + dx;
      placement.yMm = y0 + dy;
      placement.endXMm = endX + dx;
      placement.endYMm = endY + dy;
      syncPipeDimensions(equipment, placement);
      return;
    }
    placement.xMm = snapMm(placement.xMm + dx);
    placement.yMm = snapMm(placement.yMm + dy);
    if (placement.endXMm != null || placement.endYMm != null) {
      placement.endXMm = snapMm((placement.endXMm != null ? placement.endXMm : placement.xMm) + dx);
      placement.endYMm = snapMm((placement.endYMm != null ? placement.endYMm : placement.yMm) + dy);
    }
  });
}

function normalizeGroup(raw) {
  if (!raw || !raw.id || !Array.isArray(raw.placementIds)) {
    return null;
  }
  const ids = raw.placementIds.map(String).filter(Boolean);
  if (ids.length < 2) {
    return null;
  }
  return {
    id: String(raw.id),
    name: String(raw.name || DEFAULT_GROUP_NAME).slice(0, 40),
    placementIds: Array.from(new Set(ids))
  };
}

function loadDocument() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      return { doc: emptyDocument(), warning: "" };
    }
    const data = JSON.parse(raw);
    if (!data || data.schema !== SCHEMA_ID) {
      return {
        doc: emptyDocument(),
        warning: "V2形式ではないデータだったため、新規図面を開きました。"
      };
    }
    return { doc: normalizeDocument(data), warning: "" };
  } catch (error) {
    return {
      doc: emptyDocument(),
      warning: "保存データを読めなかったため、新規図面を開きました。"
    };
  }
}

function saveDocument(doc) {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(doc));
    return { ok: true, message: "" };
  } catch (error) {
    return { ok: false, message: "ブラウザへの保存に失敗しました。" };
  }
}

function normalizeDocument(data) {
  const doc = emptyDocument();
  doc.version = 2;
  doc.meta = normalizeMeta(data && data.meta);
  doc.site.widthMm = SITE_WIDTH_MM;
  doc.site.depthMm = SITE_DEPTH_MM;
  doc.site.groundLevelMm = 0;

  if (data.pages && data.pages.before) {
    doc.pages.before = normalizePage(data.pages.before) || emptyPage();
    doc.pages.after = data.pages.after ? normalizePage(data.pages.after) : null;
  } else {
    // 旧形式（equipment / drawing 直下）→ ビフォアへ移行
    doc.pages.before = normalizePage({
      equipment: data.equipment,
      drawing: data.drawing
    }) || emptyPage();
    doc.pages.after = null;
  }

  const requested = data.activePage;
  if (requested === PAGE_COMPARE && hasAfterPage(doc)) {
    doc.activePage = PAGE_COMPARE;
  } else if (requested === PAGE_AFTER && hasAfterPage(doc)) {
    doc.activePage = PAGE_AFTER;
  } else {
    doc.activePage = PAGE_BEFORE;
  }
  return doc;
}

function normalizeEquipment(raw) {
  if (!raw || !raw.id || !raw.type) {
    return null;
  }
  const def = equipmentTypeOf(raw.type);
  const values = Object.assign({}, raw.dimensions || {}, {
    name: raw.name,
    shape: raw.shape || def.shape
  });
  const dims = normalizeDimensions(def.type, values);
  const equipment = {
    id: String(raw.id),
    type: def.type,
    name: String(raw.name || def.label).slice(0, 40),
    shape: raw.shape || def.shape,
    dimensions: dims,
    elevation: raw.elevation && typeof raw.elevation === "object"
      ? raw.elevation
      : buildElevation(def.type, dims)
  };
  if (raw.originId) {
    equipment.originId = String(raw.originId);
  }
  return equipment;
}

function normalizePlacement(raw) {
  if (!raw || !raw.id || !raw.equipmentId) {
    return null;
  }
  const placement = {
    id: String(raw.id),
    equipmentId: String(raw.equipmentId),
    xMm: snapMm(finite(raw.xMm, 0)),
    yMm: snapMm(finite(raw.yMm, 0)),
    rotationDeg: [0, 90, 180, 270].includes(raw.rotationDeg) ? raw.rotationDeg : 0,
    labelOffsets: normalizeLabelOffsets(raw.labelOffsets)
  };
  if (raw.endXMm != null && Number.isFinite(Number(raw.endXMm))) {
    placement.endXMm = roundMm(raw.endXMm);
  }
  if (raw.endYMm != null && Number.isFinite(Number(raw.endYMm))) {
    placement.endYMm = roundMm(raw.endYMm);
  }
  if (raw.originId) {
    placement.originId = String(raw.originId);
  }
  if (raw.followBefore === false) {
    placement.followBefore = false;
  } else if (raw.followBefore === true) {
    placement.followBefore = true;
  }
  return placement;
}

function parseOptionalMm(value) {
  if (value === "" || value == null) {
    return null;
  }
  // 配管の「25A」など、末尾の A が混ざっても数字だけ取る
  const cleaned = String(value).replace(/,/g, "").replace(/\s*A\s*$/i, "").trim();
  const number = Number(cleaned);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.round(number);
}

function snapMm(value) {
  return Math.round(finite(value, 0) / MOVE_STEP_MM) * MOVE_STEP_MM;
}

function formatMm(value) {
  if (value == null || !Number.isFinite(value)) {
    return "未確認";
  }
  return Number(value).toLocaleString("ja-JP") + "mm";
}

function makeId(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function requiredDimsPresent(type, values) {
  const def = equipmentTypeOf(type);
  const missing = [];
  def.fields.forEach((field) => {
    if (!field.required) {
      return;
    }
    const parsed = parseOptionalMm(values[field.key]);
    if (parsed == null || parsed <= 0) {
      missing.push(field.label);
    }
  });
  return missing;
}
