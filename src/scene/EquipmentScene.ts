import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BULK_MODEL, getDefinition } from "../models/catalog";
import { createEquipment, disposeObject } from "../models/equipment";
import {
  GroundShadow,
  KEY_LIGHT_POSITION,
  shadowLightPosition,
} from "./GroundShadow";
import { DEFAULT_STATE, type EditorState } from "../state/editor";
import type { PlacedEquipment } from "../state/editor";

export class EquipmentScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly anchor = new THREE.Group();
  private readonly equipment = new THREE.Group();
  private readonly anchorShadow = new GroundShadow();
  private readonly environment: THREE.WebGLRenderTarget;
  private state: EditorState = { ...DEFAULT_STATE };
  private aspect = 1.6;
  private disposed = false;
  ready = false;
  private nodes = new Map<
    string,
    {
      key: string;
      root: THREE.Group;
      object: THREE.Group;
      item: PlacedEquipment;
      shadow: GroundShadow;
      camera: THREE.PerspectiveCamera;
    }
  >();
  private itemRevision = 0;
  private pending: Promise<void> = Promise.resolve();
  private multiple = false;
  private shadowDirection = 0;
  private readonly keyLight = new THREE.DirectionalLight("#fff4dc", 3);

  setShadowDirection(direction: number) {
    this.shadowDirection = direction;
    this.update(this.state);
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    // Windowsの125%表示などでもviewportを端数にしない。
    // CSSの表示サイズと、整数の描画ピクセル数を明示的に分ける。
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#748291", 2.2));
    const key = this.keyLight;
    key.position.set(...KEY_LIGHT_POSITION);
    this.scene.add(key);
    this.anchor.add(this.anchorShadow, this.equipment);
    this.scene.add(this.anchor);
  }

  async load() {
    const model = await createEquipment(BULK_MODEL);
    if (this.disposed) {
      disposeObject(model);
      return;
    }
    this.equipment.add(model);
    this.ready = true;
    this.update(this.state);
  }

  setItems(items: PlacedEquipment[]) {
    const revision = ++this.itemRevision;
    this.multiple = true;
    this.anchor.visible = false;
    this.pending = (async () => {
      const results = await Promise.all(
        items.map(async (item) => {
          const key = `${item.modelId}:${item.length}:${item.pipeShape}`;
          const previous = this.nodes.get(item.id);
          if (previous?.key === key) return { ...previous, item, fresh: false };
          const definition = getDefinition(item.modelId);
          const object = await createEquipment(definition, item);
          const root = new THREE.Group();
          const shadow = new GroundShadow();
          root.add(shadow, object);
          return {
            key, root, object, item, shadow,
            camera: this.camera.clone(), fresh: true,
          };
        }),
      );
      if (this.disposed || revision !== this.itemRevision) {
        results
          .filter((node) => node.fresh)
          .forEach((node) => disposeObject(node.root));
        return;
      }
      for (const [id, node] of this.nodes)
        if (
          !results.some(
            (result) => result.item.id === id && result.root === node.root,
          )
        ) {
          this.scene.remove(node.root);
          disposeObject(node.root);
        }
      this.nodes.clear();
      for (const node of results) {
        this.nodes.set(node.item.id, node);
        if (node.fresh) this.scene.add(node.root);
      }
      this.ready = true;
      this.update(this.state);
    })();
    return this.pending;
  }

  async settle() {
    await this.pending;
  }

  pick(x: number, y: number) {
    const ray = new THREE.Raycaster();
    this.scene.updateMatrixWorld(true);
    // 画面上の重なりは描画順。手前に描いた設備から、各設備のカメラで選択する。
    for (const node of [...this.nodes.values()].reverse()) {
      if (!node.item.visible) continue;
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), node.camera);
      if (ray.intersectObject(node.object, true).length) return node.item.id;
    }
    return null;
  }

  resize(width: number, height: number, aspect: number) {
    if (this.disposed || width < 1 || height < 1) return;
    this.aspect = aspect;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setSize(
      Math.max(1, Math.round(width * ratio)),
      Math.max(1, Math.round(height * ratio)),
      false,
    );
    this.update(this.state);
  }

  private configureCamera(camera: THREE.PerspectiveCamera, state: EditorState) {
    const radians = THREE.MathUtils.degToRad;
    const visibleHeight = 6.6;
    const distance = visibleHeight / (2 * Math.tan(radians(state.fov) / 2));
    const azimuth = radians(state.azimuth);
    const elevation = radians(state.elevation);
    camera.fov = state.fov;
    camera.aspect = this.aspect;
    camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  update(state: EditorState) {
    if (this.disposed) return;
    this.state = state;
    const light = shadowLightPosition(
      this.shadowDirection,
      state.azimuth,
      state.elevation,
    );
    this.keyLight.position.copy(light);
    const lightSignature = `${this.shadowDirection}:${state.azimuth}:${state.elevation < 0}`;
    const radians = THREE.MathUtils.degToRad;
    // 画角変更時に距離を補正し、表示サイズと遠近感を別々に調整する。
    const visibleHeight = 6.6;
    this.configureCamera(this.camera, state);
    const right = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      0,
    );
    const up = new THREE.Vector3().setFromMatrixColumn(
      this.camera.matrixWorld,
      1,
    );
    this.anchor.position
      .copy(
        right.multiplyScalar(
          (state.x / 100 - 0.5) * visibleHeight * this.aspect,
        ),
      )
      .add(up.multiplyScalar((0.5 - state.y / 100) * visibleHeight));
    this.anchor.scale.setScalar(state.size / 100);
    this.equipment.rotation.set(
      radians(state.pitch),
      radians(state.yaw),
      radians(state.roll),
      "YXZ",
    );
    if (!this.multiple)
      this.anchorShadow.updateFor(
        this.equipment,
        `${state.pitch}:${state.yaw}:${state.roll}:${lightSignature}`,
        light,
      );
    if (this.multiple)
      for (const node of this.nodes.values()) {
        const value = node.item.state;
        this.configureCamera(node.camera, value);
        const itemLight = shadowLightPosition(
          this.shadowDirection, value.azimuth, value.elevation,
        );
        const horizontal = new THREE.Vector3().setFromMatrixColumn(
          node.camera.matrixWorld,
          0,
        );
        const vertical = new THREE.Vector3().setFromMatrixColumn(
          node.camera.matrixWorld,
          1,
        );
        node.root.position
          .copy(
            horizontal.multiplyScalar(
              (value.x / 100 - 0.5) * visibleHeight * this.aspect,
            ),
          )
          .add(vertical.multiplyScalar((0.5 - value.y / 100) * visibleHeight));
        node.root.scale.setScalar(value.size / 100);
        node.root.visible = node.item.visible;
        node.object.rotation.set(
          radians(value.pitch),
          radians(value.yaw),
          radians(value.roll),
          "YXZ",
        );
        node.shadow.updateFor(
          node.object,
          `${value.pitch}:${value.yaw}:${value.roll}:${this.shadowDirection}:${value.azimuth}:${value.elevation < 0}`,
          itemLight,
        );
      }
    this.render();
  }

  render() {
    if (this.disposed) return;
    if (!this.multiple) {
      this.renderer.toneMappingExposure = 1.05 * (this.state.brightness ?? 100) / 100;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    // 各設備を個別のカメラで同じ透明キャンバスへ重ねる。
    // 深度はカメラ間で共有できないため、設備ごとに消去する。
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    try {
      this.renderer.clear();
      for (const node of this.nodes.values()) node.root.visible = false;
      for (const node of this.nodes.values()) {
        if (!node.item.visible) continue;
        node.root.visible = true;
        this.keyLight.position.copy(shadowLightPosition(
          this.shadowDirection, node.item.state.azimuth, node.item.state.elevation,
        ));
        this.renderer.toneMappingExposure = 1.05 * (node.item.state.brightness ?? 100) / 100;
        this.renderer.clearDepth();
        this.renderer.render(this.scene, node.camera);
        node.root.visible = false;
      }
    } finally {
      for (const node of this.nodes.values()) node.root.visible = node.item.visible;
      this.renderer.autoClear = autoClear;
    }
  }

  capture(width: number, height: number) {
    if (!this.ready || this.renderer.getContext().isContextLost())
      throw new Error("3D表示の準備ができていません。");
    const oldSize = this.renderer.getSize(new THREE.Vector2());
    const oldAspect = this.aspect;
    try {
      this.aspect = width / height;
      this.renderer.setSize(width, height, false);
      this.update(this.state);
      const copy = document.createElement("canvas");
      copy.width = width;
      copy.height = height;
      const ctx = copy.getContext("2d");
      if (!ctx) throw new Error("画像の保存に必要な機能を利用できません。");
      ctx.drawImage(this.renderer.domElement, 0, 0);
      return copy;
    } finally {
      this.aspect = oldAspect;
      this.renderer.setSize(oldSize.x, oldSize.y, false);
      this.update(this.state);
    }
  }

  maxExportDimension() {
    const gl = this.renderer.getContext();
    return Math.min(
      4096,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      this.renderer.capabilities.maxTextureSize,
    );
  }

  dispose() {
    this.disposed = true;
    disposeObject(this.anchor);
    for (const node of this.nodes.values()) disposeObject(node.root);
    this.nodes.clear();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
