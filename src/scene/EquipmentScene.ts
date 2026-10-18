import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BULK_MODEL } from "../models/catalog";
import {
  createContactShadow,
  createEquipment,
  disposeObject,
} from "../models/equipment";
import { DEFAULT_STATE, type EditorState } from "../state/editor";

export class EquipmentScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly anchor = new THREE.Group();
  private readonly equipment = new THREE.Group();
  private readonly environment: THREE.WebGLRenderTarget;
  private state: EditorState = { ...DEFAULT_STATE };
  private aspect = 1.6;
  private disposed = false;
  ready = false;

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
    const key = new THREE.DirectionalLight("#fff4dc", 3);
    key.position.set(-4, 7, 5);
    this.scene.add(key);
    this.anchor.add(createContactShadow(), this.equipment);
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

  update(state: EditorState) {
    if (this.disposed) return;
    this.state = state;
    const radians = THREE.MathUtils.degToRad;
    // 画角変更時に距離を補正し、表示サイズと遠近感を別々に調整する。
    const visibleHeight = 6.6;
    const distance = visibleHeight / (2 * Math.tan(radians(state.fov) / 2));
    const azimuth = radians(state.azimuth);
    const elevation = radians(state.elevation);
    this.camera.fov = state.fov;
    this.camera.aspect = this.aspect;
    this.camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
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
    this.render();
  }

  render() {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
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
    this.environment.dispose();
    this.renderer.dispose();
  }
}
