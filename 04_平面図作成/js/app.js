(() => {
  const canvas = document.getElementById("canvas");
  const canvasBefore = document.getElementById("canvasBefore");
  const canvasAfter = document.getElementById("canvasAfter");
  const compareStage = document.getElementById("compareStage");
  const stageWrap = document.querySelector(".stage-wrap");
  const appRoot = document.querySelector(".app");
  const paletteEl = document.getElementById("palette");
  const statusBar = document.getElementById("statusBar");
  const messageEl = document.getElementById("message");
  const inspector = document.getElementById("inspector");
  const selectionLabel = document.getElementById("selectionLabel");
  const editor = document.getElementById("editor");
  const dimFields = document.getElementById("dimFields");
  const nameInput = document.getElementById("nameInput");
  const dimDialog = document.getElementById("dimDialog");
  const dimForm = document.getElementById("dimForm");
  const dialogFields = document.getElementById("dialogFields");
  const dialogName = document.getElementById("dialogName");
  const dialogTitle = document.getElementById("dimDialogTitle");
  const otherShapeFields = document.getElementById("otherShapeFields");
  const dialogShape = document.getElementById("dialogShape");
  const VIEW_PAN_PX = 80;
  const sheetDateText = document.getElementById("sheetDateText");
  const sheetDateInput = document.getElementById("sheetDateInput");
  const sheetTitleInput = document.getElementById("sheetTitleInput");
  const sheetNameInput = document.getElementById("sheetNameInput");
  const openFileInput = document.getElementById("openFile");

  const HISTORY_LIMIT = 50;
  const loaded = loadDocument();
  let project = loaded.doc;
  if (!project.meta) {
    project.meta = emptyMeta();
  }
  let doc = null;
  let selectedPlacementIds = new Set();
  let activeTool = "select"; // select | move
  let pendingType = null;
  let placing = false;
  let pipeStart = null;
  let pipeHover = null;
  let drag = null;
  let labelDrag = null;
  let pan = null;
  let lastLabelClick = null;
  let historyPast = [];
  let historyFuture = [];
  let clipboard = null;
  let clipboardPasteCount = 0;
  const editView = {
    scale: DrawView.scale,
    offsetX: DrawView.offsetX,
    offsetY: DrawView.offsetY
  };
  const compareView = {
    scale: DrawView.scale,
    offsetX: 40,
    offsetY: 40,
    needFit: true,
    pan: null
  };

  bindActivePage(false);
  buildPalette();
  bindChrome();
  bindSheetInfo();
  bindCanvas();
  applySheetInfoToForm();
  fitSiteToCanvas(canvas, project.site);
  snapshotEditView();
  canvas.style.cursor = "grab";
  if (loaded.warning) {
    setMessage(loaded.warning);
  } else {
    setMessage("空き場所をドラッグで図面を移動できます。");
  }
  refresh();
  updateHistoryButtons();
  updatePageChrome();

  function bindActivePage(clearHistory) {
    if (project.activePage === PAGE_COMPARE) {
      doc = workDocFromProject(project, PAGE_BEFORE);
    } else if (project.activePage === PAGE_AFTER && hasAfterPage(project)) {
      doc = workDocFromProject(project, PAGE_AFTER);
    } else {
      project.activePage = PAGE_BEFORE;
      doc = workDocFromProject(project, PAGE_BEFORE);
    }
    selectedPlacementIds = new Set();
    pendingType = null;
    placing = false;
    pipeStart = null;
    pipeHover = null;
    drag = null;
    pan = null;
    labelDrag = null;
    lastLabelClick = null;
    placePendingAt._lastValues = null;
    clearPalettePressed();
    if (clearHistory) {
      historyPast = [];
      historyFuture = [];
      updateHistoryButtons();
    }
  }

  function snapshotEditView() {
    editView.scale = DrawView.scale;
    editView.offsetX = DrawView.offsetX;
    editView.offsetY = DrawView.offsetY;
  }

  function restoreEditView() {
    DrawView.scale = editView.scale;
    DrawView.offsetX = editView.offsetX;
    DrawView.offsetY = editView.offsetY;
  }

  function isCompareMode() {
    return project.activePage === PAGE_COMPARE;
  }

  function isEditablePage() {
    return project.activePage === PAGE_BEFORE || project.activePage === PAGE_AFTER;
  }

  function isEditingBeforePage() {
    return project.activePage === PAGE_BEFORE
      && doc
      && project.pages.before
      && doc.drawing === project.pages.before.drawing;
  }

  function buildPalette() {
    paletteEl.innerHTML = "";
    EQUIPMENT_TYPES.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-btn";
      button.dataset.type = item.type;
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = iconSvg(item.icon) + `<span class="label">${item.label}</span>`;
      button.addEventListener("click", () => openDimensionDialog(item.type));
      paletteEl.appendChild(button);
    });
  }

  function bindChrome() {
    document.getElementById("pageBefore").addEventListener("click", () => switchPage(PAGE_BEFORE));
    document.getElementById("pageAfter").addEventListener("click", () => {
      if (!hasAfterPage(project)) {
        createAfterPage();
        return;
      }
      switchPage(PAGE_AFTER);
    });
    document.getElementById("pageCompare").addEventListener("click", () => {
      if (!hasAfterPage(project)) {
        setMessage("先にアフターをコピー作成してください。");
        return;
      }
      switchPage(PAGE_COMPARE);
    });
    document.getElementById("copyAfterButton").addEventListener("click", () => createAfterPage());
    document.getElementById("openButton").addEventListener("click", () => openFileInput.click());
    document.getElementById("saveButton").addEventListener("click", () => downloadDrawingFile());
    document.getElementById("pdfButton").addEventListener("click", downloadDrawingPdf);
    document.getElementById("printButton").addEventListener("click", () => printDrawing());
    openFileInput.addEventListener("change", () => {
      const file = openFileInput.files && openFileInput.files[0];
      openFileInput.value = "";
      if (file) {
        openDrawingFile(file);
      }
    });

    document.getElementById("toolSelect").addEventListener("click", () => setTool("select"));
    document.getElementById("toolMove").addEventListener("click", () => setTool("move"));
    document.getElementById("fitButton").addEventListener("click", () => {
      if (isCompareMode()) {
        compareView.needFit = true;
        refresh();
        setMessage("比較画面を全体表示に合わせました（左右同じ拡大）。");
        return;
      }
      fitSiteToCanvas(canvas, project.site);
      snapshotEditView();
      refresh();
    });
    document.getElementById("zoomInButton").addEventListener("click", () => {
      if (isCompareMode()) {
        zoomCompareAt(1.25, canvasBefore.clientWidth / 2, canvasBefore.clientHeight / 2);
        refresh();
        return;
      }
      zoomAt(canvas, 1.25, canvas.clientWidth / 2, canvas.clientHeight / 2);
      snapshotEditView();
      refresh();
    });
    document.getElementById("zoomOutButton").addEventListener("click", () => {
      if (isCompareMode()) {
        zoomCompareAt(0.8, canvasBefore.clientWidth / 2, canvasBefore.clientHeight / 2);
        refresh();
        return;
      }
      zoomAt(canvas, 0.8, canvas.clientWidth / 2, canvas.clientHeight / 2);
      snapshotEditView();
      refresh();
    });
    document.getElementById("undoButton").addEventListener("click", undoChange);
    document.getElementById("redoButton").addEventListener("click", redoChange);
    document.getElementById("deleteButton").addEventListener("click", deleteSelected);
    document.getElementById("groupButton").addEventListener("click", groupSelected);
    document.getElementById("ungroupButton").addEventListener("click", ungroupSelected);
    document.getElementById("copyButton").addEventListener("click", copySelected);
    document.getElementById("pasteButton").addEventListener("click", pasteClipboard);
    document.getElementById("frontButton").addEventListener("click", () => bringSelection("front"));
    document.getElementById("backButton").addEventListener("click", () => bringSelection("back"));
    document.getElementById("applyDimsButton").addEventListener("click", applyEditorDims);
    document.getElementById("resetLabelsButton").addEventListener("click", resetSelectedLabels);
    document.getElementById("moveUp").addEventListener("click", () => nudge(0, -MOVE_STEP_MM));
    document.getElementById("moveDown").addEventListener("click", () => nudge(0, MOVE_STEP_MM));
    document.getElementById("moveLeft").addEventListener("click", () => nudge(-MOVE_STEP_MM, 0));
    document.getElementById("moveRight").addEventListener("click", () => nudge(MOVE_STEP_MM, 0));
    document.getElementById("panUp").addEventListener("click", () => panView(0, VIEW_PAN_PX));
    document.getElementById("panDown").addEventListener("click", () => panView(0, -VIEW_PAN_PX));
    document.getElementById("panLeft").addEventListener("click", () => panView(VIEW_PAN_PX, 0));
    document.getElementById("panRight").addEventListener("click", () => panView(-VIEW_PAN_PX, 0));

    document.getElementById("dimCancelButton").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDimensionDialogCanceled();
    });

    // Esc やダイアログ閉じでも、未入力チェックは出さずそのまま閉じる
    dimDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDimensionDialogCanceled();
    });
    dimDialog.addEventListener("close", () => {
      if (dimDialog.returnValue === "ok") {
        return;
      }
      // close 後の後始末（状態だけ戻す。メッセージは出さない）
      pendingType = null;
      placing = false;
      placePendingAt._lastValues = null;
      clearPalettePressed();
    });

    // Enter / 配置 で確定（未入力チェックはここだけ）
    dimForm.addEventListener("submit", (event) => {
      event.preventDefault();
      confirmDimensionDialog();
    });

    // 右下の寸法パネルでも Enter で反映
    inspector.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      if (!event.target || !["INPUT", "SELECT"].includes(event.target.tagName)) {
        return;
      }
      event.preventDefault();
      applyEditorDims();
    });

    window.addEventListener("resize", () => {
      if (isCompareMode()) {
        compareView.needFit = true;
      }
      refresh();
    });
    window.addEventListener("keydown", (event) => {
      if (dimDialog.open) {
        return;
      }
      if (isCompareMode()) {
        return;
      }
      const typing = document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if (event.key === "Escape" && !typing) {
        if (cancelPipeDraft()) {
          event.preventDefault();
          return;
        }
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && (event.key === "z" || event.key === "Z")) {
        if (typing) {
          return;
        }
        event.preventDefault();
        if (event.shiftKey) {
          redoChange();
        } else {
          undoChange();
        }
        return;
      }
      if (mod && (event.key === "y" || event.key === "Y")) {
        if (typing) {
          return;
        }
        event.preventDefault();
        redoChange();
        return;
      }
      if (mod && (event.key === "c" || event.key === "C")) {
        if (typing) {
          return;
        }
        if (!selectedPlacementIds.size) {
          return;
        }
        event.preventDefault();
        copySelected();
        return;
      }
      if (mod && (event.key === "v" || event.key === "V")) {
        if (typing) {
          return;
        }
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (!selectedPlacementIds.size) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (typing) {
          return;
        }
        event.preventDefault();
        deleteSelected();
      } else if (typing) {
        return;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudge(0, -MOVE_STEP_MM);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudge(0, MOVE_STEP_MM);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudge(-MOVE_STEP_MM, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudge(MOVE_STEP_MM, 0);
      }
    });
  }

  function cloneProject(source) {
    return JSON.parse(JSON.stringify(source));
  }

  function pushHistory() {
    historyPast.push(cloneProject(project));
    if (historyPast.length > HISTORY_LIMIT) {
      historyPast.shift();
    }
    historyFuture = [];
    updateHistoryButtons();
  }

  function pruneSelection() {
    if (!doc) {
      selectedPlacementIds = new Set();
      return;
    }
    const valid = new Set((doc.drawing.placements || []).map((item) => item.id));
    selectedPlacementIds = new Set(Array.from(selectedPlacementIds).filter((id) => valid.has(id)));
  }

  function updateHistoryButtons() {
    const undoBtn = document.getElementById("undoButton");
    const redoBtn = document.getElementById("redoButton");
    const canEdit = isEditablePage();
    if (undoBtn) {
      undoBtn.disabled = !canEdit || historyPast.length === 0;
    }
    if (redoBtn) {
      redoBtn.disabled = !canEdit || historyFuture.length === 0;
    }
  }

  function undoChange() {
    if (!isEditablePage() || !historyPast.length) {
      return;
    }
    historyFuture.push(cloneProject(project));
    project = historyPast.pop();
    if (!project.meta) {
      project.meta = emptyMeta();
    }
    bindActivePage(false);
    pruneSelection();
    applySheetInfoToForm();
    persist();
    refresh();
    updateHistoryButtons();
    updatePageChrome();
    setMessage("戻しました。");
  }

  function redoChange() {
    if (!isEditablePage() || !historyFuture.length) {
      return;
    }
    historyPast.push(cloneProject(project));
    if (historyPast.length > HISTORY_LIMIT) {
      historyPast.shift();
    }
    project = historyFuture.pop();
    if (!project.meta) {
      project.meta = emptyMeta();
    }
    bindActivePage(false);
    pruneSelection();
    applySheetInfoToForm();
    persist();
    refresh();
    updateHistoryButtons();
    updatePageChrome();
    setMessage("やり直しました。");
  }

  function switchPage(page) {
    if (page === PAGE_AFTER && !hasAfterPage(project)) {
      createAfterPage();
      return;
    }
    if (page === PAGE_COMPARE && !hasAfterPage(project)) {
      setMessage("先にアフターをコピー作成してください。");
      return;
    }
    if (project.activePage === page) {
      return;
    }
    if (isEditablePage()) {
      snapshotEditView();
    }
    let mirror = { added: 0, mirrored: 0, removed: 0 };
    if ((page === PAGE_AFTER || page === PAGE_COMPARE) && hasAfterPage(project)) {
      mirror = mirrorBeforeToAfter(project);
    }
    project.activePage = page;
    // ページ切替では履歴を消さない（誤って作り直したあと「戻る」で復元できるようにする）
    bindActivePage(false);
    if (isEditablePage()) {
      restoreEditView();
    }
    persist();
    refresh();
    updatePageChrome();
    if (page === PAGE_COMPARE) {
      compareView.needFit = true;
    }
    if (page === PAGE_BEFORE) {
      setMessage("ビフォア（現状）を表示しています。");
    } else if (page === PAGE_AFTER) {
      setMessage(describeMirrorResult(mirror, "アフターを表示しています。削除・移動・追加はアフター側の操作として残ります。"));
    } else {
      setMessage(describeMirrorResult(mirror, "左右比較：同じ拡大で全体表示しています。拡大・全体・矢印は左右共通です。"));
    }
  }

  function describeMirrorResult(mirror, fallback) {
    const parts = [];
    if (mirror && mirror.added > 0) {
      parts.push("追加" + mirror.added + "件");
    }
    if (mirror && mirror.mirrored > 0) {
      parts.push("映し出し" + mirror.mirrored + "件");
    }
    if (mirror && mirror.removed > 0) {
      parts.push("削除反映" + mirror.removed + "件");
    }
    if (!parts.length) {
      return fallback;
    }
    return "ビフォアをアフターへ反映しました（" + parts.join("・") + "）。";
  }

  function createAfterPage() {
    if (hasAfterPage(project)) {
      switchPage(PAGE_AFTER);
      setMessage("アフターは既にあります。ビフォアで増やした設備は自動で追記されます。");
      return;
    }
    pushHistory();
    createAfterFromBefore(project);
    project.activePage = PAGE_AFTER;
    bindActivePage(false);
    historyFuture = [];
    updateHistoryButtons();
    restoreEditView();
    persist();
    refresh();
    updatePageChrome();
    setMessage("アフターを作成しました。ここから削除・追加できます。ビフォアへ追加した設備は自動で追記されます。");
  }

  function updatePaletteColors() {
    const tone = project.activePage === PAGE_AFTER ? "emphasis" : "muted";
    paletteEl.querySelectorAll(".palette-btn").forEach((button) => {
      const def = equipmentTypeOf(button.dataset.type);
      const fill = emphasisFill(def.fill, tone, def.type);
      // Match the unselected canvas equipment, including its opacity on white.
      button.style.setProperty("--equipment-fill", tone === "muted" ? mixHexWithWhite(fill, 0.1) : fill);
      button.style.setProperty("--equipment-stroke", emphasisStroke(def.stroke, tone, false, def.type));
    });
  }

  function updatePageChrome() {
    updatePaletteColors();
    const hasAfter = hasAfterPage(project);
    const compare = isCompareMode();
    document.getElementById("pageBefore").setAttribute("aria-pressed", project.activePage === PAGE_BEFORE ? "true" : "false");
    document.getElementById("pageAfter").setAttribute("aria-pressed", project.activePage === PAGE_AFTER ? "true" : "false");
    document.getElementById("pageCompare").setAttribute("aria-pressed", compare ? "true" : "false");
    document.getElementById("pageCompare").disabled = !hasAfter;
    document.getElementById("copyAfterButton").hidden = hasAfter;
    document.getElementById("copyAfterButton").textContent = "Copy";
    compareStage.hidden = !compare;
    stageWrap.classList.toggle("is-compare", compare);
    appRoot.classList.toggle("is-compare", compare);
    canvas.style.visibility = compare ? "hidden" : "visible";
  }

  function primarySelectedId() {
    const first = selectedPlacementIds.values().next();
    return first.done ? null : first.value;
  }

  function selectedPlacements() {
    return Array.from(selectedPlacementIds)
      .map((id) => findPlacement(doc, id))
      .filter(Boolean);
  }

  function setSelection(ids) {
    selectedPlacementIds = new Set(ids.filter(Boolean));
  }

  function selectRelated(placementId, additive) {
    const group = findGroupByPlacement(doc, placementId);
    if (additive) {
      if (selectedPlacementIds.has(placementId)) {
        selectedPlacementIds.delete(placementId);
      } else {
        selectedPlacementIds.add(placementId);
      }
      return;
    }
    if (group) {
      setSelection(group.placementIds.slice());
    } else {
      setSelection([placementId]);
    }
  }

  function closeDimensionDialogCanceled() {
    pendingType = null;
    placing = false;
    pipeStart = null;
    pipeHover = null;
    placePendingAt._lastValues = null;
    clearPalettePressed();
    setMessage("");
    canvas.style.cursor = "grab";
    if (dimDialog.open) {
      dimDialog.close("cancel");
    }
  }

  function confirmDimensionDialog() {
    if (!pendingType) {
      return false;
    }
    const values = readDialogValues();
    const missing = requiredDimsPresent(pendingType, values);
    if (!values.name) {
      setMessage("名称を入力してください。");
      return false;
    }
    if (missing.length) {
      setMessage("必須寸法が未入力です: " + missing.join("、"));
      return false;
    }
    placePendingAt._lastValues = values;
    dimDialog.returnValue = "ok";
    dimDialog.close("ok");
    placing = true;
    pipeStart = null;
    pipeHover = null;
    if (isLinePlaceType(pendingType)) {
      setMessage("始点をクリックしてください。やめるときは Esc。");
    } else {
      setMessage("作図エリアをクリックして配置位置を決めてください。");
    }
    canvas.style.cursor = "crosshair";
    return true;
  }

  function bindCanvas() {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (isCompareMode()) {
        return;
      }
      const factor = event.deltaY < 0 ? 1.12 : 0.9;
      const rect = canvas.getBoundingClientRect();
      zoomAt(canvas, factor, event.clientX - rect.left, event.clientY - rect.top);
      snapshotEditView();
      refresh();
    }, { passive: false });

    [canvasBefore, canvasAfter].forEach((target) => {
      target.addEventListener("wheel", (event) => {
        if (!isCompareMode()) {
          return;
        }
        event.preventDefault();
        const factor = event.deltaY < 0 ? 1.12 : 0.9;
        const rect = target.getBoundingClientRect();
        zoomCompareAt(factor, event.clientX - rect.left, event.clientY - rect.top);
        refresh();
      }, { passive: false });
      target.addEventListener("pointerdown", (event) => {
        if (!isCompareMode() || event.button !== 0) {
          return;
        }
        target.setPointerCapture(event.pointerId);
        const rect = target.getBoundingClientRect();
        compareView.pan = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          ox: compareView.offsetX,
          oy: compareView.offsetY
        };
        target.style.cursor = "grabbing";
      });
      target.addEventListener("pointermove", (event) => {
        if (!compareView.pan) {
          return;
        }
        const rect = target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        compareView.offsetX = compareView.pan.ox + (x - compareView.pan.x);
        compareView.offsetY = compareView.pan.oy + (y - compareView.pan.y);
        refresh();
      });
      target.addEventListener("pointerup", () => {
        compareView.pan = null;
        target.style.cursor = "grab";
      });
      target.addEventListener("pointercancel", () => {
        compareView.pan = null;
        target.style.cursor = "grab";
      });
    });
  }

  function openDimensionDialog(type) {
    if (!isEditablePage()) {
      setMessage("比較表示中は編集できません。ビフォアまたはアフターを選んでください。");
      return;
    }
    pendingType = type;
    placing = false;
    clearPalettePressed();
    const btn = paletteEl.querySelector(`[data-type="${type}"]`);
    if (btn) {
      btn.setAttribute("aria-pressed", "true");
    }
    const def = equipmentTypeOf(type);
    dialogTitle.textContent = def.label + "の寸法入力";
    dialogName.value = def.label;
    dialogFields.innerHTML = "";
    def.fields.forEach((field) => {
      dialogFields.appendChild(buildField(field, ""));
    });
    const note = dimDialog.querySelector(".dialog-note");
    if (note) {
      note.textContent = isLinePlaceType(type)
        ? "太さは数字のみ（例: 25）。Aは欄外に表示。空欄＝未確認。長さは始点〜終点から自動です。"
        : "空欄＝未確認（推測しません）";
    }
    otherShapeFields.hidden = !def.allowsCustomShape;
    if (def.allowsCustomShape) {
      dialogShape.value = "rect";
    }
    if (typeof dimDialog.showModal === "function") {
      dimDialog.showModal();
      const firstSize = dialogFields.querySelector("input");
      if (firstSize) {
        firstSize.focus();
        firstSize.select();
      }
    } else {
      setMessage("このブラウザはダイアログに対応していません。");
    }
  }

  function readDialogValues() {
    const values = { name: dialogName.value.trim() };
    const def = equipmentTypeOf(pendingType);
    def.fields.forEach((field) => {
      const input = document.getElementById("dlg_" + field.key);
      values[field.key] = input ? input.value : "";
    });
    if (def.allowsCustomShape) {
      values.shape = dialogShape.value;
    }
    return values;
  }

  function buildField(field, value) {
    const label = document.createElement("label");
    label.appendChild(document.createTextNode(shortDimLabel(field)));
    if (field.key === "heightMm") {
      label.classList.add("field-height");
    }
    const input = document.createElement("input");
    input.id = "dlg_" + field.key;
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.title = field.unitSuffix
      ? (field.label + "（数字のみ。" + field.unitSuffix + "は欄外）" + (field.required ? "" : "／未確認可"))
      : (field.label + (field.required ? "" : "（任意・未確認可）"));
    input.placeholder = field.unitSuffix
      ? "例: 25"
      : (field.key === "heightMm"
        ? "未確認可"
        : (field.required ? "mm" : "未確認"));
    input.value = value == null || value === "" ? "" : String(value);
    // required は付けない（やめる時にブラウザの未入力警告が出ないようにする）
    if (field.unitSuffix) {
      const row = document.createElement("span");
      row.className = "unit-input-row";
      row.appendChild(input);
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = field.unitSuffix;
      row.appendChild(suffix);
      label.appendChild(row);
    } else {
      label.appendChild(input);
    }
    return label;
  }

  function shortDimLabel(field) {
    if (field && field.unitSuffix === "A") {
      return "太さ";
    }
    const map = {
      widthMm: "幅",
      depthMm: "奥行",
      heightMm: "高さ",
      lengthMm: "長さ",
      diameterMm: "直径",
      burialDepthMm: "深さ"
    };
    return map[field.key] || String(field.label || "").replace("（mm）", "");
  }

  function placePendingAt(xMm, yMm) {
    const type = pendingType;
    const cached = placePendingAt._lastValues;
    if (!type || !cached) {
      return;
    }
    pushHistory();
    const equipment = createEquipment(type, cached);
    const placement = createPlacement(equipment.id, xMm, yMm);
    clampPlacementToSite(placement, equipment, doc.site);
    doc.equipment.push(equipment);
    doc.drawing.placements.push(placement);
    setSelection([placement.id]);
    pendingType = null;
    placing = false;
    pipeStart = null;
    pipeHover = null;
    placePendingAt._lastValues = null;
    clearPalettePressed();
    canvas.style.cursor = "grab";
    let mirror = null;
    if (isEditingBeforePage() && hasAfterPage(project)) {
      mirror = mirrorBeforeToAfter(project);
    }
    persist();
    refresh();
    setMessage(mirror && mirror.added > 0
      ? equipment.name + " を配置し、アフターにも映し出しました。"
      : equipment.name + " を配置しました。");
  }

  function handlePipePlaceClick(xMm, yMm) {
    const type = pendingType;
    const cached = placePendingAt._lastValues;
    if (!type || !cached || !isLinePlaceType(type)) {
      return;
    }
    const point = { xMm: snapMm(xMm), yMm: snapMm(yMm) };
    if (!pipeStart) {
      pipeStart = point;
      pipeHover = point;
      setMessage("終点をクリックしてください。やめるときは Esc。");
      refresh();
      return;
    }
    const length = Math.round(Math.hypot(point.xMm - pipeStart.xMm, point.yMm - pipeStart.yMm));
    if (length < MOVE_STEP_MM) {
      setMessage("始点と終点が近すぎます。もう一度終点をクリックしてください。");
      return;
    }
    pushHistory();
    const equipment = createEquipment(type, cached);
    const placement = createPipePlacement(equipment.id, pipeStart.xMm, pipeStart.yMm, point.xMm, point.yMm);
    clampPlacementToSite(placement, equipment, doc.site);
    syncPipeDimensions(equipment, placement);
    doc.equipment.push(equipment);
    doc.drawing.placements.push(placement);
    setSelection([placement.id]);
    pendingType = null;
    placing = false;
    pipeStart = null;
    pipeHover = null;
    placePendingAt._lastValues = null;
    clearPalettePressed();
    canvas.style.cursor = "grab";
    let mirror = null;
    if (isEditingBeforePage() && hasAfterPage(project)) {
      mirror = mirrorBeforeToAfter(project);
    }
    persist();
    refresh();
    const dia = equipment.dimensions.diameterMm;
    const sizeText = "長さ " + formatMm(equipment.dimensions.lengthMm) +
      "／太さ " + (dia != null ? dia + "A" : "未確認");
    setMessage(mirror && mirror.added > 0
      ? equipment.name + " を配置し、アフターにも映し出しました（" + sizeText + "）。"
      : equipment.name + " を配置しました（" + sizeText + "）。");
  }

  function cancelPipeDraft() {
    if (!placing && !pipeStart) {
      return false;
    }
    pendingType = null;
    placing = false;
    pipeStart = null;
    pipeHover = null;
    placePendingAt._lastValues = null;
    clearPalettePressed();
    canvas.style.cursor = "grab";
    setMessage("配管の配置をやめました。");
    refresh();
    return true;
  }

  function onPointerDown(event) {
    if (!isEditablePage() || !doc) {
      return;
    }
    const pos = pointerPos(event);
    canvas.setPointerCapture(event.pointerId);

    if (placing && pendingType) {
      const world = screenToWorld(pos.x, pos.y);
      if (isLinePlaceType(pendingType)) {
        handlePipePlaceClick(world.xMm, world.yMm);
      } else {
        placePendingAt(world.xMm, world.yMm);
      }
      return;
    }

    // 中クリック／Alt＋ドラッグで図面を移動
    if (event.button === 1 || event.altKey) {
      startPan(pos);
      return;
    }

    // 寸法・名称ラベルを優先して掴む（手動で逃がせる）
    const labelHit = hitTestLabel(pos.x, pos.y);
    if (labelHit) {
      const now = Date.now();
      if (
        lastLabelClick &&
        lastLabelClick.placementId === labelHit.placementId &&
        lastLabelClick.key === labelHit.key &&
        now - lastLabelClick.at < 400
      ) {
        // ダブルクリックでそのラベル位置をリセット
        const placement = findPlacement(doc, labelHit.placementId);
        if (placement) {
          pushHistory();
          setLabelOffset(placement, labelHit.key, 0, 0);
          persist();
          setMessage("ラベル位置を戻しました。");
        }
        lastLabelClick = null;
        labelDrag = null;
        refresh();
        return;
      }
      lastLabelClick = { placementId: labelHit.placementId, key: labelHit.key, at: now };
      selectRelated(labelHit.placementId, event.shiftKey);
      if (!event.shiftKey) {
        const scale = DrawView.scale || 0.012;
        pushHistory();
        labelDrag = {
          placementId: labelHit.placementId,
          key: labelHit.key,
          startX: pos.x,
          startY: pos.y,
          originDxMm: (labelHit.x + labelHit.autoDxPx - labelHit.baseX) / scale,
          originDyMm: (labelHit.y + labelHit.autoDyPx - labelHit.baseY) / scale,
          moved: false
        };
        canvas.style.cursor = "grabbing";
      }
      refresh();
      return;
    }

    const hit = hitTest(doc, pos.x, pos.y);
    if (hit) {
      selectRelated(hit.id, event.shiftKey);
      if (!event.shiftKey && (activeTool === "move" || activeTool === "select")) {
        const world = screenToWorld(pos.x, pos.y);
        const moving = selectedPlacements();
        pushHistory();
        drag = {
          startX: world.xMm,
          startY: world.yMm,
          origins: moving.map((item) => ({
            id: item.id,
            xMm: item.xMm,
            yMm: item.yMm,
            endXMm: item.endXMm,
            endYMm: item.endYMm
          })),
          moved: false
        };
        canvas.style.cursor = "grabbing";
      }
      refresh();
      return;
    }

    if (!event.shiftKey) {
      setSelection([]);
    }
    startPan(pos);
    refresh();
  }

  function startPan(pos) {
    restoreEditView();
    pan = { x: pos.x, y: pos.y, ox: DrawView.offsetX, oy: DrawView.offsetY };
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(event) {
    const pos = pointerPos(event);
    if (placing && pendingType && isLinePlaceType(pendingType) && pipeStart) {
      const world = screenToWorld(pos.x, pos.y);
      pipeHover = { xMm: snapMm(world.xMm), yMm: snapMm(world.yMm) };
      refresh();
      return;
    }
    if (labelDrag) {
      const placement = findPlacement(doc, labelDrag.placementId);
      if (!placement) {
        return;
      }
      const scale = DrawView.scale || 0.012;
      const dxMm = labelDrag.originDxMm + (pos.x - labelDrag.startX) / scale;
      const dyMm = labelDrag.originDyMm + (pos.y - labelDrag.startY) / scale;
      if (Math.abs(pos.x - labelDrag.startX) > 2 || Math.abs(pos.y - labelDrag.startY) > 2) {
        labelDrag.moved = true;
      }
      setLabelOffset(placement, labelDrag.key, dxMm, dyMm);
      refresh();
      return;
    }
    if (drag) {
      const world = screenToWorld(pos.x, pos.y);
      const dx = world.xMm - drag.startX;
      const dy = world.yMm - drag.startY;
      const moving = drag.origins
        .map((origin) => {
          const placement = findPlacement(doc, origin.id);
          if (!placement) {
            return null;
          }
          placement.xMm = origin.xMm;
          placement.yMm = origin.yMm;
          if (origin.endXMm != null || origin.endYMm != null) {
            placement.endXMm = origin.endXMm;
            placement.endYMm = origin.endYMm;
          }
          return placement;
        })
        .filter(Boolean);
      if (dx !== 0 || dy !== 0) {
        drag.moved = true;
      }
      movePlacementsBy(doc, moving, dx, dy, doc.site);
      refresh();
      return;
    }
    if (pan) {
      DrawView.offsetX = pan.ox + (pos.x - pan.x);
      DrawView.offsetY = pan.oy + (pos.y - pan.y);
      snapshotEditView();
      refresh();
    }
  }

  function onPointerUp() {
    if (labelDrag) {
      if (!labelDrag.moved && historyPast.length) {
        historyPast.pop();
        updateHistoryButtons();
      } else if (labelDrag.moved) {
        persist();
        setMessage("ラベルを動かしました。点線が寸法の基準線につながります。");
      }
      labelDrag = null;
      refresh();
    }
    if (drag) {
      if (!drag.moved && historyPast.length) {
        // クリックだけで動かしていない場合は履歴を戻す
        historyPast.pop();
        updateHistoryButtons();
      } else if (drag.moved) {
        const moved = drag.origins
          .map((origin) => findPlacement(doc, origin.id))
          .filter(Boolean);
        if (project.activePage === PAGE_AFTER) {
          detachAfterPlacements(moved);
          persist();
          setMessage("アフターで移動しました。この設備はビフォアの変更に追従しません。");
        } else if (isEditingBeforePage() && hasAfterPage(project)) {
          const mirror = mirrorBeforeToAfter(project);
          persist();
          setMessage(mirror.mirrored > 0
            ? "ビフォアを移動し、追従中のアフター設備へ映し出しました。"
            : "ビフォアを移動しました。");
        } else {
          persist();
        }
      }
      drag = null;
      refresh();
    }
    if (pan) {
      snapshotEditView();
      pan = null;
    }
    canvas.style.cursor = "grab";
  }

  function resetSelectedLabels() {
    const ids = Array.from(selectedPlacementIds);
    if (!ids.length) {
      setMessage("設備を選んでからリセットしてください。");
      return;
    }
    pushHistory();
    ids.forEach((id) => {
      const placement = findPlacement(doc, id);
      if (placement) {
        clearLabelOffsets(placement);
      }
    });
    persist();
    refresh();
    setMessage("選択中のラベル位置を初期位置に戻しました。");
  }

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function setTool(tool) {
    activeTool = tool;
    document.getElementById("toolSelect").setAttribute("aria-pressed", tool === "select" ? "true" : "false");
    document.getElementById("toolMove").setAttribute("aria-pressed", tool === "move" ? "true" : "false");
    canvas.style.cursor = "grab";
  }

  function panView(dxPx, dyPx) {
    if (isCompareMode()) {
      compareView.offsetX += dxPx;
      compareView.offsetY += dyPx;
      refresh();
      return;
    }
    DrawView.offsetX += dxPx;
    DrawView.offsetY += dyPx;
    snapshotEditView();
    refresh();
  }

  function nudge(dx, dy) {
    if (!isEditablePage()) {
      return;
    }
    const moving = selectedPlacements();
    if (!moving.length) {
      return;
    }
    pushHistory();
    movePlacementsBy(doc, moving, dx, dy, doc.site);
    if (project.activePage === PAGE_AFTER) {
      detachAfterPlacements(moving);
      persist();
      refresh();
      setMessage("アフターで移動しました。この設備はビフォアの変更に追従しません。");
      return;
    }
    if (isEditingBeforePage() && hasAfterPage(project)) {
      const mirror = mirrorBeforeToAfter(project);
      persist();
      refresh();
      setMessage(mirror.mirrored > 0
        ? "ビフォアを移動し、追従中のアフター設備へ映し出しました。"
        : "ビフォアを移動しました。");
      return;
    }
    persist();
    refresh();
  }

  function copySelected() {
    if (!isEditablePage() || !doc) {
      setMessage("比較表示中はコピーできません。");
      return;
    }
    const ids = Array.from(selectedPlacementIds);
    if (!ids.length) {
      setMessage("コピーする設備を選んでください。");
      return;
    }
    const captured = captureClipboard(doc, ids);
    if (!captured) {
      setMessage("コピーできませんでした。");
      return;
    }
    clipboard = captured;
    clipboardPasteCount = 0;
    updateClipboardButtons();
    setMessage(captured.items.length + "件をコピーしました。Ctrl+V または「貼り付け」で置けます。");
  }

  function pasteClipboard() {
    if (!isEditablePage() || !doc) {
      setMessage("比較表示中は貼り付けできません。");
      return;
    }
    if (!clipboard || !clipboard.items || !clipboard.items.length) {
      setMessage("先に設備をコピーしてください。");
      return;
    }
    pushHistory();
    clipboardPasteCount += 1;
    const result = pasteClipboardIntoDoc(doc, clipboard, clipboardPasteCount);
    if (!result || !result.count) {
      historyPast.pop();
      updateHistoryButtons();
      clipboardPasteCount = Math.max(0, clipboardPasteCount - 1);
      setMessage("貼り付けできませんでした。");
      return;
    }
    setSelection(result.placements.map((item) => item.id));
    if (project.activePage === PAGE_AFTER) {
      persist();
      refresh();
      setMessage(result.count + "件をアフターに貼り付けました。");
      return;
    }
    if (isEditingBeforePage() && hasAfterPage(project)) {
      const mirror = mirrorBeforeToAfter(project);
      persist();
      refresh();
      setMessage(result.count + "件を貼り付けました" +
        (mirror.added > 0 ? "（アフターにも映し出し）。" : "。"));
      return;
    }
    persist();
    refresh();
    setMessage(result.count + "件を貼り付けました。");
  }

  function updateClipboardButtons() {
    const copyBtn = document.getElementById("copyButton");
    const pasteBtn = document.getElementById("pasteButton");
    if (!copyBtn || !pasteBtn) {
      return;
    }
    const canEdit = isEditablePage() && !!doc;
    copyBtn.disabled = !canEdit || selectedPlacementIds.size < 1;
    pasteBtn.disabled = !canEdit || !clipboard || !clipboard.items || !clipboard.items.length;
  }

  function groupSelected() {
    const ids = Array.from(selectedPlacementIds);
    if (ids.length < 2) {
      setMessage("Shift＋クリックで2つ以上選んでから「一式」を押してください。");
      return;
    }
    pushHistory();
    const group = createGroup(doc, ids, DEFAULT_GROUP_NAME);
    if (!group) {
      historyPast.pop();
      updateHistoryButtons();
      setMessage("グループ化できませんでした。");
      return;
    }
    setSelection(group.placementIds.slice());
    persist();
    refresh();
    setMessage("「" + group.name + "」にグループ化しました。");
  }

  function ungroupSelected() {
    const groups = new Map();
    selectedPlacementIds.forEach((id) => {
      const group = findGroupByPlacement(doc, id);
      if (group) {
        groups.set(group.id, group);
      }
    });
    if (!groups.size) {
      setMessage("解除できる一式がありません。");
      return;
    }
    pushHistory();
    groups.forEach((group) => ungroup(doc, group.id));
    persist();
    refresh();
    setMessage("一式を解除しました。");
  }

  function bringSelection(direction) {
    if (!isEditablePage() || !doc) {
      return;
    }
    const ids = Array.from(selectedPlacementIds);
    if (!ids.length) {
      setMessage("設備を選んでから前面／背面を押してください。");
      return;
    }
    pushHistory();
    const ok = reorderPlacements(doc, ids, direction);
    if (!ok) {
      historyPast.pop();
      updateHistoryButtons();
      setMessage("順序は変わりませんでした。");
      return;
    }
    persist();
    refresh();
    setMessage(direction === "front"
      ? "選択中を前面にしました。"
      : "選択中を背面にしました。");
  }

  function deleteSelected() {
    if (!selectedPlacementIds.size) {
      return;
    }
    pushHistory();
    const ids = Array.from(selectedPlacementIds);
    if (isEditingBeforePage() && hasAfterPage(project)) {
      // 削除前にリンク先を特定し、追従／切り離しに関係なくアフターからも消す
      const afterDoc = workDocFromProject(project, PAGE_AFTER);
      const before = project.pages.before;
      const after = project.pages.after;
      const afterIds = [];
      ids.forEach((beforePlId) => {
        const beforePl = before.drawing.placements.find((pl) => pl.id === beforePlId);
        if (!beforePl) {
          return;
        }
        const afterPl = findLinkedAfterPlacement(before, after, beforePl);
        if (afterPl) {
          afterIds.push(afterPl.id);
        }
      });
      ids.forEach((id) => removePair(doc, id));
      afterIds.forEach((id) => removePair(afterDoc, id));
      setSelection([]);
      mirrorBeforeToAfter(project);
      persist();
      refresh();
      setMessage("ビフォアから削除し、対応するアフター設備も削除しました。");
      return;
    }
    ids.forEach((id) => removePair(doc, id));
    setSelection([]);
    persist();
    refresh();
    setMessage(project.activePage === PAGE_AFTER
      ? "アフターから削除しました（ビフォアはそのままです）。"
      : "削除しました。");
  }

  function applyEditorDims() {
    const placement = findPlacement(doc, primarySelectedId());
    const equipment = placement ? findEquipment(doc, placement.equipmentId) : null;
    if (!equipment) {
      return;
    }
    const values = { name: nameInput.value.trim() };
    const def = equipmentTypeOf(equipment.type);
    def.fields.forEach((field) => {
      const input = document.getElementById("ed_" + field.key);
      values[field.key] = input ? input.value : "";
    });
    const shapeInput = document.getElementById("ed_shape");
    if (shapeInput) {
      values.shape = shapeInput.value;
    }
    const lengthInput = document.getElementById("ed_lengthMm");
    if (isPipeType(equipment.type) && lengthInput) {
      values.lengthMm = lengthInput.value;
    }
    const missing = requiredDimsPresent(equipment.type, values);
    if (!values.name) {
      setMessage("名称を入力してください。");
      return;
    }
    if (missing.length) {
      setMessage("必須寸法が未入力です: " + missing.join("、"));
      return;
    }
    let pipeLength = null;
    if (isPipeType(equipment.type)) {
      pipeLength = parseOptionalMm(values.lengthMm);
      if (pipeLength == null) {
        setMessage("長さを入力してください。");
        return;
      }
      if (snapMm(pipeLength) < MOVE_STEP_MM) {
        setMessage("長さは " + formatMm(MOVE_STEP_MM) + " 以上にしてください。");
        return;
      }
    }
    pushHistory();
    let pipeLengthResult = null;
    if (isPipeType(equipment.type)) {
      pipeLengthResult = setPipeLengthMm(placement, equipment, pipeLength, doc.site);
      if (!pipeLengthResult.ok) {
        historyPast.pop();
        updateHistoryButtons();
        setMessage(pipeLengthResult.message || "長さを変更できませんでした。");
        return;
      }
      updateEquipmentDimensions(equipment, {
        name: values.name,
        diameterMm: values.diameterMm,
        lengthMm: pipeLengthMm(placement)
      });
      syncPipeDimensions(equipment, placement);
    } else {
      updateEquipmentDimensions(equipment, values);
      clampPlacementToSite(placement, equipment, doc.site);
    }
    if (project.activePage === PAGE_AFTER) {
      detachAfterPlacements([placement]);
      persist();
      refresh();
      if (pipeLengthResult && pipeLengthResult.truncated) {
        setMessage(pipeLengthResult.message);
      } else {
        setMessage("アフターの寸法を更新しました。この設備はビフォアの変更に追従しません。");
      }
      return;
    }
    if (isEditingBeforePage() && hasAfterPage(project)) {
      mirrorBeforeToAfter(project);
    }
    persist();
    refresh();
    if (pipeLengthResult && pipeLengthResult.truncated) {
      setMessage(pipeLengthResult.message);
    } else if (isPipeType(equipment.type)) {
      const dia = equipment.dimensions.diameterMm;
      setMessage(
        "配管を更新しました（長さ " + formatMm(equipment.dimensions.lengthMm) +
        "／太さ " + (dia != null ? dia + "A" : "未確認") + "）。"
      );
    } else {
      setMessage("寸法を更新しました。位置は変えていません。");
    }
  }

  function setCrossPadEnabled(enabled) {
    ["moveUp", "moveDown", "moveLeft", "moveRight"].forEach((id) => {
      document.getElementById(id).disabled = !enabled;
    });
  }

  function refreshEditor() {
    const deleteBtn = document.getElementById("deleteButton");
    const groupBtn = document.getElementById("groupButton");
    const ungroupBtn = document.getElementById("ungroupButton");
    const frontBtn = document.getElementById("frontButton");
    const backBtn = document.getElementById("backButton");
    if (!isEditablePage() || !doc) {
      inspector.hidden = true;
      editor.hidden = true;
      selectionLabel.textContent = "寸法";
      deleteBtn.disabled = true;
      groupBtn.disabled = true;
      ungroupBtn.disabled = true;
      frontBtn.disabled = true;
      backBtn.disabled = true;
      setCrossPadEnabled(false);
      updateClipboardButtons();
      return;
    }
    const placement = findPlacement(doc, primarySelectedId());
    const equipment = placement ? findEquipment(doc, placement.equipmentId) : null;
    const multiCount = selectedPlacementIds.size;
    const inGroup = placement ? findGroupByPlacement(doc, placement.id) : null;
    groupBtn.disabled = multiCount < 2;
    ungroupBtn.disabled = !Array.from(selectedPlacementIds).some((id) => findGroupByPlacement(doc, id));
    frontBtn.disabled = multiCount < 1;
    backBtn.disabled = multiCount < 1;
    updateClipboardButtons();
    if (!equipment) {
      inspector.hidden = true;
      editor.hidden = true;
      selectionLabel.textContent = "寸法";
      deleteBtn.disabled = true;
      frontBtn.disabled = true;
      backBtn.disabled = true;
      setCrossPadEnabled(false);
      return;
    }
    inspector.hidden = false;
    editor.hidden = false;
    deleteBtn.disabled = false;
    setCrossPadEnabled(true);
    if (multiCount > 1 || inGroup) {
      selectionLabel.textContent = (inGroup ? inGroup.name : "複数選択") +
        "（" + multiCount + "）／編集: " + equipmentTypeOf(equipment.type).label;
    } else {
      selectionLabel.textContent = equipmentTypeOf(equipment.type).label;
    }
    nameInput.value = equipment.name;
    dimFields.innerHTML = "";
    const flat = flattenDims(equipment);
    if (isPipeType(equipment.type)) {
      syncPipeDimensions(equipment, placement);
      flat.lengthMm = equipment.dimensions.lengthMm;
      const lengthLabel = document.createElement("label");
      lengthLabel.textContent = "長さ";
      const lengthInput = document.createElement("input");
      lengthInput.id = "ed_lengthMm";
      lengthInput.type = "text";
      lengthInput.inputMode = "numeric";
      lengthInput.value = flat.lengthMm == null ? "" : String(flat.lengthMm);
      lengthInput.title = "長さ（mm）。始点と向きはそのまま、終点が動きます";
      lengthInput.placeholder = "mm";
      lengthLabel.appendChild(lengthInput);
      dimFields.appendChild(lengthLabel);
    }
    equipmentTypeOf(equipment.type).fields.forEach((field) => {
      const label = document.createElement("label");
      label.appendChild(document.createTextNode(shortDimLabel(field)));
      if (field.key === "heightMm") {
        label.classList.add("field-height");
      }
      const input = document.createElement("input");
      input.id = "ed_" + field.key;
      input.type = "text";
      input.inputMode = "numeric";
      input.title = field.unitSuffix
        ? (field.label + "（数字のみ。" + field.unitSuffix + "は欄外）" + (field.required ? "" : "／未確認可"))
        : (field.label + (field.required ? "" : "（任意・未確認可）"));
      input.placeholder = field.unitSuffix
        ? "例: 25"
        : (field.key === "heightMm"
          ? "未確認可"
          : (field.required ? "mm" : "未確認"));
      input.value = flat[field.key] == null ? "" : String(flat[field.key]);
      if (field.unitSuffix) {
        const row = document.createElement("span");
        row.className = "unit-input-row";
        row.appendChild(input);
        const suffix = document.createElement("span");
        suffix.className = "unit-suffix";
        suffix.textContent = field.unitSuffix;
        row.appendChild(suffix);
        label.appendChild(row);
      } else {
        label.appendChild(input);
      }
      dimFields.appendChild(label);
    });
    if (equipmentTypeOf(equipment.type).allowsCustomShape) {
      const label = document.createElement("label");
      label.textContent = "形状";
      const select = document.createElement("select");
      select.id = "ed_shape";
      select.innerHTML = '<option value="rect">長方形</option><option value="circle">円形</option>';
      select.value = equipment.shape || "rect";
      label.appendChild(select);
      dimFields.appendChild(label);
    }
  }

  function refresh() {
    updatePageChrome();
    if (isCompareMode()) {
      drawCompareScenes();
      refreshEditor();
      const zoomPct = Math.round(compareView.scale / 0.012 * 100);
      statusBar.textContent =
        "Compare ／ same zoom " + zoomPct + "% ／ Fit / Zoom shared";
      return;
    }
    restoreEditView();
    if (doc) {
      drawScene(canvas, doc, selectedPlacementIds, null, {
        pageRole: project.activePage === PAGE_AFTER ? "after" : "before"
      });
      if (placing && pipeStart && isLinePlaceType(pendingType)) {
        const ctx = canvas.getContext("2d");
        const tip = pipeHover || pipeStart;
        drawPipeDraft(ctx, pipeStart, tip);
      }
    }
    refreshEditor();
    const step = DrawView.gridStepMm || chooseGridStepMm();
    const zoomPct = Math.round(DrawView.scale / 0.012 * 100);
    const pageLabel = project.activePage === PAGE_AFTER ? "After" : "Before";
    statusBar.textContent =
      pageLabel +
      " ／ 方眼 " + formatMm(step) +
      " ／ 移動 " + formatMm(MOVE_STEP_MM) +
      " ／ " + formatMm(SITE_WIDTH_MM) + "×" + formatMm(SITE_DEPTH_MM) +
      " ／ " + zoomPct + "%" +
      (selectedPlacementIds.size ? " ／ 選択 " + selectedPlacementIds.size : "");
  }

  function compareContentBounds() {
    const beforeDoc = workDocFromProject(project, PAGE_BEFORE);
    const afterDoc = workDocFromProject(project, PAGE_AFTER);
    const bounds = unionBoundsMm(contentBoundsMm(beforeDoc), contentBoundsMm(afterDoc));
    if (bounds) {
      return bounds;
    }
    return {
      minX: 0,
      minY: 0,
      maxX: project.site.widthMm,
      maxY: project.site.depthMm
    };
  }

  function fitCompareToContent() {
    const bounds = compareContentBounds();
    const pad = 36;
    const refW = Math.max(1, Math.min(canvasBefore.clientWidth, canvasAfter.clientWidth));
    const refH = Math.max(1, Math.min(canvasBefore.clientHeight, canvasAfter.clientHeight));
    const bw = Math.max(1000, bounds.maxX - bounds.minX);
    const bh = Math.max(1000, bounds.maxY - bounds.minY);
    const sx = (refW - pad * 2) / bw;
    const sy = (refH - pad * 2) / bh;
    compareView.scale = clamp(Math.min(sx, sy), DrawView.minScale, DrawView.maxScale);
    // 左右同じ見え方：同じ scale / offset（キャンバス幅が同じ前提で中央寄せ）
    const drawnW = bw * compareView.scale;
    const drawnH = bh * compareView.scale;
    compareView.offsetX = (refW - drawnW) / 2 - bounds.minX * compareView.scale;
    compareView.offsetY = (refH - drawnH) / 2 - bounds.minY * compareView.scale;
    compareView.needFit = false;
  }

  function applyCompareView() {
    DrawView.scale = compareView.scale;
    DrawView.offsetX = compareView.offsetX;
    DrawView.offsetY = compareView.offsetY;
  }

  function zoomCompareAt(factor, cx, cy) {
    const before = {
      xMm: (cx - compareView.offsetX) / compareView.scale,
      yMm: (cy - compareView.offsetY) / compareView.scale
    };
    compareView.scale = clamp(compareView.scale * factor, DrawView.minScale, DrawView.maxScale);
    compareView.offsetX = cx - before.xMm * compareView.scale;
    compareView.offsetY = cy - before.yMm * compareView.scale;
  }

  function drawCompareScenes() {
    const beforeDoc = workDocFromProject(project, PAGE_BEFORE);
    const afterDoc = workDocFromProject(project, PAGE_AFTER);
    const saved = {
      scale: DrawView.scale,
      offsetX: DrawView.offsetX,
      offsetY: DrawView.offsetY
    };
    if (compareView.needFit) {
      fitCompareToContent();
    }
    applyCompareView();
    if (beforeDoc) {
      drawScene(canvasBefore, beforeDoc, new Set(), null, { pageRole: "before" });
    }
    // 必ず同じスケール・オフセットで描く
    applyCompareView();
    if (afterDoc) {
      drawScene(canvasAfter, afterDoc, new Set(), null, { pageRole: "after" });
    }
    DrawView.scale = saved.scale;
    DrawView.offsetX = saved.offsetX;
    DrawView.offsetY = saved.offsetY;
  }

  function persist() {
    syncSheetInfoFromForm();
    const result = saveDocument(project);
    if (!result.ok) {
      setMessage(result.message);
    }
  }

  function setMessage(text) {
    messageEl.textContent = text || "";
  }

  function formatDateField(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return match ? match[1] + "/" + match[2] + "/" + match[3] : "";
  }

  function formatSheetDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!match) {
      return "";
    }
    return Number(match[1]) + "年" + Number(match[2]) + "月" + Number(match[3]) + "日";
  }

  function parseDateField(text) {
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(String(text || "").trim());
    if (!match) {
      return "";
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return "";
    }
    const pad = (value) => String(value).padStart(2, "0");
    return year + "-" + pad(month) + "-" + pad(day);
  }

  function sheetInfoFromForm() {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sheetDateInput.value) ? sheetDateInput.value : "";
    return {
      date: date || todayIsoDate(),
      title: String(sheetTitleInput.value || "").slice(0, 60),
      name: String(sheetNameInput.value || "").slice(0, 40)
    };
  }

  function syncSheetInfoFromForm() {
    project.meta = normalizeMeta(sheetInfoFromForm());
  }

  function applySheetInfoToForm() {
    const info = normalizeMeta(project.meta);
    if (document.activeElement !== sheetTitleInput) {
      sheetTitleInput.value = info.title;
    }
    if (document.activeElement !== sheetNameInput) {
      sheetNameInput.value = info.name;
    }
    if (document.activeElement !== sheetDateInput && document.activeElement !== sheetDateText) {
      sheetDateInput.value = info.date;
      sheetDateText.value = formatDateField(info.date);
    }
  }

  function bindSheetInfo() {
    const commit = () => {
      syncSheetInfoFromForm();
      persist();
    };
    sheetTitleInput.addEventListener("change", commit);
    sheetNameInput.addEventListener("change", commit);
    sheetDateText.addEventListener("input", () => {
      if (!sheetDateText.value.trim()) {
        sheetDateInput.value = "";
        return;
      }
      const iso = parseDateField(sheetDateText.value);
      if (iso) {
        sheetDateInput.value = iso;
      }
    });
    sheetDateText.addEventListener("blur", () => {
      const raw = sheetDateText.value.trim();
      if (!raw) {
        sheetDateInput.value = todayIsoDate();
        sheetDateText.value = formatDateField(sheetDateInput.value);
        commit();
        return;
      }
      const iso = parseDateField(raw);
      if (iso) {
        sheetDateInput.value = iso;
        sheetDateText.value = formatDateField(iso);
      } else {
        sheetDateText.value = formatDateField(sheetDateInput.value || todayIsoDate());
        if (!sheetDateInput.value) {
          sheetDateInput.value = todayIsoDate();
        }
      }
      commit();
    });
    sheetDateInput.addEventListener("change", () => {
      if (!sheetDateInput.value) {
        sheetDateInput.value = todayIsoDate();
      }
      sheetDateText.value = formatDateField(sheetDateInput.value);
      commit();
    });
  }

  function downloadDrawingFile() {
    syncSheetInfoFromForm();
    const fileName = buildDownloadBaseName(project.meta, VIEW_LABEL_PLAN) + ".json";
    const payload = JSON.parse(JSON.stringify(project));
    payload.schema = SCHEMA_ID;
    payload.version = 2;
    payload.meta = normalizeMeta(project.meta);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    persist();
    setMessage("ダウンロードフォルダに保存しました（" + fileName + "）");
  }

  function openDrawingFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || data.schema !== SCHEMA_ID) {
          setMessage("このファイルはLPガス設備図面V2として開けません。");
          return;
        }
        const hasContent = (project.pages.before.equipment && project.pages.before.equipment.length)
          || (project.pages.after && project.pages.after.equipment && project.pages.after.equipment.length);
        if (hasContent && !window.confirm("今の図面を、開くファイルに替えます。よろしいですか？")) {
          return;
        }
        pushHistory();
        project = normalizeDocument(data);
        bindActivePage(false);
        historyFuture = [];
        updateHistoryButtons();
        applySheetInfoToForm();
        fitSiteToCanvas(canvas, project.site);
        snapshotEditView();
        persist();
        refresh();
        updatePageChrome();
        setMessage("保存した図面を開きました。");
      } catch (error) {
        setMessage("このファイルはLPガス設備図面V2として開けません。");
      }
    };
    reader.readAsText(file);
  }

  function printInfoLines() {
    const info = normalizeMeta(project.meta);
    const lines = [];
    if (info.date) {
      lines.push({ label: "Date", value: formatSheetDate(info.date) });
    }
    lines.push({ label: "Drawing", value: "Plan View" });
    if (info.title) {
      lines.push({ label: "Title", value: info.title });
    }
    if (info.name) {
      lines.push({ label: "Name", value: info.name });
    }
    if (project.activePage === PAGE_AFTER) {
      lines.push({ label: "Page", value: "After" });
    } else if (project.activePage === PAGE_COMPARE) {
      lines.push({ label: "Page", value: "Compare" });
    } else {
      lines.push({ label: "Page", value: "Before" });
    }
    return lines;
  }

  function renderPrintSheet() {
    syncSheetInfoFromForm();
    const pageW = 3508;
    const pageH = 2480;
    const margin = 90;
    const lines = printInfoLines();
    const infoPadX = 28;
    const infoPadY = 20;
    const infoLineH = 64;
    const infoMargin = 48;
    const infoBand = lines.length ? infoMargin + infoPadY * 2 + infoLineH * lines.length + 12 : 0;

    const sheet = document.createElement("canvas");
    sheet.width = pageW;
    sheet.height = pageH;
    const pen = sheet.getContext("2d");
    pen.fillStyle = "#ffffff";
    pen.fillRect(0, 0, pageW, pageH);

    const savedView = {
      scale: DrawView.scale,
      offsetX: DrawView.offsetX,
      offsetY: DrawView.offsetY
    };

    const drawAreaH = pageH - infoBand;
    if (isCompareMode() && hasAfterPage(project)) {
      const beforeDoc = workDocFromProject(project, PAGE_BEFORE);
      const afterDoc = workDocFromProject(project, PAGE_AFTER);
      const halfW = Math.floor((pageW - margin * 3) / 2);
      const paneH = drawAreaH - margin * 2;
      printOnePlan(pen, beforeDoc, margin, margin, halfW, paneH, "Before", "before");
      printOnePlan(pen, afterDoc, margin * 2 + halfW, margin, halfW, paneH, "After", "after");
    } else {
      const printDoc = doc || workDocFromProject(project, PAGE_BEFORE);
      const role = project.activePage === PAGE_AFTER ? "after" : "before";
      printOnePlan(pen, printDoc, margin, margin, pageW - margin * 2, drawAreaH - margin * 2, "", role);
    }

    DrawView.scale = savedView.scale;
    DrawView.offsetX = savedView.offsetX;
    DrawView.offsetY = savedView.offsetY;

    if (lines.length) {
      pen.textBaseline = "middle";
      pen.textAlign = "left";
      pen.font = "700 44px sans-serif";
      let labelWidth = 0;
      lines.forEach((line) => {
        labelWidth = Math.max(labelWidth, pen.measureText(line.label).width);
      });
      labelWidth += 36;
      const valueSizes = lines.map((line) => {
        let size = 48;
        pen.font = "700 " + size + "px sans-serif";
        while (size > 28 && pen.measureText(line.value).width > 900) {
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
        pen.fillStyle = "#1a2430";
        pen.font = "700 44px Yu Gothic UI, Meiryo, sans-serif";
        pen.fillText(line.label, boxX + infoPadX, y);
        pen.fillStyle = "#111418";
        pen.font = "700 " + valueSizes[index] + "px Yu Gothic UI, Meiryo, sans-serif";
        pen.fillText(line.value, boxX + infoPadX + labelWidth, y);
      });
    }

    return sheet;
  }

  function downloadDrawingPdf() {
    try {
      const sheet = renderPrintSheet();
      const pageName = project.activePage === PAGE_AFTER ? "アフター" :
        project.activePage === PAGE_COMPARE ? "比較" : "ビフォア";
      const fileName = buildDownloadBaseName(project.meta, VIEW_LABEL_PLAN) + "_" + pageName + ".pdf";
      const url = URL.createObjectURL(createPlanPdf(sheet));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage("PDFを保存しました（" + fileName + "）");
    } catch (error) {
      console.error("PDF保存に失敗しました", error);
      setMessage("PDF保存に失敗しました。もう一度お試しください。");
    }
  }

  function printDrawing() {
    const sheet = renderPrintSheet();
    const holder = document.createElement("div");
    holder.className = "print-sheet";
    sheet.setAttribute("aria-label", (project.meta && project.meta.title) || VIEW_LABEL_PLAN);
    holder.appendChild(sheet);
    document.body.appendChild(holder);
    const cleanup = () => {
      holder.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setMessage("印刷ダイアログを開きました。");
  }

  function printOnePlan(targetCtx, printDoc, x, y, w, h, caption, pageRole) {
    if (!printDoc) {
      return;
    }
    const off = document.createElement("canvas");
    const bounds = contentBoundsMm(printDoc) || {
      minX: 0,
      minY: 0,
      maxX: project.site.widthMm,
      maxY: project.site.depthMm
    };
    const pad = 36;
    const bw = Math.max(1000, bounds.maxX - bounds.minX);
    const bh = Math.max(1000, bounds.maxY - bounds.minY);
    const sx = (w - pad * 2) / bw;
    const sy = (h - pad * 2 - (caption ? 36 : 0)) / bh;
    DrawView.scale = Math.min(sx, sy);
    DrawView.offsetX = pad - bounds.minX * DrawView.scale;
    DrawView.offsetY = pad + (caption ? 28 : 0) - bounds.minY * DrawView.scale;
    drawScene(off, printDoc, new Set(), { width: w, height: h }, {
      pageRole: pageRole === "after" ? "after" : "before",
      printMode: true
    });
    targetCtx.drawImage(off, x, y);
    if (caption) {
      targetCtx.fillStyle = "#111418";
      targetCtx.font = "700 44px Yu Gothic UI, Meiryo, sans-serif";
      targetCtx.textAlign = "left";
      targetCtx.textBaseline = "top";
      targetCtx.strokeStyle = "rgba(255,255,255,0.95)";
      targetCtx.lineWidth = 4;
      targetCtx.strokeText(caption, x + 12, y + 8);
      targetCtx.fillText(caption, x + 12, y + 8);
    }
  }

  function clearPalettePressed() {
    paletteEl.querySelectorAll(".palette-btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", "false");
    });
  }
})();
