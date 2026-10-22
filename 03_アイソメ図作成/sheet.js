(function (root) {
  const COS = Math.cos(Math.PI / 6);
  const SIN = Math.sin(Math.PI / 6);
  const MIN_SCALE = 8;
  const MAX_SCALE = 160;

  const SYMBOLS = {
    regulator: "調整器",
    gauge: "圧力計",
    valve: "バルブ",
    flange: "フランジ",
    flex: "フレキ",
    start: "スタート",
    goal: "ゴール"
  };
  const FACE_DIRS = ["nw", "ne", "sw", "se"];

  const DIRECTIONS = {
    up: { id: "up", arrow: "↑", name: "上", di: 1, dj: 1 },
    down: { id: "down", arrow: "↓", name: "下", di: -1, dj: -1 },
    ne: { id: "ne", arrow: "↗", name: "奥", di: 1, dj: 0 },
    sw: { id: "sw", arrow: "↙", name: "手前", di: -1, dj: 0 },
    nw: { id: "nw", arrow: "↖", name: "左", di: 0, dj: 1 },
    se: { id: "se", arrow: "↘", name: "右", di: 0, dj: -1 }
  };

  function world(i, j) {
    return { x: (i - j) * COS, y: -(i + j) * SIN };
  }

  function latticeFromWorld(x, y) {
    const i = (x / COS - y / SIN) / 2;
    const j = (-y / SIN - x / COS) / 2;
    return { i: Math.round(i), j: Math.round(j) };
  }

  function step(i, j, dirId) {
    const dir = DIRECTIONS[dirId];
    return { i: i + dir.di, j: j + dir.dj };
  }

  const api = { world, latticeFromWorld, step, DIRECTIONS, COS, SIN };

  function boot() {
    const canvas = document.getElementById("sheet");
    const ctx = canvas.getContext("2d");
    const status = document.getElementById("status");
    const titleInput = document.getElementById("titleInput");
    const nameInput = document.getElementById("nameInput");
    const dateInput = document.getElementById("dateInput");
    const dateText = document.getElementById("dateText");
    const lengthInput = document.getElementById("lengthInput");
    const lengthMark = document.getElementById("lengthMark");
    const diameterInput = document.getElementById("diameterInput");
    const diameterMark = document.getElementById("diameterMark");
    const commentInput = document.getElementById("commentInput");
    let referenceMeters = null;
    let referenceSegmentIds = [];
    let doubled = 0;
    let referenceDiameter = "";
    let diameterOverrides = [];
    let lengthOverrides = [];
    let nodes = [];
    let segments = [];
    let symbols = [];
    let comments = [];
    let crossings = [];
    let labelShifts = new Map();
    let active = { i: 0, j: 0 };
    let selectedSegmentId = null;
    let selectedSymbolId = null;
    let selectedCommentId = null;
    let commentMode = false;
    let commentDraft = null;
    let moveMode = false;
    let movingSegmentIds = new Set();
    let rangeMode = false;
    let rangeStart = null;
    let rangeEnd = null;
    let rangeSegmentIds = new Set();
    let symbolDrag = null;
    let startKind = "pipe";
    let goalKind = "pipe";
    let hint = "";
    let scale = 56;
    let panX = 0;
    let panY = 0;
    let centered = false;
    let seq = 1;
    const undoStack = [];
    const redoStack = [];

    function uid() {
      seq += 1;
      return "n" + seq;
    }

    function nodeById(id) {
      return nodes.find((node) => node.id === id) || null;
    }

    function nodeAt(i, j) {
      return nodes.find((node) => node.i === i && node.j === j) || null;
    }

    function edgeBetween(aId, bId) {
      return segments.find((segment) =>
        (segment.fromId === aId && segment.toId === bId) ||
        (segment.fromId === bId && segment.toId === aId)
      ) || null;
    }

    function snapshot() {
      return JSON.stringify({
        nodes,
        segments,
        symbols,
        comments,
        active,
        selectedSegmentId,
        selectedSymbolId,
        selectedCommentId,
        commentMode,
        moveMode,
        movingSegmentIds: [...movingSegmentIds],
        rangeMode,
        rangeStart,
        rangeEnd,
        rangeSegmentIds: [...rangeSegmentIds],
        referenceMeters,
        referenceSegmentIds: [...referenceSegmentIds],
        referenceDiameter,
        diameterOverrides: diameterOverrides.map((item) => ({
          segmentIds: [...item.segmentIds],
          diameter: item.diameter
        })),
        lengthOverrides: lengthOverrides.map((item) => ({
          segmentIds: [...item.segmentIds],
          meters: item.meters
        })),
        crossings: crossings.map((item) => ({ nodeId: item.nodeId, frontAxis: item.frontAxis })),
        doubled
      });
    }

    function restore(raw) {
      const data = JSON.parse(raw);
      nodes = data.nodes;
      segments = data.segments;
      symbols = data.symbols || [];
      comments = loadComments(data.comments);
      active = data.active;
      selectedSegmentId = data.selectedSegmentId || null;
      selectedSymbolId = data.selectedSymbolId || null;
      selectedCommentId = data.selectedCommentId || null;
      commentMode = !!data.commentMode;
      commentDraft = null;
      moveMode = !!data.moveMode;
      movingSegmentIds = new Set(data.movingSegmentIds || []);
      rangeMode = !!data.rangeMode;
      rangeStart = data.rangeStart || null;
      rangeEnd = data.rangeEnd || null;
      rangeSegmentIds = new Set(data.rangeSegmentIds || []);
      const meters = Number(data.referenceMeters);
      referenceMeters = Number.isFinite(meters) && meters > 0 ? meters : null;
      referenceSegmentIds = Array.isArray(data.referenceSegmentIds) ? data.referenceSegmentIds.map(String) : [];
      referenceDiameter = cleanDiameter(data.referenceDiameter);
      diameterOverrides = loadDiameterOverrides(data.diameterOverrides);
      lengthOverrides = loadLengthOverrides(data.lengthOverrides);
      crossings = loadCrossings(data.crossings);
      doubled = Math.max(0, Math.floor(Number(data.doubled) || 0));
    }

    function cleanText(value, limit) {
      return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
    }

    function loadComments(value) {
      const known = new Set(segments.map((segment) => segment.id));
      return (Array.isArray(value) ? value : []).map((item) => {
        const text = cleanText(item && item.text, 40);
        if (!item || !item.id || !text) return null;
        const segmentId = item.segmentId && known.has(String(item.segmentId)) ? String(item.segmentId) : "";
        const x = Number(item.x);
        const y = Number(item.y);
        if (!segmentId && !(Number.isFinite(x) && Number.isFinite(y))) return null;
        const dx = Number(item.dx);
        const dy = Number(item.dy);
        return {
          id: String(item.id),
          text,
          segmentId,
          t: Math.min(0.85, Math.max(0.15, Number(item.t) || 0.5)),
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          dx: Number.isFinite(dx) ? dx : 0.35,
          dy: Number.isFinite(dy) ? dy : -0.7
        };
      }).filter(Boolean);
    }

    function commentAnchorWorld(comment) {
      if (!comment) return null;
      if (comment.segmentId) {
        const segment = segments.find((item) => item.id === comment.segmentId);
        if (!segment) return null;
        const from = nodeById(segment.fromId);
        const to = nodeById(segment.toId);
        if (!from || !to) return null;
        const a = world(from.i, from.j);
        const b = world(to.i, to.j);
        return {
          x: a.x + (b.x - a.x) * comment.t,
          y: a.y + (b.y - a.y) * comment.t
        };
      }
      if (!Number.isFinite(comment.x) || !Number.isFinite(comment.y)) return null;
      return { x: comment.x, y: comment.y };
    }

    function commentWorldPoints() {
      const points = [];
      comments.forEach((comment) => {
        const anchor = commentAnchorWorld(comment);
        if (!anchor) return;
        points.push(anchor);
        points.push({ x: anchor.x + comment.dx, y: anchor.y + comment.dy });
      });
      return points;
    }

    function commentTextOf(comment) {
      if (!comment) return "";
      const editing = comment === commentDraft || comment.id === selectedCommentId;
      if (editing && document.activeElement === commentInput) return cleanText(commentInput.value, 40);
      return comment.text || "";
    }

    function drawComments(pen, mapWorld, fontSize, shifts) {
      const items = comments.slice();
      if (commentDraft) items.push(commentDraft);
      items.forEach((comment) => {
        const anchor = commentAnchorWorld(comment);
        if (!anchor) return;
        const at = mapWorld(anchor.x, anchor.y);
        const label = mapWorld(anchor.x + comment.dx, anchor.y + comment.dy);
        const shift = (shifts && shifts.get(comment.id || "draft")) || { dx: 0, dy: 0 };
        label.x += shift.dx;
        label.y += shift.dy;
        const text = commentTextOf(comment);
        const selected = comment === commentDraft || comment.id === selectedCommentId;
        pen.save();
        pen.lineJoin = "round";
        pen.lineCap = "round";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.font = "700 " + fontSize + "px sans-serif";
        const textWidth = text ? pen.measureText(text).width : fontSize;
        const halfW = textWidth / 2 + fontSize * 0.2;
        const halfH = fontSize * 0.62;
        const dx = label.x - at.x;
        const dy = label.y - at.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const edge = Math.min(halfW / Math.max(Math.abs(ux), 0.001), halfH / Math.max(Math.abs(uy), 0.001));
        pen.strokeStyle = selected ? "#0b57d0" : "#5c6b76";
        pen.fillStyle = selected ? "#0b57d0" : "#1c1c1c";
        pen.lineWidth = Math.max(1.2, fontSize * 0.07);
        if (length > edge + 4) {
          pen.beginPath();
          pen.moveTo(at.x, at.y);
          pen.lineTo(label.x - ux * edge, label.y - uy * edge);
          pen.stroke();
        }
        pen.beginPath();
        pen.arc(at.x, at.y, Math.max(2.2, fontSize * 0.12), 0, Math.PI * 2);
        pen.fill();
        if (text) {
          pen.lineWidth = Math.max(3, fontSize * 0.28);
          pen.strokeStyle = "#ffffff";
          pen.fillStyle = selected ? "#0b57d0" : "#1c1c1c";
          pen.strokeText(text, label.x, label.y);
          pen.fillText(text, label.x, label.y);
        }
        pen.restore();
      });
    }

    function readingOf(dx, dy) {
      const span = Math.hypot(dx, dy) || 1;
      let vx = dx / span;
      let vy = dy / span;
      if (vx < -1e-6 || (Math.abs(vx) <= 1e-6 && vy > 0)) {
        vx = -vx;
        vy = -vy;
      }
      return { vx, vy, angle: Math.atan2(vy, vx) };
    }

    function runLabelLayout(pen, run, ax, ay, bx, by, fontSize, clearance) {
      const text = formatMeters(lengthOf(run));
      if (!text) return null;
      const reading = readingOf(bx - ax, by - ay);
      const reference = isReferenceRun(run);
      const lengthCorrected = isLengthCorrected(run);
      const markText = reference ? "基準" : lengthCorrected ? "修正" : "";
      const diameter = diameterOf(run);
      const diameterText = diameter ? formatDiameter(diameter) : "";
      const corrected = Boolean(diameterText) && isCorrectedRun(run);
      const markSize = Math.max(10, Math.round(fontSize * 0.72));
      const diameterSize = Math.max(10, Math.round(fontSize * 0.85));
      const noteSize = Math.max(9, Math.round(fontSize * 0.62));
      pen.save();
      pen.font = "700 " + fontSize + "px sans-serif";
      const numberWidth = pen.measureText(text).width;
      pen.font = "700 " + markSize + "px sans-serif";
      const markWidth = markText ? pen.measureText(markText).width : 0;
      pen.font = "700 " + diameterSize + "px sans-serif";
      const diameterWidth = diameterText ? pen.measureText(diameterText).width : 0;
      pen.font = "700 " + noteSize + "px sans-serif";
      const noteWidth = corrected ? pen.measureText("修正").width : 0;
      pen.restore();
      const gap = markText ? fontSize * 0.28 : 0;
      const noteGap = corrected ? fontSize * 0.2 : 0;
      const total = numberWidth + gap + markWidth;
      const block = diameterWidth + noteGap + noteWidth;
      const side = Math.max(fontSize * 0.95, (clearance || 0) + fontSize * 0.55);
      const left = -total / 2;
      const diameterX = left + numberWidth / 2 - block / 2;
      const diameterY = side + fontSize * 1.15;
      const corners = [
        { x: left, y: side - fontSize * 0.7 },
        { x: left + total, y: side - fontSize * 0.7 },
        { x: left, y: side + fontSize * 0.7 },
        { x: left + total, y: side + fontSize * 0.7 }
      ];
      if (diameterText) {
        corners.push(
          { x: diameterX, y: diameterY - diameterSize * 0.7 },
          { x: diameterX + block, y: diameterY - diameterSize * 0.7 },
          { x: diameterX, y: diameterY + diameterSize * 0.75 },
          { x: diameterX + block, y: diameterY + diameterSize * 0.75 }
        );
      }
      const cos = Math.cos(reading.angle);
      const sin = Math.sin(reading.angle);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      corners.forEach((corner) => {
        const x = mx + corner.x * cos - corner.y * sin;
        const y = my + corner.x * sin + corner.y * cos;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      return {
        text,
        reference,
        lengthCorrected,
        markText,
        fontSize,
        numberWidth,
        markSize,
        gap,
        left,
        side,
        diameterText,
        corrected,
        diameterSize,
        noteSize,
        noteGap,
        diameterWidth,
        diameterX,
        diameterY,
        reading,
        mx,
        my,
        box: {
          key: run.segments[0].id,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          originX: (minX + maxX) / 2,
          originY: (minY + maxY) / 2,
          w: Math.max(maxX - minX, fontSize),
          h: Math.max(maxY - minY, fontSize),
          priority: reference ? 0 : 1,
          alongX: reading.vx,
          alongY: reading.vy
        }
      };
    }

    function paintRunLabel(pen, layout, shift) {
      const dx = shift ? shift.dx : 0;
      const dy = shift ? shift.dy : 0;
      pen.save();
      pen.translate(layout.mx + dx, layout.my + dy);
      pen.rotate(layout.reading.angle);
      pen.textBaseline = "middle";
      pen.textAlign = "left";
      pen.lineJoin = "round";
      pen.strokeStyle = "#ffffff";
      pen.fillStyle = layout.lengthCorrected ? "#0b57d0" : "#1c1c1c";
      pen.font = "700 " + layout.fontSize + "px sans-serif";
      pen.lineWidth = Math.max(3, layout.fontSize * 0.28);
      pen.strokeText(layout.text, layout.left, layout.side);
      pen.fillText(layout.text, layout.left, layout.side);
      if (layout.markText) {
        pen.fillStyle = layout.lengthCorrected ? "#0b57d0" : "#1c1c1c";
        pen.lineWidth = Math.max(2, layout.markSize * 0.22);
        pen.font = "700 " + layout.markSize + "px sans-serif";
        pen.strokeText(layout.markText, layout.left + layout.numberWidth + layout.gap, layout.side);
        pen.fillText(layout.markText, layout.left + layout.numberWidth + layout.gap, layout.side);
      }
      if (layout.diameterText) {
        pen.font = "700 " + layout.diameterSize + "px sans-serif";
        pen.lineWidth = Math.max(2, layout.diameterSize * 0.22);
        pen.fillStyle = layout.corrected ? "#0b57d0" : "#1c1c1c";
        pen.strokeText(layout.diameterText, layout.diameterX, layout.diameterY);
        pen.fillText(layout.diameterText, layout.diameterX, layout.diameterY);
        if (layout.corrected) {
          pen.font = "700 " + layout.noteSize + "px sans-serif";
          pen.lineWidth = Math.max(2, layout.noteSize * 0.22);
          pen.strokeText("修正", layout.diameterX + layout.diameterWidth + layout.noteGap, layout.diameterY);
          pen.fillText("修正", layout.diameterX + layout.diameterWidth + layout.noteGap, layout.diameterY);
        }
      }
      pen.restore();
    }

    function slideAlong(mover, other, pad, nudge) {
      const axisX = mover.alongX;
      const axisY = mover.alongY;
      const halfW = (mover.w + other.w) / 2 + pad;
      const halfH = (mover.h + other.h) / 2 + pad;
      const relX = mover.cx - other.cx;
      const relY = mover.cy - other.cy;
      const candidates = [];
      if (Math.abs(axisX) > 1e-6) {
        candidates.push((halfW - relX) / axisX, (-halfW - relX) / axisX);
      }
      if (Math.abs(axisY) > 1e-6) {
        candidates.push((halfH - relY) / axisY, (-halfH - relY) / axisY);
      }
      let best = null;
      const bump = nudge || 4;
      candidates.forEach((t) => {
        if (!Number.isFinite(t) || t === 0) return;
        const nx = Math.abs(relX + axisX * t);
        const ny = Math.abs(relY + axisY * t);
        if (nx < halfW - 0.01 && ny < halfH - 0.01) return;
        const nudged = t + Math.sign(t) * bump;
        const dist = Math.abs(nudged);
        if (!best || dist < best.dist - 0.01 || (Math.abs(dist - best.dist) <= 0.01 && t > 0)) {
          best = { dist, x: axisX * nudged, y: axisY * nudged };
        }
      });
      return best;
    }

    function slidePerpendicular(mover, other, pad, nudge) {
      const axisX = -mover.alongY;
      const axisY = mover.alongX;
      if (Math.abs(axisX) < 1e-6 && Math.abs(axisY) < 1e-6) return null;
      const halfW = (mover.w + other.w) / 2 + pad;
      const halfH = (mover.h + other.h) / 2 + pad;
      const relX = mover.cx - other.cx;
      const relY = mover.cy - other.cy;
      const candidates = [];
      if (Math.abs(axisX) > 1e-6) {
        candidates.push((halfW - relX) / axisX, (-halfW - relX) / axisX);
      }
      if (Math.abs(axisY) > 1e-6) {
        candidates.push((halfH - relY) / axisY, (-halfH - relY) / axisY);
      }
      let best = null;
      const bump = nudge || 4;
      candidates.forEach((t) => {
        if (!Number.isFinite(t) || t === 0) return;
        const nx = Math.abs(relX + axisX * t);
        const ny = Math.abs(relY + axisY * t);
        if (nx < halfW - 0.01 && ny < halfH - 0.01) return;
        const nudged = t + Math.sign(t) * bump;
        const dist = Math.abs(nudged);
        if (!best || dist < best.dist - 0.01 || (Math.abs(dist - best.dist) <= 0.01 && t > 0)) {
          best = { dist, x: axisX * nudged, y: axisY * nudged };
        }
      });
      return best;
    }

    function separateLabelBoxes(boxes, options) {
      const pad = (options && options.pad) || 12;
      const passes = (options && options.passes) || 24;
      const nudge = (options && options.nudge) || 4;
      const allowPerpendicular = Boolean(options && options.allowPerpendicular);
      for (let pass = 0; pass < passes; pass += 1) {
        let moved = false;
        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const a = boxes[i];
            const b = boxes[j];
            const overlapX = (a.w + b.w) / 2 + pad - Math.abs(a.cx - b.cx);
            const overlapY = (a.h + b.h) / 2 + pad - Math.abs(a.cy - b.cy);
            if (overlapX <= 0 || overlapY <= 0) continue;
            const mover = a.priority > b.priority ? a : b;
            const other = mover === a ? b : a;
            if (mover.alongX != null) {
              const step = slideAlong(mover, other, pad, nudge);
              if (step) {
                mover.cx += step.x;
                mover.cy += step.y;
                moved = true;
              } else if (allowPerpendicular) {
                const cross = slidePerpendicular(mover, other, pad, nudge);
                if (cross) {
                  mover.cx += cross.x;
                  mover.cy += cross.y;
                  moved = true;
                }
              }
              continue;
            }
            let vx = mover.cx - other.cx;
            let vy = mover.cy - other.cy;
            const escapeX = mover.cx - mover.originX + (mover.preferX || 0);
            const escapeY = mover.cy - mover.originY + (mover.preferY || 0);
            if (Math.hypot(vx, vy) < 1 || vx * escapeX + vy * escapeY < 0) {
              vx = escapeX;
              vy = escapeY;
            }
            if (Math.hypot(vx, vy) < 0.001) {
              vx = mover.preferX || 0;
              vy = mover.preferY || -1;
            }
            const length = Math.hypot(vx, vy) || 1;
            vx /= length;
            vy /= length;
            const needX = overlapX / Math.max(Math.abs(vx), 0.35);
            const needY = overlapY / Math.max(Math.abs(vy), 0.35);
            const step = Math.min(needX, needY) + nudge;
            mover.cx += vx * step;
            mover.cy += vy * step;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }

    function sheetLabelShifts(pen, pointOf, mapWorld, lengthFont, commentFont, clearance, options) {
      const boxes = [];
      if (referenceRun()) {
        straightRuns().forEach((run) => {
          const a = pointOf(run.a.i, run.a.j);
          const b = pointOf(run.b.i, run.b.j);
          const layout = runLabelLayout(pen, run, a.x, a.y, b.x, b.y, lengthFont, clearance);
          if (layout) boxes.push(layout.box);
        });
      }
      const items = comments.slice();
      if (commentDraft) items.push(commentDraft);
      items.forEach((comment) => {
        const anchor = commentAnchorWorld(comment);
        if (!anchor) return;
        const label = mapWorld(anchor.x + comment.dx, anchor.y + comment.dy);
        const at = mapWorld(anchor.x, anchor.y);
        const text = commentTextOf(comment);
        pen.save();
        pen.font = "700 " + commentFont + "px sans-serif";
        const textWidth = text ? pen.measureText(text).width : commentFont;
        pen.restore();
        boxes.push({
          key: comment.id || "draft",
          cx: label.x,
          cy: label.y,
          originX: label.x,
          originY: label.y,
          w: textWidth + commentFont * 0.5,
          h: commentFont * 1.45,
          priority: 2,
          preferX: label.x - at.x,
          preferY: label.y - at.y
        });
      });
      separateLabelBoxes(boxes, options);
      const shifts = new Map();
      boxes.forEach((box) => {
        shifts.set(box.key, { dx: box.cx - box.originX, dy: box.cy - box.originY });
      });
      return shifts;
    }

    function hitComment(point) {
      const mapWorld = (x, y) => ({ x: x * scale + panX, y: y * scale + panY });
      let best = null;
      comments.forEach((comment) => {
        const anchor = commentAnchorWorld(comment);
        if (!anchor) return;
        const label = mapWorld(anchor.x + comment.dx, anchor.y + comment.dy);
        const shift = labelShifts.get(comment.id) || { dx: 0, dy: 0 };
        label.x += shift.dx;
        label.y += shift.dy;
        ctx.save();
        ctx.font = "700 13px sans-serif";
        const width = ctx.measureText(comment.text).width;
        ctx.restore();
        const dx = point.x - label.x;
        const dy = point.y - label.y;
        if (Math.abs(dx) <= width / 2 + 8 && Math.abs(dy) <= 12) {
          const dist = Math.hypot(dx, dy);
          if (!best || dist < best.dist) best = { id: comment.id, dist };
        }
      });
      return best;
    }

    function cleanDiameter(value) {
      const text = String(value || "").trim().replace(/,/g, "").replace(/a$/i, "");
      if (!/^\d+(?:\.\d+)?$/.test(text)) return "";
      const number = Number(text);
      if (!Number.isFinite(number) || number <= 0) return "";
      if (Math.abs(number - Math.round(number)) < 0.001) return String(Math.round(number));
      return String(Math.round(number * 100) / 100);
    }

    function formatDiameter(value) {
      return value ? value + "A" : "";
    }

    function loadDiameterOverrides(value) {
      const known = new Set(segments.map((segment) => segment.id));
      return (Array.isArray(value) ? value : []).map((item) => {
        const segmentIds = Array.isArray(item && item.segmentIds)
          ? item.segmentIds.map(String).filter((id) => known.has(id))
          : [];
        const diameter = cleanDiameter(item && item.diameter);
        return segmentIds.length && diameter ? { segmentIds, diameter } : null;
      }).filter(Boolean);
    }

    function bindOverridesToRuns() {
      const runs = straightRuns();
      const claimed = new Set();
      diameterOverrides = diameterOverrides.map((item) => {
        const run = runs.find((candidate) => !claimed.has(candidate) && candidate.segments.some((segment) => item.segmentIds.includes(segment.id)));
        if (!run || item.diameter === referenceDiameter) return null;
        claimed.add(run);
        return {
          segmentIds: run.segments.map((segment) => segment.id),
          diameter: item.diameter
        };
      }).filter(Boolean);
    }

    function overrideFor(run) {
      if (!run || isReferenceRun(run)) return null;
      const ids = new Set(run.segments.map((segment) => segment.id));
      return diameterOverrides.find((item) => item.segmentIds.some((id) => ids.has(id))) || null;
    }

    function diameterOf(run) {
      if (!run) return "";
      const override = overrideFor(run);
      return override ? override.diameter : referenceDiameter;
    }

    function isCorrectedRun(run) {
      const override = overrideFor(run);
      return !!(override && override.diameter !== referenceDiameter);
    }

    function loadLengthOverrides(value) {
      const known = new Set(segments.map((segment) => segment.id));
      return (Array.isArray(value) ? value : []).map((item) => {
        const segmentIds = Array.isArray(item && item.segmentIds)
          ? item.segmentIds.map(String).filter((id) => known.has(id))
          : [];
        const meters = Number(item && item.meters);
        return segmentIds.length && Number.isFinite(meters) && meters > 0 ? { segmentIds, meters } : null;
      }).filter(Boolean);
    }

    function scaledLength(run) {
      const ref = referenceRun();
      if (!run || !ref) return 0;
      if (isReferenceRun(run)) return referenceMeters;
      return referenceMeters * run.cells / ref.cells;
    }

    function lengthOverrideFor(run) {
      if (!run || isReferenceRun(run)) return null;
      const ids = new Set(run.segments.map((segment) => segment.id));
      return lengthOverrides.find((item) => item.segmentIds.some((id) => ids.has(id))) || null;
    }

    function bindLengthOverrides() {
      const runs = straightRuns();
      const claimed = new Set();
      lengthOverrides = lengthOverrides.map((item) => {
        const run = runs.find((candidate) => !claimed.has(candidate) && candidate.segments.some((segment) => item.segmentIds.includes(segment.id)));
        if (!run || isReferenceRun(run)) return null;
        const scaled = scaledLength(run);
        if (scaled && lengthNumber(item.meters) === lengthNumber(scaled)) return null;
        claimed.add(run);
        return {
          segmentIds: run.segments.map((segment) => segment.id),
          meters: item.meters
        };
      }).filter(Boolean);
    }

    function isLengthCorrected(run) {
      return !!lengthOverrideFor(run);
    }

    function sheetInfo() {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value) ? dateInput.value : "";
      return {
        title: cleanText(titleInput.value, 60),
        name: cleanText(nameInput.value, 40),
        date: date
      };
    }

    function formatSheetDate(iso) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!match) return "";
      return Number(match[1]) + "年" + Number(match[2]) + "月" + Number(match[3]) + "日";
    }

    function formatDateField(iso) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      return match ? match[1] + "/" + match[2] + "/" + match[3] : "";
    }

    function parseDateField(text) {
      const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(String(text || "").trim());
      if (!match) return "";
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return "";
      const pad = (value) => String(value).padStart(2, "0");
      return year + "-" + pad(month) + "-" + pad(day);
    }

    function setInfo(info) {
      const next = info || {};
      const title = cleanText(next.title, 60);
      const name = cleanText(next.name, 40);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(next.date || "")) ? String(next.date) : "";
      if (document.activeElement !== titleInput) titleInput.value = title;
      if (document.activeElement !== nameInput) nameInput.value = name;
      if (document.activeElement !== dateInput && document.activeElement !== dateText) {
        dateInput.value = date;
        dateText.value = formatDateField(date);
      }
    }

    function infoLines() {
      const info = sheetInfo();
      const lines = [];
      if (info.date) lines.push({ label: "日付", value: formatSheetDate(info.date) });
      if (info.title) lines.push({ label: "タイトル", value: info.title });
      if (info.name) lines.push({ label: "名前", value: info.name });
      return lines;
    }

    function pushHistory() {
      undoStack.push({ drawing: snapshot() });
      if (undoStack.length > 40) undoStack.shift();
      redoStack.length = 0;
    }

    function screenOf(i, j) {
      const point = world(i, j);
      return { x: point.x * scale + panX, y: point.y * scale + panY };
    }

    function revealActive() {
      const at = screenOf(active.i, active.j);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const left = 108;
      const top = 130;
      let right = width - 244;
      const bottom = height - 72;
      if (right < left + 48) right = width - 16;
      let dx = 0;
      let dy = 0;
      if (at.x < left) dx = left - at.x;
      else if (at.x > right) dx = right - at.x;
      if (at.y < top) dy = top - at.y;
      else if (at.y > bottom) dy = bottom - at.y;
      panX += dx;
      panY += dy;
    }

    function worldFromScreen(x, y) {
      return { x: (x - panX) / scale, y: (y - panY) / scale };
    }

    function localPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function segmentForDelete() {
      if (selectedSegmentId) {
        return segments.find((segment) => segment.id === selectedSegmentId) || null;
      }
      const node = nodeAt(active.i, active.j);
      if (!node) return null;
      const touching = segments.filter((segment) => segment.fromId === node.id || segment.toId === node.id);
      return touching.length === 1 ? touching[0] : null;
    }

    function updateTools() {
      const moveButton = document.getElementById("moveButton");
      moveButton.classList.toggle("is-on", moveMode);
      moveButton.setAttribute("aria-pressed", moveMode ? "true" : "false");
      const rangeButton = document.getElementById("rangeButton");
      rangeButton.classList.toggle("is-on", rangeMode);
      rangeButton.setAttribute("aria-pressed", rangeMode ? "true" : "false");
      const commentButton = document.getElementById("commentButton");
      commentButton.classList.toggle("is-on", commentMode);
      commentButton.setAttribute("aria-pressed", commentMode ? "true" : "false");
      document.getElementById("joinButton").disabled = !bridgeChoice().ok;
      const comment = !moveMode && !rangeMode && selectedCommentId ? comments.find((item) => item.id === selectedCommentId) : null;
      const symbol = !comment && !moveMode && !rangeMode && selectedSymbolId ? symbols.find((item) => item.id === selectedSymbolId) : null;
      const segment = comment || symbol || moveMode || rangeMode ? null : segmentForDelete();
      const button = document.getElementById("deleteButton");
      button.disabled = rangeMode ? rangeSegmentIds.size === 0 : !(comment || symbol || segment);
      button.textContent = "削除";
      document.getElementById("doubleButton").disabled = segments.length === 0;
      document.getElementById("halfButton").hidden = !canHalf();
      document.getElementById("undoButton").disabled = undoStack.length === 0;
      document.getElementById("redoButton").disabled = redoStack.length === 0;
      syncLengthField();
      syncCommentField();
      if (hint) {
        status.textContent = hint;
      } else if (commentMode && commentDraft) {
        status.textContent = "コメントを入れてください";
      } else if (comment) {
        status.textContent = "このコメントを直せます";
      } else if (commentMode) {
        status.textContent = "コメントを置く場所をタップしてください";
      } else if (rangeMode && rangeSegmentIds.size) {
        status.textContent = `削除する配管: ${rangeSegmentIds.size}本`;
      } else if (rangeMode && rangeStart) {
        status.textContent = "終点をタップしてください";
      } else if (rangeMode) {
        status.textContent = "削除する範囲の始点をタップしてください";
      } else if (moveMode && movingSegmentIds.size) {
        status.textContent = `動かす配管: ${movingSegmentIds.size}本。矢印で1マス動かします`;
      } else if (moveMode) {
        status.textContent = "動かす配管をタップしてください";
      } else if (symbol && endKindOf(symbol) === "bulk") {
        status.textContent = "バルクは、向きを変えません";
      } else if (symbol && (symbol.type === "start" || symbol.type === "goal")) {
        const name = endKindOf(symbol) === "burner" ? "バーナー" : SYMBOLS[symbol.type];
        status.textContent = `${name}の向きは、左・奥・手前・右で変えられます`;
      } else if (symbol) {
        status.textContent = `削除できる記号: ${SYMBOLS[symbol.type] || "記号"}`;
      } else if (segment && !referenceRun()) {
        status.textContent = "この直線の長さを、ミリメートルで入れてください";
      } else if (segment && isReferenceRun(selectedRun())) {
        status.textContent = "この直線が基準です。長さを消すと外れます";
      } else if (segment && selectedRun() && !isReferenceRun(selectedRun())) {
        const lengthFixed = isLengthCorrected(selectedRun());
        const diameterFixed = isCorrectedRun(selectedRun());
        if (lengthFixed && diameterFixed) status.textContent = "この直線の長さと径は修正しています";
        else if (lengthFixed) status.textContent = "この直線の長さは修正しています";
        else if (diameterFixed) status.textContent = "この直線の径は修正しています";
        else status.textContent = "長さや径が違うときは、数字を直してください";
      } else if (segment) {
        const dir = DIRECTIONS[segment.dir];
        status.textContent = dir ? `削除できる配管: ${dir.arrow} ${dir.name}` : "削除できる配管を選択中";
      } else {
        status.textContent = "青い交点から、1マスずつ配管を引けます";
      }
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const nextWidth = Math.max(1, Math.round(width * dpr));
      const nextHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      if (!centered && width > 2 && height > 2) {
        centerOn(0, 0, 56);
        centered = true;
      }
      draw();
    }

    function centerOn(i, j, nextScale) {
      scale = nextScale;
      const point = world(i, j);
      panX = canvas.clientWidth / 2 - point.x * scale;
      panY = canvas.clientHeight / 2 - point.y * scale;
    }

    function zoomAt(sx, sy, factor) {
      hint = "";
      const worldPoint = worldFromScreen(sx, sy);
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
      scale = next;
      panX = sx - worldPoint.x * scale;
      panY = sy - worldPoint.y * scale;
      draw();
    }

    function fit() {
      const points = nodes.map((node) => world(node.i, node.j));
      points.push(world(active.i, active.j));
      commentWorldPoints().forEach((point) => points.push(point));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      const pad = 2;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / (maxX - minX), height / (maxY - minY))));
      scale = next;
      panX = width / 2 - ((minX + maxX) / 2) * scale;
      panY = height / 2 - ((minY + maxY) / 2) * scale;
      draw();
    }

    function visibleLattice() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const corners = [
        worldFromScreen(0, 0),
        worldFromScreen(width, 0),
        worldFromScreen(0, height),
        worldFromScreen(width, height)
      ];
      let iMin = Infinity;
      let iMax = -Infinity;
      let jMin = Infinity;
      let jMax = -Infinity;
      corners.forEach((point) => {
        const i = (point.x / COS - point.y / SIN) / 2;
        const j = (-point.y / SIN - point.x / COS) / 2;
        iMin = Math.min(iMin, i);
        iMax = Math.max(iMax, i);
        jMin = Math.min(jMin, j);
        jMax = Math.max(jMax, j);
      });
      return {
        iMin: Math.floor(iMin) - 2,
        iMax: Math.ceil(iMax) + 2,
        jMin: Math.floor(jMin) - 2,
        jMax: Math.ceil(jMax) + 2
      };
    }

    function screenPoint(i, j) {
      const point = world(i, j);
      return { x: point.x * scale + panX, y: point.y * scale + panY };
    }

    function drawGrid(width, height) {
      const range = visibleLattice();
      ctx.strokeStyle = "#6aafc9";
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.beginPath();
      const kMin = range.iMin - range.jMax;
      const kMax = range.iMax - range.jMin;
      for (let k = kMin; k <= kMax; k += 1) {
        const x = k * COS * scale + panX;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let j = range.jMin; j <= range.jMax; j += 1) {
        const from = screenPoint(range.iMin, j);
        const to = screenPoint(range.iMax, j);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      for (let i = range.iMin; i <= range.iMax; i += 1) {
        const from = screenPoint(i, range.jMin);
        const to = screenPoint(i, range.jMax);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      ctx.stroke();
    }

    function flexOnSegment(segmentId) {
      const movingId = symbolDrag && symbolDrag.type === "flex" ? symbolDrag.movingId : "";
      const placed = symbols.find((symbol) => symbol.type === "flex" && symbol.segmentId === segmentId && symbol.id !== movingId);
      const preview = Boolean(symbolDrag && symbolDrag.type === "flex" && symbolDrag.snap && symbolDrag.snap.segmentId === segmentId);
      return {
        wavy: Boolean(placed) || preview,
        selected: preview || Boolean(placed && placed.id === selectedSymbolId)
      };
    }

    function tracePipe(pen, ax, ay, bx, by, wavy, amplitude) {
      if (!wavy) {
        pen.moveTo(ax, ay);
        pen.lineTo(bx, by);
        return;
      }
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy) || 1;
      const sideX = -dy / length;
      const sideY = dx / length;
      const steps = 28;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const off = Math.sin(t * 2 * Math.PI * 2) * amplitude;
        const x = ax + dx * t + sideX * off;
        const y = ay + dy * t + sideY * off;
        if (i === 0) pen.moveTo(x, y);
        else pen.lineTo(x, y);
      }
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      bindOverridesToRuns();
      bindLengthOverrides();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      drawGrid(width, height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * panX, dpr * panY);

      const here = world(active.i, active.j);

      paintSegments(ctx, (i, j) => world(i, j), 8 / scale, (segment, flex) => {
        const moving = movingSegmentIds.has(segment.id);
        const inRange = rangeSegmentIds.has(segment.id);
        const selected = !moveMode && !rangeMode && !moving && !inRange && !selectedSymbolId && !selectedCommentId && (segment.id === selectedSegmentId || (segmentForDelete() && segmentForDelete().id === segment.id));
        const flexSelected = !moveMode && !rangeMode && !moving && !inRange && flex.selected;
        return {
          color: inRange ? "#b42318" : moving ? "#c2410c" : (selected || flexSelected) ? "#0b57d0" : "#1c1c1c",
          width: ((moving || selected || inRange || flexSelected) ? 4.5 : 2.75) / scale
        };
      });

      nodes.forEach((node) => {
        if (frontAxisAt(node.id)) return;
        const point = world(node.i, node.j);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = "#1c1c1c";
        ctx.fill();
      });

      ctx.beginPath();
      ctx.arc(here.x, here.y, 8 / scale, 0, Math.PI * 2);
      ctx.fillStyle = "#0b57d0";
      ctx.fill();
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      [rangeStart, rangeEnd].forEach((mark) => {
        if (!rangeMode || !mark) return;
        const point = world(mark.i, mark.j);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 11 / scale, 0, Math.PI * 2);
        ctx.lineWidth = 2.5 / scale;
        ctx.strokeStyle = "#b42318";
        ctx.stroke();
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawPlacedSymbols();
      const screenMap = (x, y) => ({ x: x * scale + panX, y: y * scale + panY });
      labelShifts = sheetLabelShifts(ctx, (i, j) => screenOf(i, j), screenMap, 13, 13, 10);
      drawRunLengths(ctx, (i, j) => screenOf(i, j), 13, labelShifts, 10);
      drawComments(ctx, screenMap, 13, labelShifts);
      updateTools();
    }

    function axisOf(dir) {
      if (dir === "up" || dir === "down") return "ud";
      if (dir === "ne" || dir === "sw") return "nesw";
      return "nwse";
    }

    const CROSS_GAP = 0.36;
    const AXIS_NAME = { ud: "上下", nesw: "奥行き", nwse: "左右" };

    function crossingAxes(nodeId) {
      const grouped = new Map();
      segments.forEach((segment) => {
        if (segment.fromId !== nodeId && segment.toId !== nodeId) return;
        const axis = axisOf(segment.dir);
        grouped.set(axis, (grouped.get(axis) || 0) + 1);
      });
      if (grouped.size < 2) return null;
      const order = { ud: 0, nesw: 1, nwse: 2 };
      return [...grouped.keys()].sort((a, b) => order[a] - order[b]);
    }

    function canVee(axes) {
      return Boolean(axes) && axes.includes("ud") && axes.includes("nesw") && axes.includes("nwse");
    }

    function frontAxisAt(nodeId) {
      const axes = crossingAxes(nodeId);
      if (!axes) return "";
      const saved = crossings.find((item) => item.nodeId === nodeId);
      if (!saved) return "";
      if (saved.frontAxis === "vee") return canVee(axes) ? "vee" : "";
      if (!axes.includes(saved.frontAxis)) return "";
      return saved.frontAxis;
    }

    function loadCrossings(value) {
      const seen = new Set();
      return (Array.isArray(value) ? value : []).map((item) => {
        if (!item || !item.nodeId || seen.has(String(item.nodeId))) return null;
        const nodeId = String(item.nodeId);
        const frontAxis = item.frontAxis || item.front;
        if (frontAxis !== "ud" && frontAxis !== "nesw" && frontAxis !== "nwse" && frontAxis !== "vee") return null;
        const axes = crossingAxes(nodeId);
        if (!axes) return null;
        if (frontAxis === "vee" ? !canVee(axes) : !axes.includes(frontAxis)) return null;
        seen.add(nodeId);
        return { nodeId, frontAxis };
      }).filter(Boolean);
    }

    function clippedSegment(segment, pointOf) {
      const from = nodeById(segment.fromId);
      const to = nodeById(segment.toId);
      if (!from || !to) return null;
      const a = pointOf(from.i, from.j);
      const b = pointOf(to.i, to.j);
      const axis = axisOf(segment.dir);
      const rear = (nodeId) => {
        const front = frontAxisAt(nodeId);
        if (!front) return false;
        if (front === "vee") return axis === "ud";
        return front !== axis;
      };
      let t0 = rear(from.id) ? CROSS_GAP : 0;
      let t1 = rear(to.id) ? 1 - CROSS_GAP : 1;
      if (t1 < t0) t0 = t1 = (t0 + t1) / 2;
      return {
        ax: a.x + (b.x - a.x) * t0,
        ay: a.y + (b.y - a.y) * t0,
        bx: a.x + (b.x - a.x) * t1,
        by: a.y + (b.y - a.y) * t1,
        rear: t0 > 0 || t1 < 1
      };
    }

    function paintSegments(pen, pointOf, amplitude, styleFor) {
      const items = [];
      segments.forEach((segment) => {
        const ends = clippedSegment(segment, pointOf);
        if (ends) items.push({ segment, ends });
      });
      items.sort((a, b) => Number(b.ends.rear) - Number(a.ends.rear));
      items.forEach((item) => {
        const flex = flexOnSegment(item.segment.id);
        pen.beginPath();
        pen.lineJoin = "round";
        tracePipe(pen, item.ends.ax, item.ends.ay, item.ends.bx, item.ends.by, flex.wavy, amplitude);
        const style = styleFor(item.segment, flex);
        pen.strokeStyle = style.color;
        pen.lineWidth = style.width;
        pen.lineCap = "round";
        pen.stroke();
      });
    }

    function cycleCrossing(nodeId) {
      const axes = crossingAxes(nodeId);
      if (!axes) return;
      pushHistory();
      const current = frontAxisAt(nodeId);
      const sequence = canVee(axes) ? axes.concat("vee") : axes;
      const index = sequence.indexOf(current);
      const next = index + 1 < sequence.length ? sequence[index + 1] : "";
      crossings = crossings.filter((item) => item.nodeId !== nodeId);
      if (next) crossings.push({ nodeId, frontAxis: next });
      hint = next === "vee"
        ? "Vでつなぎ、上下の線を消しました"
        : next
          ? AXIS_NAME[next] + "の線を手前にしました"
          : "交差を、つながった状態に戻しました";
    }

    function straightRuns() {
      const byNode = new Map();
      segments.forEach((segment) => {
        [segment.fromId, segment.toId].forEach((id) => {
          if (!byNode.has(id)) byNode.set(id, []);
          byNode.get(id).push(segment);
        });
      });
      const seen = new Set();
      const runs = [];
      segments.forEach((start) => {
        if (seen.has(start.id)) return;
        const axis = axisOf(start.dir);
        const run = [];
        const queue = [start];
        seen.add(start.id);
        while (queue.length) {
          const segment = queue.shift();
          run.push(segment);
          [segment.fromId, segment.toId].forEach((id) => {
            (byNode.get(id) || []).forEach((next) => {
              if (seen.has(next.id) || axisOf(next.dir) !== axis) return;
              seen.add(next.id);
              queue.push(next);
            });
          });
        }
        const count = new Map();
        run.forEach((segment) => {
          [segment.fromId, segment.toId].forEach((id) => {
            count.set(id, (count.get(id) || 0) + 1);
          });
        });
        const ends = [];
        count.forEach((n, id) => {
          if (n === 1) {
            const node = nodeById(id);
            if (node) ends.push(node);
          }
        });
        if (ends.length < 2) return;
        runs.push({ segments: run, cells: run.length, a: ends[0], b: ends[1] });
      });
      return runs;
    }

    function selectedRun() {
      if (moveMode || rangeMode || selectedCommentId || commentDraft) return null;
      if (selectedSymbolId) {
        const symbol = symbols.find((item) => item.id === selectedSymbolId);
        if (!symbol || symbol.type !== "flex") return null;
        return straightRuns().find((run) => run.segments.some((item) => item.id === symbol.segmentId)) || null;
      }
      const segment = segmentForDelete();
      if (!segment) return null;
      return straightRuns().find((run) => run.segments.some((item) => item.id === segment.id)) || null;
    }

    function referenceRun() {
      if (!referenceMeters || !referenceSegmentIds.length) return null;
      const ids = new Set(referenceSegmentIds);
      return straightRuns().find((run) => run.segments.some((segment) => ids.has(segment.id))) || null;
    }

    function isReferenceRun(run) {
      const ref = referenceRun();
      if (!run || !ref) return false;
      const ids = new Set(ref.segments.map((segment) => segment.id));
      return run.segments.some((segment) => ids.has(segment.id));
    }

    function lengthOf(run) {
      const scaled = scaledLength(run);
      if (!scaled) return 0;
      const override = lengthOverrideFor(run);
      return override ? override.meters : scaled;
    }

    function lengthNumber(meters) {
      const rounded = Math.round(meters * 100) / 100;
      if (!Number.isFinite(rounded) || rounded <= 0) return "";
      if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
      return String(rounded);
    }

    function formatMeters(meters) {
      const text = lengthNumber(meters);
      return text ? text + "mm" : "";
    }

    function syncLengthField() {
      const run = selectedRun();
      const ref = referenceRun();
      lengthInput.disabled = !run;
      lengthInput.readOnly = false;
      const lengthFixed = !!(run && isLengthCorrected(run));
      lengthMark.hidden = !(run && (isReferenceRun(run) || lengthFixed));
      lengthMark.textContent = lengthFixed ? "修正" : "基準";
      lengthMark.classList.toggle("is-corrected", lengthFixed);
      const canEditDiameter = !!(run && ref);
      diameterInput.disabled = !canEditDiameter;
      diameterInput.readOnly = !canEditDiameter;
      diameterMark.hidden = !(run && isCorrectedRun(run));
      if (document.activeElement !== lengthInput) {
        lengthInput.value = run && ref ? lengthNumber(lengthOf(run)) : "";
      }
      if (document.activeElement !== diameterInput) {
        diameterInput.value = canEditDiameter ? diameterOf(run) : "";
      }
    }

    function commitLength() {
      const run = selectedRun();
      if (!run) return;
      const raw = lengthInput.value.trim().replace(/㎜$/, "").replace(/mm$/i, "").replace(/m$/i, "").replace(/,/g, "");
      const ref = referenceRun();
      if (!ref || isReferenceRun(run)) {
        if (!raw) {
          if (!ref) {
            syncLengthField();
            return;
          }
          pushHistory();
          referenceMeters = null;
          referenceSegmentIds = [];
          hint = "基準を解除しました";
          draw();
          return;
        }
        const shown = ref ? lengthNumber(lengthOf(run)) : "";
        if (raw === shown) return;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
          syncLengthField();
          return;
        }
        if (referenceMeters && Math.abs(value - referenceMeters) < 1e-9 && isReferenceRun(run)) return;
        pushHistory();
        referenceMeters = value;
        referenceSegmentIds = run.segments.map((segment) => segment.id);
        hint = "";
        draw();
        return;
      }
      const existing = lengthOverrideFor(run);
      if (!raw) {
        if (!existing) {
          syncLengthField();
          return;
        }
        pushHistory();
        lengthOverrides = lengthOverrides.filter((item) => item !== existing);
        hint = "";
        draw();
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        syncLengthField();
        return;
      }
      if (lengthNumber(value) === lengthNumber(scaledLength(run))) {
        if (!existing) {
          lengthInput.value = lengthNumber(scaledLength(run));
          return;
        }
        pushHistory();
        lengthOverrides = lengthOverrides.filter((item) => item !== existing);
        hint = "";
        draw();
        return;
      }
      if (existing && lengthNumber(existing.meters) === lengthNumber(value)) {
        lengthInput.value = lengthNumber(existing.meters);
        return;
      }
      pushHistory();
      const record = {
        segmentIds: run.segments.map((segment) => segment.id),
        meters: value
      };
      if (existing) {
        existing.segmentIds = record.segmentIds;
        existing.meters = record.meters;
      } else {
        lengthOverrides.push(record);
      }
      hint = "";
      draw();
    }

    function commitDiameter() {
      const run = selectedRun();
      if (!run || !referenceRun()) {
        syncLengthField();
        return;
      }
      const raw = diameterInput.value.trim();
      if (!raw) {
        if (isReferenceRun(run)) {
          if (!referenceDiameter) {
            syncLengthField();
            return;
          }
          pushHistory();
          referenceDiameter = "";
          hint = "";
          draw();
          return;
        }
        if (!overrideFor(run)) {
          syncLengthField();
          return;
        }
        pushHistory();
        diameterOverrides = diameterOverrides.filter((item) => item !== overrideFor(run));
        hint = "";
        draw();
        return;
      }
      const next = cleanDiameter(raw);
      if (!next) {
        syncLengthField();
        return;
      }
      if (isReferenceRun(run)) {
        if (next === referenceDiameter) {
          diameterInput.value = referenceDiameter;
          return;
        }
        pushHistory();
        referenceDiameter = next;
        diameterOverrides = diameterOverrides.filter((item) => item.diameter !== next);
        hint = "";
        draw();
        return;
      }
      const existing = overrideFor(run);
      if (next === referenceDiameter) {
        if (!existing) {
          diameterInput.value = referenceDiameter;
          return;
        }
        pushHistory();
        diameterOverrides = diameterOverrides.filter((item) => item !== existing);
        hint = "";
        draw();
        return;
      }
      if (existing && existing.diameter === next) {
        diameterInput.value = next;
        return;
      }
      pushHistory();
      const record = {
        segmentIds: run.segments.map((segment) => segment.id),
        diameter: next
      };
      if (existing) {
        existing.segmentIds = record.segmentIds;
        existing.diameter = record.diameter;
      } else {
        diameterOverrides.push(record);
      }
      hint = "";
      draw();
    }

    function syncCommentField() {
      const comment = selectedCommentId ? comments.find((item) => item.id === selectedCommentId) : null;
      const editing = !!(commentDraft || comment);
      commentInput.disabled = !editing;
      if (document.activeElement === commentInput) return;
      commentInput.value = commentDraft ? "" : comment ? comment.text : "";
    }

    function commitComment() {
      const text = cleanText(commentInput.value, 40);
      if (commentDraft) {
        if (!text) {
          commentDraft = null;
          hint = "";
          draw();
          return;
        }
        pushHistory();
        const id = uid();
        comments.push({
          id,
          text,
          segmentId: commentDraft.segmentId,
          t: commentDraft.t,
          x: commentDraft.x,
          y: commentDraft.y,
          dx: commentDraft.dx,
          dy: commentDraft.dy
        });
        commentDraft = null;
        selectedCommentId = id;
        hint = "";
        draw();
        return;
      }
      const comment = comments.find((item) => item.id === selectedCommentId);
      if (!comment) return;
      if (!text || text === comment.text) {
        syncCommentField();
        return;
      }
      pushHistory();
      comment.text = text;
      hint = "";
      draw();
    }

    function placeCommentAt(point) {
      const snap = closestSnap(point);
      if (snap && snap.dist <= 20) {
        const segment = segments.find((item) => item.id === snap.segmentId);
        const from = segment && nodeById(segment.fromId);
        const to = segment && nodeById(segment.toId);
        if (from && to) {
          const a = world(from.i, from.j);
          const b = world(to.i, to.j);
          const vx = b.x - a.x;
          const vy = b.y - a.y;
          const length = Math.hypot(vx, vy) || 1;
          const dist = 0.72;
          return {
            text: "",
            segmentId: segment.id,
            t: snap.t,
            x: a.x + vx * snap.t,
            y: a.y + vy * snap.t,
            dx: -vy / length * dist,
            dy: vx / length * dist
          };
        }
      }
      const at = worldFromScreen(point.x, point.y);
      return {
        text: "",
        segmentId: "",
        t: 0.5,
        x: at.x,
        y: at.y,
        dx: 0.32,
        dy: -0.72
      };
    }

    function selectComment(id) {
      commentDraft = null;
      selectedCommentId = id;
      selectedSegmentId = null;
      selectedSymbolId = null;
      hint = "";
      draw();
      commentInput.focus();
    }

    function beginComment(point) {
      const hit = hitComment(point);
      if (hit) {
        selectComment(hit.id);
        return;
      }
      commentDraft = placeCommentAt(point);
      selectedCommentId = null;
      selectedSegmentId = null;
      selectedSymbolId = null;
      hint = "";
      draw();
      commentInput.focus();
    }

    function drawRunLengths(pen, pointOf, fontSize, shifts, clearance) {
      if (!referenceRun()) return;
      straightRuns().forEach((run) => {
        const a = pointOf(run.a.i, run.a.j);
        const b = pointOf(run.b.i, run.b.j);
        const layout = runLabelLayout(pen, run, a.x, a.y, b.x, b.y, fontSize, clearance);
        if (!layout) return;
        paintRunLabel(pen, layout, shifts && shifts.get(run.segments[0].id));
      });
    }

    function segmentEnds(segment) {
      const from = nodeById(segment.fromId);
      const to = nodeById(segment.toId);
      if (!from || !to) return null;
      return { from: screenOf(from.i, from.j), to: screenOf(to.i, to.j) };
    }

    function faceVector(dirId) {
      const dir = DIRECTIONS[FACE_DIRS.includes(dirId) ? dirId : "se"];
      const point = world(dir.di, dir.dj);
      const length = Math.hypot(point.x, point.y) || 1;
      return { x: point.x / length, y: point.y / length };
    }

    function facingOf(symbol, segment) {
      if (symbol && FACE_DIRS.includes(symbol.facing)) return symbol.facing;
      if (segment && FACE_DIRS.includes(segment.dir)) return segment.dir;
      return "se";
    }

    function endKindOf(symbol) {
      if (!symbol) return "";
      if (symbol.type === "start") return symbol.kind === "bulk" ? "bulk" : "pipe";
      if (symbol.type === "goal") return symbol.kind === "burner" ? "burner" : "pipe";
      return "";
    }

    function buttonKind(type) {
      return type === "start" ? startKind : goalKind;
    }

    function endFacing(segment, t) {
      const opposite = { up: "down", down: "up", ne: "sw", sw: "ne", nw: "se", se: "nw" };
      if (!segment) return "se";
      const dirId = t < 0.5 ? opposite[segment.dir] : segment.dir;
      return FACE_DIRS.includes(dirId) ? dirId : "se";
    }

    function symbolMarkVector(type, facing, pipeVector) {
      if (type === "start" || type === "goal") return faceVector(facing);
      return pipeVector;
    }

    function symbolGeometry(type, ax, ay, bx, by, t) {
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy) || 1;
      const vector = { x: dx / length, y: dy / length };
      const x = ax + dx * t;
      const y = ay + dy * t;
      const center = type === "gauge"
        ? { x: x - vector.y * 22, y: y + vector.x * 22 }
        : { x, y };
      return { x, y, vector, center };
    }

    function placementOf(symbol) {
      const segment = segments.find((item) => item.id === symbol.segmentId);
      if (!segment) return null;
      const ends = segmentEnds(segment);
      if (!ends) return null;
      return symbolGeometry(symbol.type, ends.from.x, ends.from.y, ends.to.x, ends.to.y, symbol.t);
    }

    function drawSymbolMark(type, x, y, vector, selected, options) {
      const pen = (options && options.pen) || ctx;
      const s = (options && options.scale) || 1;
      const side = { x: -vector.y, y: vector.x };
      const center = type === "gauge" ? { x: x - vector.y * 22 * s, y: y + vector.x * 22 * s } : { x, y };
      const kind = (options && options.kind) || "";
      pen.save();
      pen.lineWidth = 2.5 * s;
      pen.strokeStyle = selected ? "#0b57d0" : "#111111";
      pen.fillStyle = "#ffffff";
      pen.lineJoin = "round";
      if (type === "gauge") {
        pen.beginPath();
        pen.moveTo(x, y);
        pen.lineTo(center.x, center.y);
        pen.stroke();
      }
      if (type === "regulator" || type === "gauge") {
        pen.beginPath();
        pen.arc(center.x, center.y, 15 * s, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        pen.fillStyle = selected ? "#0b57d0" : "#111111";
        pen.font = "700 " + (16 * s) + "px sans-serif";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(type === "regulator" ? "R" : "P", center.x, center.y + s);
      } else if (type === "valve") {
        [-1, 1].forEach((sign) => {
          const bx = x + vector.x * 15 * s * sign;
          const by = y + vector.y * 15 * s * sign;
          pen.beginPath();
          pen.moveTo(bx + side.x * 11 * s, by + side.y * 11 * s);
          pen.lineTo(bx - side.x * 11 * s, by - side.y * 11 * s);
          pen.lineTo(x, y);
          pen.closePath();
          pen.fill();
          pen.stroke();
        });
      } else if (type === "start" && kind === "bulk") {
        const w = 15 * s;
        const h = 7 * s;
        pen.beginPath();
        pen.moveTo(x - w + h, y - h);
        pen.lineTo(x + w - h, y - h);
        pen.arc(x + w - h, y, h, -Math.PI / 2, Math.PI / 2);
        pen.lineTo(x - w + h, y + h);
        pen.arc(x - w + h, y, h, Math.PI / 2, Math.PI * 1.5);
        pen.closePath();
        pen.fill();
        pen.stroke();
        pen.beginPath();
        pen.moveTo(x - 6 * s, y + h);
        pen.lineTo(x - 6 * s, y + h + 5 * s);
        pen.moveTo(x + 6 * s, y + h);
        pen.lineTo(x + 6 * s, y + h + 5 * s);
        pen.stroke();
      } else if (type === "start") {
        const ink = selected ? "#0b57d0" : "#111111";
        pen.beginPath();
        pen.arc(x, y, 8 * s, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        pen.fillStyle = ink;
        const shaft = [
          { x: x + vector.x * 18 * s + side.x * 2.4 * s, y: y + vector.y * 18 * s + side.y * 2.4 * s },
          { x: x + vector.x * 10 * s + side.x * 2.4 * s, y: y + vector.y * 10 * s + side.y * 2.4 * s },
          { x: x + vector.x * 10 * s - side.x * 2.4 * s, y: y + vector.y * 10 * s - side.y * 2.4 * s },
          { x: x + vector.x * 18 * s - side.x * 2.4 * s, y: y + vector.y * 18 * s - side.y * 2.4 * s }
        ];
        pen.beginPath();
        pen.moveTo(shaft[0].x, shaft[0].y);
        shaft.slice(1).forEach((point) => pen.lineTo(point.x, point.y));
        pen.closePath();
        pen.fill();
        pen.stroke();
        pen.beginPath();
        pen.moveTo(x + vector.x * 1.5 * s, y + vector.y * 1.5 * s);
        pen.lineTo(x + vector.x * 11 * s + side.x * 6.5 * s, y + vector.y * 11 * s + side.y * 6.5 * s);
        pen.lineTo(x + vector.x * 11 * s - side.x * 6.5 * s, y + vector.y * 11 * s - side.y * 6.5 * s);
        pen.closePath();
        pen.fill();
        pen.stroke();
      } else if (type === "goal" && kind === "burner") {
        const k = 8 / 6.5;
        const at = (lx, ly) => ({
          x: x + (vector.x * lx - side.x * ly) * k * s,
          y: y + (vector.y * lx - side.y * ly) * k * s
        });
        pen.strokeStyle = "#111111";
        pen.fillStyle = "#ffffff";
        pen.beginPath();
        pen.arc(x, y, 6.5 * k * s, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        const tube = [at(0, -3), at(8, -3), at(8, 3), at(0, 3)];
        pen.beginPath();
        pen.moveTo(tube[0].x, tube[0].y);
        tube.slice(1).forEach((point) => pen.lineTo(point.x, point.y));
        pen.closePath();
        pen.fill();
        pen.stroke();
        pen.fillStyle = "#111111";
        [
          [[8, -8.4], [23, -15], [35, -8.4], [32, 0], [24.5, -5.4], [15.5, -4.8], [8, -0.6]],
          [[8, 0.6], [23, -1.8], [38, 4.8], [32, 13.2], [23, 7.2], [15.5, 6.6], [8, 9]]
        ].forEach((flame) => {
          const point = flame.map(([lx, ly]) => at(lx, ly));
          pen.beginPath();
          pen.moveTo(point[0].x, point[0].y);
          pen.bezierCurveTo(point[1].x, point[1].y, point[2].x, point[2].y, point[3].x, point[3].y);
          pen.bezierCurveTo(point[4].x, point[4].y, point[5].x, point[5].y, point[6].x, point[6].y);
          pen.closePath();
          pen.fill();
        });
      } else if (type === "goal") {
        const ink = selected ? "#0b57d0" : "#111111";
        pen.beginPath();
        pen.arc(x, y, 8 * s, 0, Math.PI * 2);
        pen.fill();
        pen.stroke();
        pen.fillStyle = ink;
        pen.beginPath();
        pen.moveTo(x + side.x * 2.4 * s, y + side.y * 2.4 * s);
        pen.lineTo(x + vector.x * 9 * s + side.x * 2.4 * s, y + vector.y * 9 * s + side.y * 2.4 * s);
        pen.lineTo(x + vector.x * 9 * s - side.x * 2.4 * s, y + vector.y * 9 * s - side.y * 2.4 * s);
        pen.lineTo(x - side.x * 2.4 * s, y - side.y * 2.4 * s);
        pen.closePath();
        pen.fill();
        pen.stroke();
        pen.beginPath();
        pen.moveTo(x + vector.x * 18 * s, y + vector.y * 18 * s);
        pen.lineTo(x + vector.x * 8 * s + side.x * 6.5 * s, y + vector.y * 8 * s + side.y * 6.5 * s);
        pen.lineTo(x + vector.x * 8 * s - side.x * 6.5 * s, y + vector.y * 8 * s - side.y * 6.5 * s);
        pen.closePath();
        pen.fill();
        pen.stroke();
      } else if (type === "flex") {
        const half = 16 * s;
        const amp = 7 * s;
        const steps = 16;
        pen.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const along = (t - 0.5) * half * 2;
          const off = Math.sin(t * 2 * Math.PI * 2) * amp;
          const px = x + vector.x * along + side.x * off;
          const py = y + vector.y * along + side.y * off;
          if (i === 0) pen.moveTo(px, py);
          else pen.lineTo(px, py);
        }
        pen.stroke();
        pen.restore();
        return;
      } else if (type === "flange") {
        [-6, 6].forEach((offset) => {
          const cx = x + vector.x * offset * s;
          const cy = y + vector.y * offset * s;
          pen.beginPath();
          pen.moveTo(cx + side.x * 15 * s, cy + side.y * 15 * s);
          pen.lineTo(cx - side.x * 15 * s, cy - side.y * 15 * s);
          pen.stroke();
        });
      }
      if (selected) {
        pen.beginPath();
        pen.arc(center.x, center.y, (kind === "bulk" ? 28 : kind === "burner" ? 50 : 26) * s, 0, Math.PI * 2);
        pen.strokeStyle = "#0b57d0";
        pen.lineWidth = 2 * s;
        pen.stroke();
      }
      pen.restore();
    }

    function drawPlacedSymbols() {
      symbols.forEach((symbol) => {
        if (symbol.type === "flex") return;
        if (symbolDrag && symbolDrag.movingId === symbol.id) return;
        const place = placementOf(symbol);
        if (!place) return;
        const segment = segments.find((item) => item.id === symbol.segmentId);
        const vector = symbolMarkVector(symbol.type, facingOf(symbol, segment), place.vector);
        drawSymbolMark(symbol.type, place.x, place.y, vector, symbol.id === selectedSymbolId, { kind: endKindOf(symbol) });
      });
      if (!symbolDrag) return;
      if (symbolDrag.type === "flex") {
        if (!symbolDrag.snap) {
          ctx.save();
          ctx.globalAlpha = 0.45;
          drawSymbolMark("flex", symbolDrag.x, symbolDrag.y, { x: 1, y: 0 }, false, { kind: "" });
          ctx.restore();
        }
        return;
      }
      ctx.save();
      ctx.globalAlpha = symbolDrag.snap ? 1 : 0.45;
      if (symbolDrag.snap) {
        const segment = segments.find((item) => item.id === symbolDrag.snap.segmentId);
        const ends = segment && segmentEnds(segment);
        if (ends) {
          const place = symbolGeometry(symbolDrag.type, ends.from.x, ends.from.y, ends.to.x, ends.to.y, symbolDrag.snap.t);
          const moving = symbols.find((item) => item.id === symbolDrag.movingId);
          const vector = symbolMarkVector(symbolDrag.type, facingOf(moving, segment), place.vector);
          drawSymbolMark(symbolDrag.type, place.x, place.y, vector, true, { kind: symbolDrag.kind || endKindOf(moving) });
        }
      } else {
        drawSymbolMark(symbolDrag.type, symbolDrag.x, symbolDrag.y, symbolMarkVector(symbolDrag.type, "se", { x: 1, y: 0 }), false, { kind: symbolDrag.kind || "" });
      }
      ctx.restore();
    }

    function addDirection(dirId) {
      hint = "";
      const next = step(active.i, active.j, dirId);
      let from = nodeAt(active.i, active.j);
      let to = nodeAt(next.i, next.j);
      if (from && to && edgeBetween(from.id, to.id)) {
      active = { i: next.i, j: next.j };
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentDraft = null;
      revealActive();
      draw();
      return;
    }
    pushHistory();
      if (!from) {
        from = { id: uid(), i: active.i, j: active.j };
        nodes.push(from);
      }
      if (!to) {
        to = { id: uid(), i: next.i, j: next.j };
        nodes.push(to);
      }
      segments.push({ id: uid(), fromId: from.id, toId: to.id, dir: dirId });
      active = { i: next.i, j: next.j };
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentDraft = null;
      revealActive();
      draw();
    }

    function removeIsolated(id) {
      const used = segments.some((segment) => segment.fromId === id || segment.toId === id);
      if (!used) nodes = nodes.filter((node) => node.id !== id);
    }

    function deleteSelection() {
      hint = "";
      if (moveMode) return;
      if (rangeMode) {
        if (!rangeSegmentIds.size) return;
        pushHistory();
        symbols = symbols.filter((symbol) => !rangeSegmentIds.has(symbol.segmentId));
        comments = comments.filter((comment) => !comment.segmentId || !rangeSegmentIds.has(comment.segmentId));
        segments = segments.filter((segment) => !rangeSegmentIds.has(segment.id));
        const used = new Set();
        segments.forEach((segment) => {
          used.add(segment.fromId);
          used.add(segment.toId);
        });
        nodes = nodes.filter((node) => used.has(node.id));
        if (rangeStart) active = { i: rangeStart.i, j: rangeStart.j };
        rangeStart = null;
        rangeEnd = null;
        rangeSegmentIds = new Set();
        selectedSegmentId = null;
        selectedSymbolId = null;
        selectedCommentId = null;
        commentDraft = null;
        revealActive();
        draw();
        return;
      }
      if (selectedCommentId) {
        const comment = comments.find((item) => item.id === selectedCommentId);
        if (!comment) return;
        pushHistory();
        comments = comments.filter((item) => item.id !== selectedCommentId);
        selectedCommentId = null;
        commentDraft = null;
        draw();
        return;
      }
      if (selectedSymbolId) {
        const symbol = symbols.find((item) => item.id === selectedSymbolId);
        if (!symbol) return;
        pushHistory();
        symbols = symbols.filter((item) => item.id !== selectedSymbolId);
        selectedSymbolId = null;
        draw();
        return;
      }
      const segment = segmentForDelete();
      if (!segment) return;
      const from = nodeById(segment.fromId);
      const to = nodeById(segment.toId);
      pushHistory();
      symbols = symbols.filter((symbol) => symbol.segmentId !== segment.id);
      comments = comments.filter((comment) => comment.segmentId !== segment.id);
      segments = segments.filter((item) => item.id !== segment.id);
      if (to) removeIsolated(to.id);
      if (from) removeIsolated(from.id);
      active = from ? { i: from.i, j: from.j } : active;
      selectedSegmentId = null;
      selectedSymbolId = null;
      if (selectedCommentId && !comments.some((comment) => comment.id === selectedCommentId)) selectedCommentId = null;
      revealActive();
      draw();
    }

    function stepDir(from, to) {
      if (!from || !to) return "";
      const di = to.i - from.i;
      const dj = to.j - from.j;
      const match = Object.keys(DIRECTIONS).find((id) => DIRECTIONS[id].di === di && DIRECTIONS[id].dj === dj);
      return match || "";
    }

    function anchorNode() {
      const start = symbols.find((symbol) => symbol.type === "start");
      if (start) {
        const segment = segments.find((item) => item.id === start.segmentId);
        if (segment) {
          const id = Number(start.t) >= 0.5 ? segment.toId : segment.fromId;
          const node = nodeById(id);
          if (node) return node;
        }
      }
      return nodes[0] || null;
    }

    function evenOffset(node, ai, aj) {
      return (node.i - ai) % 2 === 0 && (node.j - aj) % 2 === 0;
    }

    function halfDelta(delta) {
      return (delta - (delta % 2)) / 2;
    }

    function canHalf() {
      if (doubled < 1 || !segments.length) return false;
      const anchor = anchorNode();
      if (!anchor) return false;
      const ai = anchor.i;
      const aj = anchor.j;
      return nodes.every((node) => {
        if (evenOffset(node, ai, aj)) return true;
        const touching = segments.filter((segment) => segment.fromId === node.id || segment.toId === node.id);
        if (touching.length !== 2) return false;
        const neighbors = touching.map((segment) => nodeById(segment.fromId === node.id ? segment.toId : segment.fromId));
        if (neighbors.some((item) => !item)) return false;
        const forward = stepDir(neighbors[0], node);
        const onward = stepDir(node, neighbors[1]);
        return Boolean(forward) && forward === onward;
      });
    }

    function releaseScaleModes() {
      commentDraft = null;
      moveMode = false;
      movingSegmentIds = new Set();
      rangeMode = false;
      rangeStart = null;
      rangeEnd = null;
      rangeSegmentIds = new Set();
    }

    function scaleFreeComments(ai, aj, factor) {
      const origin = world(ai, aj);
      comments.forEach((comment) => {
        if (comment.segmentId) return;
        comment.x = origin.x + (comment.x - origin.x) * factor;
        comment.y = origin.y + (comment.y - origin.y) * factor;
      });
    }

    function tFrom(segment, t, nodeId) {
      const value = Number(t);
      const unit = Number.isFinite(value) ? value : 0.5;
      return segment.fromId === nodeId ? unit : 1 - unit;
    }

    function storedSymbolT(type, t) {
      if (type === "start" || type === "goal") return t >= 0.5 ? 1 : 0;
      if (type === "flex") return 0.5;
      return Math.min(0.82, Math.max(0.18, t));
    }

    function rewriteSegmentId(oldId, newId) {
      if (!oldId || oldId === newId) return;
      const mapId = (id) => id === oldId ? newId : id;
      referenceSegmentIds = [...new Set(referenceSegmentIds.map(mapId))];
      diameterOverrides.forEach((item) => {
        item.segmentIds = [...new Set(item.segmentIds.map(mapId))];
      });
      lengthOverrides.forEach((item) => {
        item.segmentIds = [...new Set(item.segmentIds.map(mapId))];
      });
      if (selectedSegmentId === oldId) selectedSegmentId = newId;
    }

    function doubleDrawing() {
      if (!segments.length) return;
      const anchor = anchorNode();
      if (!anchor) return;
      const singleSteps = segments.every((segment) => stepDir(nodeById(segment.fromId), nodeById(segment.toId)));
      if (!singleSteps) {
        hint = "この図は倍にできません";
        draw();
        return;
      }
      const plan = segments.map((segment) => ({
        segment,
        dir: stepDir(nodeById(segment.fromId), nodeById(segment.toId))
      }));
      pushHistory();
      const ai = anchor.i;
      const aj = anchor.j;
      scaleFreeComments(ai, aj, 2);
      nodes.forEach((node) => {
        node.i = ai + (node.i - ai) * 2;
        node.j = aj + (node.j - aj) * 2;
      });
      active = { i: ai + (active.i - ai) * 2, j: aj + (active.j - aj) * 2 };
      plan.forEach(({ segment, dir }) => {
        const from = nodeById(segment.fromId);
        const toId = segment.toId;
        const midPos = step(from.i, from.j, dir);
        let mid = nodeAt(midPos.i, midPos.j);
        if (!mid) {
          mid = { id: uid(), i: midPos.i, j: midPos.j };
          nodes.push(mid);
        }
        const second = { id: uid(), fromId: mid.id, toId, dir };
        const firstId = segment.id;
        segment.toId = mid.id;
        segment.dir = dir;
        segments.push(second);
        symbols.slice().forEach((symbol) => {
          if (symbol.segmentId !== firstId) return;
          if (symbol.type === "flex") {
            symbols.push({ id: uid(), segmentId: second.id, type: "flex", t: 0.5 });
            return;
          }
          const along = Number(symbol.t) || 0;
          if (along < 0.5) symbol.t = storedSymbolT(symbol.type, along / 0.5);
          else {
            symbol.segmentId = second.id;
            symbol.t = storedSymbolT(symbol.type, (along - 0.5) / 0.5);
          }
        });
        comments.slice().forEach((comment) => {
          if (comment.segmentId !== firstId) return;
          const along = Number(comment.t);
          const unit = Number.isFinite(along) ? along : 0.5;
          if (unit < 0.5) comment.t = Math.min(0.85, Math.max(0.15, unit / 0.5));
          else {
            comment.segmentId = second.id;
            comment.t = Math.min(0.85, Math.max(0.15, (unit - 0.5) / 0.5));
          }
        });
      });
      doubled += 1;
      releaseScaleModes();
      hint = "配管を2倍にしました";
      draw();
    }

    function halfDrawing() {
      if (!canHalf()) return;
      const anchor = anchorNode();
      pushHistory();
      const ai = anchor.i;
      const aj = anchor.j;
      scaleFreeComments(ai, aj, 0.5);
      const oddNodes = nodes.filter((node) => !evenOffset(node, ai, aj));
      const drop = new Set();
      const removedSymbols = new Set();
      oddNodes.forEach((odd) => {
        const touching = segments.filter((segment) => segment.fromId === odd.id || segment.toId === odd.id);
        const neighborOf = (segment) => nodeById(segment.fromId === odd.id ? segment.toId : segment.fromId);
        let nodeA = neighborOf(touching[0]);
        let nodeB = neighborOf(touching[1]);
        let segA = touching[0];
        let segB = touching[1];
        if (stepDir(nodeA, odd) !== stepDir(odd, nodeB)) {
          const swapNode = nodeA;
          nodeA = nodeB;
          nodeB = swapNode;
          const swapSeg = segA;
          segA = segB;
          segB = swapSeg;
        }
        let flexId = "";
        symbols.forEach((symbol) => {
          if (symbol.segmentId !== segA.id && symbol.segmentId !== segB.id) return;
          if (symbol.type === "flex") {
            if (!flexId) {
              flexId = symbol.id;
              symbol.segmentId = segA.id;
              symbol.t = 0.5;
            } else removedSymbols.add(symbol.id);
            return;
          }
          const onA = symbol.segmentId === segA.id;
          const span = onA
            ? tFrom(segA, symbol.t, nodeA.id) * 0.5
            : 0.5 + tFrom(segB, symbol.t, odd.id) * 0.5;
          symbol.segmentId = segA.id;
          symbol.t = storedSymbolT(symbol.type, span);
        });
        comments.forEach((comment) => {
          if (comment.segmentId !== segA.id && comment.segmentId !== segB.id) return;
          const onA = comment.segmentId === segA.id;
          const span = onA
            ? tFrom(segA, comment.t, nodeA.id) * 0.5
            : 0.5 + tFrom(segB, comment.t, odd.id) * 0.5;
          comment.segmentId = segA.id;
          comment.t = Math.min(0.85, Math.max(0.15, span));
        });
        if (removedSymbols.has(selectedSymbolId)) selectedSymbolId = flexId || null;
        segA.fromId = nodeA.id;
        segA.toId = nodeB.id;
        segA.dir = stepDir(nodeA, odd);
        rewriteSegmentId(segB.id, segA.id);
        drop.add(segB.id);
      });
      symbols = symbols.filter((symbol) => !removedSymbols.has(symbol.id));
      segments = segments.filter((segment) => !drop.has(segment.id));
      const oddIds = new Set(oddNodes.map((node) => node.id));
      nodes = nodes.filter((node) => !oddIds.has(node.id));
      crossings = crossings.filter((item) => !oddIds.has(item.nodeId));
      nodes.forEach((node) => {
        node.i = ai + halfDelta(node.i - ai);
        node.j = aj + halfDelta(node.j - aj);
      });
      active = { i: ai + halfDelta(active.i - ai), j: aj + halfDelta(active.j - aj) };
      doubled = Math.max(0, doubled - 1);
      releaseScaleModes();
      hint = doubled ? "配管を半分にしました" : "元の大きさに戻しました";
      draw();
    }

    function renderDrawingSheet() {
      const pageW = 3508;
      const pageH = 2480;
      const margin = 90;
      const lines = infoLines();
      const infoPadX = 28;
      const infoPadY = 20;
      const infoLineH = 72;
      const infoMargin = 48;
      const infoBand = lines.length ? infoMargin + infoPadY * 2 + infoLineH * lines.length + 12 : 0;
      const points = [];
      nodes.forEach((node) => {
        const used = segments.some((segment) => segment.fromId === node.id || segment.toId === node.id);
        if (used) points.push(world(node.i, node.j));
      });
      if (!points.length) points.push(world(active.i, active.j));
      commentWorldPoints().forEach((point) => points.push(point));
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      const pad = 2.5;
      minX -= pad;
      minY -= pad;
      maxX += pad;
      maxY += pad;
      const worldW = Math.max(maxX - minX, 1);
      const worldH = Math.max(maxY - minY, 1);
      const cell = Math.min((pageW - margin * 2) / worldW, (pageH - margin * 2 - infoBand) / worldH);
      const originX = (pageW - worldW * cell) / 2 - minX * cell;
      const originY = (pageH - infoBand - worldH * cell) / 2 - minY * cell;
      const sheet = document.createElement("canvas");
      sheet.width = pageW;
      sheet.height = pageH;
      const pen = sheet.getContext("2d");
      pen.fillStyle = "#ffffff";
      pen.fillRect(0, 0, pageW, pageH);
      const latticeAt = (x, y) => {
        const wx = (x - originX) / cell;
        const wy = (y - originY) / cell;
        return {
          i: (wx / COS - wy / SIN) / 2,
          j: (-wy / SIN - wx / COS) / 2
        };
      };
      const corners = [latticeAt(0, 0), latticeAt(pageW, 0), latticeAt(0, pageH), latticeAt(pageW, pageH)];
      let iMin = Infinity;
      let iMax = -Infinity;
      let jMin = Infinity;
      let jMax = -Infinity;
      corners.forEach((corner) => {
        iMin = Math.min(iMin, corner.i);
        iMax = Math.max(iMax, corner.i);
        jMin = Math.min(jMin, corner.j);
        jMax = Math.max(jMax, corner.j);
      });
      iMin = Math.floor(iMin) - 1;
      iMax = Math.ceil(iMax) + 1;
      jMin = Math.floor(jMin) - 1;
      jMax = Math.ceil(jMax) + 1;
      const at = (i, j) => {
        const point = world(i, j);
        return { x: point.x * cell + originX, y: point.y * cell + originY };
      };
      pen.strokeStyle = "#6aafc9";
      pen.lineWidth = 1.4;
      pen.lineCap = "butt";
      pen.beginPath();
      for (let k = iMin - jMax; k <= iMax - jMin; k += 1) {
        const x = k * COS * cell + originX;
        pen.moveTo(x, 0);
        pen.lineTo(x, pageH);
      }
      for (let j = jMin; j <= jMax; j += 1) {
        const from = at(iMin, j);
        const to = at(iMax, j);
        pen.moveTo(from.x, from.y);
        pen.lineTo(to.x, to.y);
      }
      for (let i = iMin; i <= iMax; i += 1) {
        const from = at(i, jMin);
        const to = at(i, jMax);
        pen.moveTo(from.x, from.y);
        pen.lineTo(to.x, to.y);
      }
      pen.stroke();
      pen.lineCap = "round";
      paintSegments(pen, at, Math.max(10, cell * 0.12), () => ({
        color: "#1c1c1c",
        width: Math.max(3, cell * 0.055)
      }));
      nodes.forEach((node) => {
        if (frontAxisAt(node.id)) return;
        const point = at(node.i, node.j);
        pen.beginPath();
        pen.arc(point.x, point.y, Math.max(2.5, cell * 0.045), 0, Math.PI * 2);
        pen.fillStyle = "#1c1c1c";
        pen.fill();
      });
      const markScale = Math.max(0.65, cell / 56);
      symbols.forEach((symbol) => {
        if (symbol.type === "flex") return;
        const segment = segments.find((item) => item.id === symbol.segmentId);
        if (!segment) return;
        const from = nodeById(segment.fromId);
        const to = nodeById(segment.toId);
        if (!from || !to) return;
        const a = at(from.i, from.j);
        const b = at(to.i, to.j);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const pipeVector = { x: dx / length, y: dy / length };
        drawSymbolMark(symbol.type, a.x + dx * symbol.t, a.y + dy * symbol.t, symbolMarkVector(symbol.type, facingOf(symbol, segment), pipeVector), false, {
          pen,
          scale: markScale,
          kind: endKindOf(symbol)
        });
      });
      // 図面が大きい（cell が小さい）ときは線に合わせて長さ・径だけ縮小する。
      // 下限は読める程度（絶対最小よりわずかに上）。コメント・記号は従来どおり。
      const PRINT_LENGTH_FONT_MIN = 32;
      const lengthFont = Math.max(PRINT_LENGTH_FONT_MIN, cell * 0.28);
      const commentFont = 46;
      const labelClearance = Math.max(10, cell * 0.12) + Math.max(3, cell * 0.055) / 2;
      const printMap = (x, y) => ({ x: x * cell + originX, y: y * cell + originY });
      const printShifts = sheetLabelShifts(pen, at, printMap, lengthFont, commentFont, labelClearance, {
        pad: Math.max(16, lengthFont * 0.5),
        passes: 40,
        nudge: Math.max(6, lengthFont * 0.22),
        allowPerpendicular: true
      });
      drawRunLengths(pen, at, lengthFont, printShifts, labelClearance);
      drawComments(pen, printMap, commentFont, printShifts);
      if (lines.length) {
        const labelWidth = 210;
        const maxValue = 900;
        pen.textAlign = "left";
        pen.textBaseline = "middle";
        const valueSizes = lines.map((line) => {
          let size = 52;
          pen.font = "700 " + size + "px sans-serif";
          while (size > 36 && pen.measureText(line.value).width > maxValue) {
            size -= 2;
            pen.font = "700 " + size + "px sans-serif";
          }
          return size;
        });
        let valueWidth = 0;
        lines.forEach((line, index) => {
          pen.font = "700 " + valueSizes[index] + "px sans-serif";
          valueWidth = Math.max(valueWidth, pen.measureText(line.value).width);
        });
        const boxW = infoPadX * 2 + labelWidth + valueWidth;
        const boxH = infoPadY * 2 + infoLineH * lines.length;
        const boxX = pageW - infoMargin - boxW;
        const boxY = pageH - infoMargin - boxH;
        pen.fillStyle = "#ffffff";
        pen.fillRect(boxX, boxY, boxW, boxH);
        pen.strokeStyle = "#7f97a8";
        pen.lineWidth = 1.6;
        pen.strokeRect(boxX, boxY, boxW, boxH);
        lines.forEach((line, index) => {
          const y = boxY + infoPadY + infoLineH * index + infoLineH / 2;
          pen.fillStyle = "#3d5160";
          pen.font = "700 44px sans-serif";
          pen.fillText(line.label, boxX + infoPadX, y);
          pen.fillStyle = "#1c1c1c";
          pen.font = "700 " + valueSizes[index] + "px sans-serif";
          pen.fillText(line.value, boxX + infoPadX + labelWidth, y);
        });
      }
      return sheet;
    }

    function printDrawing() {
      const sheet = renderDrawingSheet();
      const holder = document.createElement("div");
      holder.className = "print-sheet";
      sheet.setAttribute("aria-label", sheetInfo().title || "アイソメ図");
      holder.appendChild(sheet);
      document.body.appendChild(holder);
      const cleanup = () => {
        holder.remove();
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    }

    function createPdfBlob(sheet) {
      const binary = atob(sheet.toDataURL("image/jpeg", 0.98).split(",")[1]);
      const jpeg = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      const encoder = new TextEncoder();
      const parts = [];
      const offsets = [0];
      let size = 0;
      const append = (value) => {
        const bytes = typeof value === "string" ? encoder.encode(value) : value;
        parts.push(bytes);
        size += bytes.length;
      };
      const object = (id, body) => {
        offsets[id] = size;
        append(id + " 0 obj\n" + body + "\nendobj\n");
      };
      append("%PDF-1.4\n");
      object(1, "<< /Type /Catalog /Pages 2 0 R >>");
      object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
      object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.8898 595.2756] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
      offsets[4] = size;
      append("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + sheet.width + " /Height " + sheet.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
      append(jpeg);
      append("\nendstream\nendobj\n");
      const content = "q\n841.8898 0 0 595.2756 0 0 cm\n/Im0 Do\nQ\n";
      object(5, "<< /Length " + encoder.encode(content).length + " >>\nstream\n" + content + "endstream");
      const xref = size;
      append("xref\n0 6\n0000000000 65535 f \n");
      for (let id = 1; id <= 5; id++) append(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
      append("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
      return new Blob(parts, { type: "application/pdf" });
    }

    function savePdfDrawing() {
      try {
        const sheet = renderDrawingSheet();
        const blob = createPdfBlob(sheet);
        const info = sheetInfo();
        const clean = (value) => String(value || "").replace(/[\\/:*?"<>|]/g, "").trim();
        const pieces = [info.date ? info.date.replace(/-/g, "") : "", "アイソメ図", clean(info.title), clean(info.name)].filter(Boolean);
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = pieces.join("_") + ".pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        hint = "PDFの保存を開始しました";
        draw();
      } catch (error) {
        console.error(error);
        alert("PDFを保存できませんでした。もう一度お試しください。");
      }
    }

    function saveDrawing() {
      const info = sheetInfo();
      const filePart = (value) => String(value || "").replace(/[\\/:*?"<>|]/g, "").trim();
      const date = info.date ? info.date.replace(/-/g, "") : "";
      const pieces = [date, "アイソメ図", filePart(info.title), filePart(info.name)].filter(Boolean);
      const name = (pieces.join("_") || "アイソメ図") + ".json";
      const file = {
        kind: "iso-sheet",
        version: 1,
        title: sheetInfo().title,
        name: sheetInfo().name,
        date: sheetInfo().date,
        referenceMeters: referenceMeters || undefined,
        referenceSegmentIds: referenceSegmentIds.length ? referenceSegmentIds : undefined,
        referenceDiameter: referenceDiameter || undefined,
        diameterOverrides: diameterOverrides.length ? diameterOverrides.map((item) => ({
          segmentIds: [...item.segmentIds],
          diameter: item.diameter
        })) : undefined,
        lengthOverrides: lengthOverrides.length ? lengthOverrides.map((item) => ({
          segmentIds: [...item.segmentIds],
          meters: item.meters
        })) : undefined,
        nodes: nodes.map((node) => ({ id: node.id, i: node.i, j: node.j })),
        segments: segments.map((segment) => ({
          id: segment.id,
          fromId: segment.fromId,
          toId: segment.toId,
          dir: segment.dir
        })),
        symbols: symbols.map((symbol) => ({
          id: symbol.id,
          segmentId: symbol.segmentId,
          type: symbol.type,
          t: symbol.t,
          kind: symbol.type === "start" || symbol.type === "goal" ? endKindOf(symbol) : undefined,
          facing: (symbol.type === "start" || symbol.type === "goal") && endKindOf(symbol) !== "bulk" ? facingOf(symbol) : undefined
        })),
        comments: comments.length ? comments.map((comment) => ({
          id: comment.id,
          text: comment.text,
          segmentId: comment.segmentId || undefined,
          t: comment.segmentId ? comment.t : undefined,
          x: comment.x,
          y: comment.y,
          dx: comment.dx,
          dy: comment.dy
        })) : undefined,
        doubled: doubled || undefined,
        crossings: (() => {
          const saved = loadCrossings(crossings).map((item) => ({
            nodeId: item.nodeId,
            front: item.frontAxis
          }));
          return saved.length ? saved : undefined;
        })(),
        active: { i: active.i, j: active.j }
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      hint = "ダウンロードフォルダに保存しました";
      draw();
    }

    function rememberIds() {
      let max = seq;
      nodes.concat(segments, symbols, comments).forEach((item) => {
        const number = Number(String(item.id).replace(/\D/g, ""));
        if (number > max) max = number;
      });
      seq = max;
    }

    function applyDrawing(data) {
      if (!data || data.kind !== "iso-sheet" || !Array.isArray(data.nodes) || !Array.isArray(data.segments)) {
        hint = "このファイルはアイソメ図として開けません";
        draw();
        return;
      }
      const nextNodes = data.nodes.filter((node) => node && node.id && Number.isFinite(Number(node.i)) && Number.isFinite(Number(node.j))).map((node) => ({
        id: String(node.id),
        i: Number(node.i),
        j: Number(node.j)
      }));
      const nodeIds = new Set(nextNodes.map((node) => node.id));
      const nextSegments = data.segments.filter((segment) => segment && nodeIds.has(String(segment.fromId)) && nodeIds.has(String(segment.toId)) && DIRECTIONS[segment.dir]).map((segment) => ({
        id: String(segment.id),
        fromId: String(segment.fromId),
        toId: String(segment.toId),
        dir: segment.dir
      }));
      const segmentIds = new Set(nextSegments.map((segment) => segment.id));
      const nextSymbols = (Array.isArray(data.symbols) ? data.symbols : []).filter((symbol) => symbol && segmentIds.has(String(symbol.segmentId)) && SYMBOLS[symbol.type]).map((symbol) => {
        const record = {
          id: String(symbol.id),
          segmentId: String(symbol.segmentId),
          type: symbol.type,
          t: symbol.type === "start" || symbol.type === "goal"
            ? (Number(symbol.t) >= 0.5 ? 1 : 0)
            : Math.min(0.82, Math.max(0.18, Number(symbol.t) || 0.5))
        };
        if (symbol.type === "start" || symbol.type === "goal") {
          const kind = symbol.kind === "bulk" || symbol.kind === "burner" || symbol.kind === "pipe" ? symbol.kind : "pipe";
          record.kind = symbol.type === "start" ? (kind === "burner" ? "pipe" : kind) : (kind === "bulk" ? "pipe" : kind);
          if (record.kind !== "bulk" && FACE_DIRS.includes(symbol.facing)) record.facing = symbol.facing;
        }
        return record;
      });
      const previousInfo = sheetInfo();
      pushHistory();
      undoStack[undoStack.length - 1].info = previousInfo;
      nodes = nextNodes;
      segments = nextSegments;
      symbols = nextSymbols;
      comments = loadComments(data.comments);
      active = data.active && Number.isFinite(Number(data.active.i)) && Number.isFinite(Number(data.active.j))
        ? { i: Number(data.active.i), j: Number(data.active.j) }
        : { i: 0, j: 0 };
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentMode = false;
      commentDraft = null;
      moveMode = false;
      movingSegmentIds = new Set();
      rangeMode = false;
      rangeStart = null;
      rangeEnd = null;
      rangeSegmentIds = new Set();
      rememberIds();
      const loadedMeters = Number(data.referenceMeters);
      referenceMeters = Number.isFinite(loadedMeters) && loadedMeters > 0 ? loadedMeters : null;
      referenceSegmentIds = Array.isArray(data.referenceSegmentIds) ? data.referenceSegmentIds.map(String) : [];
      referenceDiameter = cleanDiameter(data.referenceDiameter);
      diameterOverrides = loadDiameterOverrides(data.diameterOverrides);
      lengthOverrides = loadLengthOverrides(data.lengthOverrides);
      crossings = loadCrossings(data.crossings);
      doubled = Math.max(0, Math.floor(Number(data.doubled) || 0));
      setInfo({
        title: data.title,
        name: data.name,
        date: data.date
      });
      hint = "保存した図面を開きました";
      fit();
    }

    function newDrawing() {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const date = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
      const name = sheetInfo().name;
      applyDrawing({ kind: "iso-sheet", nodes: [], segments: [], title: "", name, date });
      labelShifts = new Map();
      symbolDrag = null;
      startKind = "pipe";
      goalKind = "pipe";
      centerOn(0, 0, 56);
      hint = "新しい図面を作成できます（戻すで前の図面に戻れます）";
      draw();
    }

    function openDrawing(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          applyDrawing(JSON.parse(String(reader.result)));
        } catch (error) {
          hint = "このファイルはアイソメ図として開けません";
          draw();
        }
      };
      reader.readAsText(file);
    }

    function undo() {
      hint = "";
      if (!undoStack.length) return;
      const frame = undoStack.pop();
      const redoFrame = { drawing: snapshot() };
      if ("info" in frame) redoFrame.info = sheetInfo();
      redoStack.push(redoFrame);
      restore(frame.drawing);
      if ("info" in frame) setInfo(frame.info);
      revealActive();
      draw();
    }

    function redo() {
      hint = "";
      if (!redoStack.length) return;
      const frame = redoStack.pop();
      const undoFrame = { drawing: snapshot() };
      if ("info" in frame) undoFrame.info = sheetInfo();
      undoStack.push(undoFrame);
      restore(frame.drawing);
      if ("info" in frame) setInfo(frame.info);
      revealActive();
      draw();
    }

    function groupNodeIdSet() {
      const ids = new Set();
      segments.forEach((segment) => {
        if (!movingSegmentIds.has(segment.id)) return;
        ids.add(segment.fromId);
        ids.add(segment.toId);
      });
      return ids;
    }

    function connectedSegmentIds(startId) {
      const byNode = new Map();
      segments.forEach((segment) => {
        [segment.fromId, segment.toId].forEach((id) => {
          if (!byNode.has(id)) byNode.set(id, []);
          byNode.get(id).push(segment.id);
        });
      });
      const seen = new Set();
      const queue = [startId];
      while (queue.length) {
        const id = queue.pop();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const segment = segments.find((item) => item.id === id);
        if (!segment) continue;
        [segment.fromId, segment.toId].forEach((nodeId) => {
          (byNode.get(nodeId) || []).forEach((nextId) => {
            if (!seen.has(nextId)) queue.push(nextId);
          });
        });
      }
      return seen;
    }

    function selectMovingComponent(segmentId) {
      movingSegmentIds = connectedSegmentIds(segmentId);
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentDraft = null;
    }

    function dropBrokenSegments() {
      const seen = new Set();
      const remove = new Set();
      const ordered = segments.filter((segment) => !movingSegmentIds.has(segment.id))
        .concat(segments.filter((segment) => movingSegmentIds.has(segment.id)));
      ordered.forEach((segment) => {
        if (segment.fromId === segment.toId) {
          remove.add(segment.id);
          return;
        }
        const key = segment.fromId < segment.toId
          ? segment.fromId + "|" + segment.toId
          : segment.toId + "|" + segment.fromId;
        if (seen.has(key)) remove.add(segment.id);
        else seen.add(key);
      });
      if (remove.size) {
        segments = segments.filter((segment) => !remove.has(segment.id));
        symbols = symbols.filter((symbol) => !remove.has(symbol.segmentId));
        comments = comments.filter((comment) => !comment.segmentId || !remove.has(comment.segmentId));
        movingSegmentIds = new Set([...movingSegmentIds].filter((id) => !remove.has(id)));
      }
      const used = new Set();
      segments.forEach((segment) => {
        used.add(segment.fromId);
        used.add(segment.toId);
      });
      nodes = nodes.filter((node) => used.has(node.id));
    }

    function moveGroup(dirId) {
      const dir = DIRECTIONS[dirId];
      if (!dir || !movingSegmentIds.size) return;
      const groupNodes = groupNodeIdSet();
      const plan = [];
      groupNodes.forEach((id) => {
        const node = nodeById(id);
        if (!node) return;
        const ni = node.i + dir.di;
        const nj = node.j + dir.dj;
        const occupied = nodeAt(ni, nj);
        plan.push({
          id,
          fromI: node.i,
          fromJ: node.j,
          ni,
          nj,
          mergeInto: occupied && !groupNodes.has(occupied.id) ? occupied.id : null
        });
      });
      pushHistory();
      const joined = plan.some((item) => item.mergeInto);
      const idMap = new Map();
      plan.forEach((item) => {
        if (item.mergeInto) {
          idMap.set(item.id, item.mergeInto);
          return;
        }
        const node = nodeById(item.id);
        node.i = item.ni;
        node.j = item.nj;
        idMap.set(item.id, item.id);
      });
      segments.forEach((segment) => {
        if (!movingSegmentIds.has(segment.id)) return;
        if (idMap.has(segment.fromId)) segment.fromId = idMap.get(segment.fromId);
        if (idMap.has(segment.toId)) segment.toId = idMap.get(segment.toId);
      });
      const startedHere = plan.find((item) => item.fromI === active.i && item.fromJ === active.j);
      if (startedHere) active = { i: startedHere.ni, j: startedHere.nj };
      dropBrokenSegments();
      if (joined) {
        movingSegmentIds = new Set();
        hint = "つなぎました";
      } else {
        hint = "";
      }
      revealActive();
      draw();
    }

    function bridgesFrom(node, groupNodes) {
      const neighbors = [];
      Object.keys(DIRECTIONS).forEach((dirId) => {
        const dir = DIRECTIONS[dirId];
        const occupied = nodeAt(node.i + dir.di, node.j + dir.dj);
        if (occupied && !groupNodes.has(occupied.id) && !edgeBetween(node.id, occupied.id)) {
          neighbors.push({ dirId, node: occupied });
        }
      });
      return neighbors;
    }

    function bridgeChoice() {
      if (!moveMode || !movingSegmentIds.size) return { ok: false, neighbors: [], ambiguous: false };
      const groupNodes = groupNodeIdSet();
      const members = nodes.filter((node) => groupNodes.has(node.id));
      const activeNode = members.find((node) => node.i === active.i && node.j === active.j);
      if (activeNode) {
        const neighbors = bridgesFrom(activeNode, groupNodes);
        if (neighbors.length === 1) return { ok: true, here: activeNode, neighbors, ambiguous: false };
        if (neighbors.length > 1) return { ok: false, neighbors, ambiguous: true };
      }
      const singles = [];
      members.forEach((node) => {
        const neighbors = bridgesFrom(node, groupNodes);
        if (neighbors.length === 1) singles.push({ here: node, neighbors });
      });
      if (singles.length === 1) return { ok: true, here: singles[0].here, neighbors: singles[0].neighbors, ambiguous: false };
      return { ok: false, neighbors: [], ambiguous: singles.length > 1 };
    }

    function joinGap() {
      const choice = bridgeChoice();
      if (!choice.ok) {
        if (!moveMode || !movingSegmentIds.size) hint = "動かす配管をタップしてください";
        else if (choice.ambiguous) hint = "つなぐ端が複数あります。端の交点をタップしてください";
        else hint = "1マス隣に、つなぐ交点がありません";
        draw();
        return;
      }
      const dir = DIRECTIONS[choice.neighbors[0].dirId];
      pushHistory();
      segments.push({
        id: uid(),
        fromId: choice.here.id,
        toId: choice.neighbors[0].node.id,
        dir: dir.id
      });
      movingSegmentIds = new Set();
      hint = "つなぎました";
      revealActive();
      draw();
    }

    function distanceToSegment(point, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
      return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
    }

    function hitTest(point) {
      let nearestNode = null;
      let nodeDistance = 16;
      nodes.forEach((node) => {
        const at = screenOf(node.i, node.j);
        const distance = Math.hypot(point.x - at.x, point.y - at.y);
        if (distance <= nodeDistance) {
          nodeDistance = distance;
          nearestNode = node;
        }
      });
      if (nearestNode && nodeDistance <= 10) {
        return { type: "node", node: nearestNode };
      }
      if (nearestNode && crossingAxes(nearestNode.id) && nodeDistance <= Math.min(16, CROSS_GAP * scale + 8)) {
        return { type: "node", node: nearestNode };
      }
      let nearestSegment = null;
      let segmentDistance = 12;
      segments.forEach((segment) => {
        const from = nodeById(segment.fromId);
        const to = nodeById(segment.toId);
        if (!from || !to) return;
        const distance = distanceToSegment(point, screenOf(from.i, from.j), screenOf(to.i, to.j));
        if (distance <= segmentDistance) {
          segmentDistance = distance;
          nearestSegment = segment;
        }
      });
      if (nearestSegment && (!nearestNode || segmentDistance + 4 < nodeDistance)) {
        return { type: "segment", segment: nearestSegment, point };
      }
      if (nearestNode) return { type: "node", node: nearestNode };
      const worldPoint = worldFromScreen(point.x, point.y);
      const cell = latticeFromWorld(worldPoint.x, worldPoint.y);
      const at = screenOf(cell.i, cell.j);
      if (Math.hypot(point.x - at.x, point.y - at.y) <= 16) {
        return { type: "cell", i: cell.i, j: cell.j };
      }
      return null;
    }

    function nodeFromHit(hit) {
      if (!hit) return null;
      if (hit.type === "node") return hit.node;
      if (hit.type === "cell") return nodeAt(hit.i, hit.j);
      if (hit.type !== "segment") return null;
      const from = nodeById(hit.segment.fromId);
      const to = nodeById(hit.segment.toId);
      if (!from || !to) return null;
      const fromAt = screenOf(from.i, from.j);
      const toAt = screenOf(to.i, to.j);
      return Math.hypot(hit.point.x - toAt.x, hit.point.y - toAt.y) <
        Math.hypot(hit.point.x - fromAt.x, hit.point.y - fromAt.y) ? to : from;
    }

    function pathSegmentIds(startId, endId) {
      if (!startId || !endId || startId === endId) return null;
      const byNode = new Map();
      segments.forEach((segment) => {
        [segment.fromId, segment.toId].forEach((id) => {
          if (!byNode.has(id)) byNode.set(id, []);
          byNode.get(id).push(segment);
        });
      });
      const previous = new Map();
      const queue = [startId];
      const seen = new Set([startId]);
      while (queue.length) {
        const id = queue.shift();
        if (id === endId) break;
        (byNode.get(id) || []).forEach((segment) => {
          const other = segment.fromId === id ? segment.toId : segment.fromId;
          if (seen.has(other)) return;
          seen.add(other);
          previous.set(other, { id: segment.id, from: id });
          queue.push(other);
        });
      }
      if (!previous.has(endId)) return null;
      const ids = [];
      let cursor = endId;
      while (cursor !== startId) {
        const step = previous.get(cursor);
        if (!step) return null;
        ids.push(step.id);
        cursor = step.from;
      }
      return ids;
    }

    function chooseRangeEnd(node) {
      if (!rangeStart) return;
      if (node.id === rangeStart.id) {
        hint = "終点は、始点と別の交点をタップしてください";
        return;
      }
      const path = pathSegmentIds(rangeStart.id, node.id);
      if (!path) {
        hint = "その二つは配管でつながっていません";
        return;
      }
      rangeEnd = { id: node.id, i: node.i, j: node.j };
      rangeSegmentIds = new Set(path);
      active = { i: node.i, j: node.j };
    }

    function selectHit(hit) {
      hint = "";
      commentDraft = null;
      selectedCommentId = null;
      if (!hit) {
        draw();
        return;
      }
      if (rangeMode) {
        selectedSymbolId = null;
        selectedSegmentId = null;
        const node = nodeFromHit(hit);
        if (!node) {
          hint = "配管の端をタップしてください";
          draw();
          return;
        }
        if (!rangeStart || rangeSegmentIds.size) {
          rangeStart = { id: node.id, i: node.i, j: node.j };
          rangeEnd = null;
          rangeSegmentIds = new Set();
          active = { i: node.i, j: node.j };
        } else {
          chooseRangeEnd(node);
        }
        draw();
        return;
      }
      if (moveMode) {
        selectedSymbolId = null;
        selectedSegmentId = null;
        if (hit.type === "segment") {
          selectMovingComponent(hit.segment.id);
          const from = nodeById(hit.segment.fromId);
          const to = nodeById(hit.segment.toId);
          const fromAt = screenOf(from.i, from.j);
          const toAt = screenOf(to.i, to.j);
          const nearer = Math.hypot(hit.point.x - toAt.x, hit.point.y - toAt.y) <
            Math.hypot(hit.point.x - fromAt.x, hit.point.y - fromAt.y) ? to : from;
          active = { i: nearer.i, j: nearer.j };
        } else if (hit.type === "node") {
          active = { i: hit.node.i, j: hit.node.j };
          const touching = segments.find((segment) => segment.fromId === hit.node.id || segment.toId === hit.node.id);
          if (touching) selectMovingComponent(touching.id);
        }
        draw();
        return;
      }
      if (hit.type === "node") {
        active = { i: hit.node.i, j: hit.node.j };
        selectedSegmentId = null;
        selectedSymbolId = null;
        cycleCrossing(hit.node.id);
      } else if (hit.type === "cell") {
        active = { i: hit.i, j: hit.j };
        selectedSegmentId = null;
        selectedSymbolId = null;
      } else if (hit.type === "segment") {
        selectedSegmentId = hit.segment.id;
        selectedSymbolId = null;
        const from = nodeById(hit.segment.fromId);
        const to = nodeById(hit.segment.toId);
        const fromAt = screenOf(from.i, from.j);
        const toAt = screenOf(to.i, to.j);
        const nearer = Math.hypot(hit.point.x - toAt.x, hit.point.y - toAt.y) <
          Math.hypot(hit.point.x - fromAt.x, hit.point.y - fromAt.y) ? to : from;
        active = { i: nearer.i, j: nearer.j };
      }
      draw();
    }

    function closestEndSnap(point) {
      const degree = new Map();
      segments.forEach((segment) => {
        degree.set(segment.fromId, (degree.get(segment.fromId) || 0) + 1);
        degree.set(segment.toId, (degree.get(segment.toId) || 0) + 1);
      });
      let best = null;
      segments.forEach((segment) => {
        [{ id: segment.fromId, t: 0 }, { id: segment.toId, t: 1 }].forEach((end) => {
          if (degree.get(end.id) !== 1) return;
          const node = nodeById(end.id);
          if (!node) return;
          const at = screenOf(node.i, node.j);
          const distance = Math.hypot(point.x - at.x, point.y - at.y);
          if (distance <= 42 && (!best || distance < best.dist)) {
            best = { segmentId: segment.id, t: end.t, dist: distance };
          }
        });
      });
      return best;
    }

    function snapForSymbol(type, point) {
      return type === "start" || type === "goal" ? closestEndSnap(point) : closestSnap(point);
    }

    function closestSnap(point) {
      let best = null;
      segments.forEach((segment) => {
        const ends = segmentEnds(segment);
        if (!ends) return;
        const dx = ends.to.x - ends.from.x;
        const dy = ends.to.y - ends.from.y;
        const length = dx * dx + dy * dy;
        if (!length) return;
        const t = Math.min(0.82, Math.max(0.18, ((point.x - ends.from.x) * dx + (point.y - ends.from.y) * dy) / length));
        const x = ends.from.x + dx * t;
        const y = ends.from.y + dy * t;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= 36 && (!best || distance < best.dist)) {
          best = { segmentId: segment.id, t, dist: distance };
        }
      });
      return best;
    }

    function hitSymbol(point) {
      let fitting = null;
      let flexHit = null;
      symbols.forEach((symbol) => {
        if (symbol.type === "flex") {
          const segment = segments.find((item) => item.id === symbol.segmentId);
          const ends = segment && segmentEnds(segment);
          if (!ends) return;
          const distance = distanceToSegment(point, ends.from, ends.to);
          const endGap = Math.min(
            Math.hypot(point.x - ends.from.x, point.y - ends.from.y),
            Math.hypot(point.x - ends.to.x, point.y - ends.to.y)
          );
          if (distance <= 14 && endGap > 16 && (!flexHit || distance < flexHit.dist)) {
            flexHit = { id: symbol.id, type: symbol.type, dist: distance };
          }
          return;
        }
        const place = placementOf(symbol);
        if (!place) return;
        const distance = Math.hypot(point.x - place.center.x, point.y - place.center.y);
        const reach = endKindOf(symbol) === "bulk" ? 30 : endKindOf(symbol) === "burner" ? 46 : 22;
        if (distance <= reach && (!fitting || distance < fitting.dist)) {
          fitting = { id: symbol.id, type: symbol.type, dist: distance };
        }
      });
      if (fitting && (!flexHit || fitting.dist <= flexHit.dist + 8)) return fitting;
      return flexHit;
    }

    function onSymbolDragMove(event) {
      if (!symbolDrag || event.pointerId !== symbolDrag.pointerId) return;
      const point = localPoint(event);
      if (Math.hypot(point.x - symbolDrag.x, point.y - symbolDrag.y) > 4) symbolDrag.moved = true;
      symbolDrag.x = point.x;
      symbolDrag.y = point.y;
      symbolDrag.snap = snapForSymbol(symbolDrag.type, point);
      const endMode = symbolDrag.type === "start" || symbolDrag.type === "goal";
      hint = symbolDrag.snap
        ? (endMode ? "配管の端で離すと置けます" : "配管の上で離すと置けます")
        : (endMode ? "配管の端に置いてください" : "配管の上に置いてください");
      draw();
    }

    function onSymbolDragEnd(event) {
      if (!symbolDrag || event.pointerId !== symbolDrag.pointerId) return;
      const drag = symbolDrag;
      symbolDrag = null;
      hint = "";
      window.removeEventListener("pointermove", onSymbolDragMove);
      window.removeEventListener("pointerup", onSymbolDragEnd);
      window.removeEventListener("pointercancel", onSymbolDragEnd);
      if (drag.movingId && !drag.moved) {
        selectedSymbolId = drag.movingId;
        draw();
        return;
      }
      if (!drag.snap) {
        const endMode = drag.type === "start" || drag.type === "goal";
        hint = drag.movingId ? "" : (endMode ? "スタートとゴールは、配管の端に置きます" : "記号は配管の上に置きます");
        draw();
        return;
      }
      pushHistory();
      if (drag.type === "flex") {
        symbols = symbols.filter((item) => item.type !== "flex" || item.segmentId !== drag.snap.segmentId || item.id === drag.movingId);
      }
      if (drag.movingId) {
        const symbol = symbols.find((item) => item.id === drag.movingId);
        if (symbol) {
          symbol.segmentId = drag.snap.segmentId;
          symbol.t = drag.type === "flex" ? 0.5 : drag.snap.t;
        }
        selectedSymbolId = drag.movingId;
      } else {
        const id = uid();
        const segment = segments.find((item) => item.id === drag.snap.segmentId);
        const symbol = { id, segmentId: drag.snap.segmentId, type: drag.type, t: drag.type === "flex" ? 0.5 : drag.snap.t };
        if (drag.type === "start" || drag.type === "goal") {
          symbol.kind = drag.kind || "pipe";
          if (symbol.kind !== "bulk") symbol.facing = endFacing(segment, drag.snap.t);
        }
        symbols.push(symbol);
        selectedSymbolId = id;
      }
      selectedSegmentId = null;
      draw();
    }

    function beginSymbolDrag(event, type, movingId, kind) {
      hint = "";
      commentDraft = null;
      selectedCommentId = null;
      event.preventDefault();
      event.stopPropagation();
      const point = localPoint(event);
      const moving = movingId ? symbols.find((item) => item.id === movingId) : null;
      const endMode = type === "start" || type === "goal";
      symbolDrag = {
        pointerId: event.pointerId,
        type,
        movingId,
        kind: endMode ? (kind || endKindOf(moving) || buttonKind(type)) : "",
        x: point.x,
        y: point.y,
        snap: snapForSymbol(type, point),
        moved: false
      };
      if (movingId) selectedSymbolId = movingId;
      selectedSegmentId = null;
      hint = symbolDrag.snap
        ? (endMode ? "配管の端で離すと置けます" : "配管の上で離すと置けます")
        : (endMode ? "配管の端に置いてください" : "配管の上に置いてください");
      window.addEventListener("pointermove", onSymbolDragMove);
      window.addEventListener("pointerup", onSymbolDragEnd);
      window.addEventListener("pointercancel", onSymbolDragEnd);
      draw();
    }

    const pointers = new Map();
    let gesture = null;

    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      hint = "";
      const point = localPoint(event);
      const symbolHit = !commentMode && hitSymbol(point);
      if (symbolHit && pointers.size === 0) {
        beginSymbolDrag(event, symbolHit.type, symbolHit.id);
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, point);
      if (pointers.size === 1) {
        gesture = { kind: "pending", x: point.x, y: point.y, panX, panY, moved: false };
      } else if (pointers.size >= 2) {
        const pts = [...pointers.values()];
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        gesture = {
          kind: "pinch",
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
          scale,
          world: worldFromScreen(midX, midY)
        };
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, localPoint(event));
      if (gesture.kind === "pinch" && pointers.size >= 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, gesture.scale * (dist / gesture.dist)));
        panX = midX - gesture.world.x * scale;
        panY = midY - gesture.world.y * scale;
        draw();
        return;
      }
      const point = pointers.get(event.pointerId);
      const dx = point.x - gesture.x;
      const dy = point.y - gesture.y;
      if (Math.hypot(dx, dy) > 6) gesture.moved = true;
      if (gesture.moved) {
        panX = gesture.panX + dx;
        panY = gesture.panY + dy;
        draw();
      }
    });

    function endPointer(event) {
      const point = pointers.get(event.pointerId);
      pointers.delete(event.pointerId);
      if (gesture && gesture.kind !== "pinch" && point && !gesture.moved && pointers.size === 0) {
        if (commentMode && !moveMode && !rangeMode) beginComment(point);
        else if (!moveMode && !rangeMode) {
          const commentHit = hitComment(point);
          if (commentHit) selectComment(commentHit.id);
          else selectHit(hitTest(point));
        } else selectHit(hitTest(point));
      }
      if (pointers.size === 0) gesture = null;
    }

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = localPoint(event);
      zoomAt(point.x, point.y, event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    function toggleEndKind(type) {
      if (type === "start") startKind = startKind === "bulk" ? "pipe" : "bulk";
      else goalKind = goalKind === "burner" ? "pipe" : "burner";
      const kind = buttonKind(type);
      const button = document.querySelector(`[data-symbol="${type}"]`);
      button.querySelectorAll("[data-kind]").forEach((mark) => {
        mark.classList.toggle("is-off", mark.dataset.kind !== kind);
      });
      hint = type === "start"
        ? (kind === "bulk" ? "スタートはバルクです" : "スタートは配管です")
        : (kind === "burner" ? "ゴールはバーナーです" : "ゴールは配管です");
      draw();
    }

    document.querySelectorAll("[data-symbol]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const type = button.dataset.symbol;
        if (type !== "start" && type !== "goal") {
          beginSymbolDrag(event, type, null);
          return;
        }
        event.preventDefault();
        const origin = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        let dragging = false;
        const move = (ev) => {
          if (ev.pointerId !== origin.pointerId || dragging) return;
          if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) <= 4) return;
          dragging = true;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          beginSymbolDrag(ev, type, null, buttonKind(type));
        };
        const up = (ev) => {
          if (ev.pointerId !== origin.pointerId) return;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          if (!dragging) toggleEndKind(type);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
    });
    function turnSelectedSymbol(dirId) {
      const symbol = selectedSymbolId ? symbols.find((item) => item.id === selectedSymbolId) : null;
      if (!symbol || (symbol.type !== "start" && symbol.type !== "goal")) return false;
      if (endKindOf(symbol) === "bulk") {
        hint = "バルクの向きは変えません";
        draw();
        return true;
      }
      const segment = segments.find((item) => item.id === symbol.segmentId);
      if (!FACE_DIRS.includes(dirId)) {
        hint = "向きは、左・奥・手前・右です";
        draw();
        return true;
      }
      if (facingOf(symbol, segment) === dirId) {
        symbol.facing = dirId;
        hint = "";
        draw();
        return true;
      }
      pushHistory();
      symbol.facing = dirId;
      hint = "";
      draw();
      return true;
    }

    document.querySelectorAll("[data-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        if (rangeMode) {
          if (rangeSegmentIds.size) hint = "削除を押すと、赤い配管が消えます";
          else hint = rangeStart ? "終点をタップしてください" : "削除する範囲の始点をタップしてください";
          draw();
          return;
        }
        if (!moveMode) {
          if (turnSelectedSymbol(button.dataset.dir)) return;
          addDirection(button.dataset.dir);
          return;
        }
        if (!movingSegmentIds.size) {
          hint = "動かす配管をタップしてください";
          draw();
          return;
        }
        moveGroup(button.dataset.dir);
      });
    });
    document.getElementById("moveButton").addEventListener("click", () => {
      moveMode = !moveMode;
      hint = "";
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentDraft = null;
      if (moveMode) {
        rangeMode = false;
        rangeStart = null;
        rangeEnd = null;
        rangeSegmentIds = new Set();
        commentMode = false;
      }
      if (!moveMode) movingSegmentIds = new Set();
      draw();
    });
    document.getElementById("rangeButton").addEventListener("click", () => {
      rangeMode = !rangeMode;
      hint = "";
      selectedSegmentId = null;
      selectedSymbolId = null;
      selectedCommentId = null;
      commentDraft = null;
      rangeStart = null;
      rangeEnd = null;
      rangeSegmentIds = new Set();
      if (rangeMode) {
        moveMode = false;
        movingSegmentIds = new Set();
        commentMode = false;
      }
      draw();
    });
    document.getElementById("joinButton").addEventListener("click", joinGap);
    document.getElementById("deleteButton").addEventListener("click", deleteSelection);
    document.getElementById("doubleButton").addEventListener("click", doubleDrawing);
    document.getElementById("halfButton").addEventListener("click", halfDrawing);
    document.getElementById("undoButton").addEventListener("click", undo);
    document.getElementById("redoButton").addEventListener("click", redo);
    document.getElementById("saveButton").addEventListener("click", saveDrawing);
    document.getElementById("newButton").addEventListener("click", newDrawing);
    document.getElementById("pdfButton").addEventListener("click", savePdfDrawing);
    document.getElementById("printButton").addEventListener("click", printDrawing);
    document.getElementById("openButton").addEventListener("click", () => {
      if ((segments.length || symbols.length || comments.length) && !window.confirm("今の図面を、開くファイルに替えます。")) return;
      document.getElementById("openFile").click();
    });
    document.getElementById("openFile").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) openDrawing(file);
    });
    document.getElementById("zoomInButton").addEventListener("click", () => {
      const at = screenOf(active.i, active.j);
      zoomAt(at.x, at.y, 1.2);
    });
    document.getElementById("zoomOutButton").addEventListener("click", () => {
      zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.55);
    });
    document.getElementById("fitButton").addEventListener("click", () => {
      hint = "";
      fit();
    });
    [titleInput, nameInput].forEach((field) => {
      field.addEventListener("blur", () => {
        const info = sheetInfo();
        if (field === titleInput) titleInput.value = info.title;
        if (field === nameInput) nameInput.value = info.name;
      });
    });
    dateText.addEventListener("input", () => {
      if (!dateText.value.trim()) {
        dateInput.value = "";
        return;
      }
      const iso = parseDateField(dateText.value);
      if (iso) dateInput.value = iso;
    });
    dateText.addEventListener("blur", () => {
      const raw = dateText.value.trim();
      if (!raw) {
        dateInput.value = "";
        dateText.value = "";
        return;
      }
      const iso = parseDateField(raw);
      if (iso) {
        dateInput.value = iso;
        dateText.value = formatDateField(iso);
      } else {
        dateText.value = formatDateField(dateInput.value);
      }
    });
    dateInput.addEventListener("input", () => {
      dateText.value = formatDateField(dateInput.value);
    });
    dateInput.addEventListener("click", () => {
      if (typeof dateInput.showPicker !== "function") return;
      try {
        dateInput.showPicker();
      } catch (error) {}
    });
    lengthInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        lengthInput.blur();
      }
    });
    lengthInput.addEventListener("blur", commitLength);
    diameterInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        diameterInput.blur();
      }
    });
    diameterInput.addEventListener("blur", commitDiameter);
    document.getElementById("commentButton").addEventListener("click", () => {
      commentMode = !commentMode;
      hint = "";
      commentDraft = null;
      selectedCommentId = null;
      selectedSegmentId = null;
      selectedSymbolId = null;
      if (commentMode) {
        moveMode = false;
        movingSegmentIds = new Set();
        rangeMode = false;
        rangeStart = null;
        rangeEnd = null;
        rangeSegmentIds = new Set();
      }
      draw();
    });
    commentInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commentInput.blur();
      }
    });
    commentInput.addEventListener("input", () => {
      if (commentDraft || selectedCommentId) draw();
    });
    commentInput.addEventListener("blur", commitComment);
    (function () {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const iso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
      dateInput.value = iso;
      dateText.value = formatDateField(iso);
    })();
    window.addEventListener("keydown", (event) => {
      const field = document.activeElement;
      if (field && (field.tagName === "INPUT" || field.tagName === "TEXTAREA")) return;
      if (event.key === "z" && (event.ctrlKey || event.metaKey) && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key === "z" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        undo();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      }
    });
    window.addEventListener("resize", resize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(document.documentElement);
    }
    resize();

    api.getState = function () {
      return {
        active: { i: active.i, j: active.j },
        scale,
        panX,
        panY,
        segments: segments.map((segment) => {
          const from = nodeById(segment.fromId);
          const to = nodeById(segment.toId);
          return {
            dir: segment.dir,
            from: from ? { i: from.i, j: from.j } : null,
            to: to ? { i: to.i, j: to.j } : null
          };
        }),
        symbols: symbols.map((symbol) => ({ type: symbol.type, t: symbol.t, segmentId: symbol.segmentId })),
        crossings: loadCrossings(crossings).map((item) => ({ nodeId: item.nodeId, front: item.frontAxis })),
        doubled,
        lengths: straightRuns().map((run) => ({
          cells: run.cells,
          mm: lengthNumber(lengthOf(run)),
          corrected: isLengthCorrected(run),
          reference: isReferenceRun(run),
          from: { i: run.a.i, j: run.a.j },
          to: { i: run.b.i, j: run.b.j }
        }))
      };
    };
    api.addDirection = addDirection;
    api.deleteSelection = deleteSelection;
    api.zoomAt = zoomAt;
  }

  root.IsoSheet = api;
  if (typeof document !== "undefined") boot();
})(globalThis);

