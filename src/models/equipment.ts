import * as THREE from "three";
import type { EquipmentDefinition } from "./catalog";
import { createAdditionalModel } from "./additional";
import type { PlacedEquipment } from "../state/editor";

function labelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 180;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#194f60";
  ctx.fillRect(0, 0, 512, 180);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = "700 72px sans-serif";
  ctx.fillText("LP GAS", 256, 88);
  ctx.fillStyle = "#c5e4df";
  ctx.font = "26px sans-serif";
  ctx.fillText("S A M P L E", 256, 138);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlaceholder() {
  const group = new THREE.Group();
  const tank = new THREE.MeshStandardMaterial({
    color: "#e9eeef",
    roughness: 0.4,
    metalness: 0.24,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: "#a7b3ba",
    roughness: 0.5,
    metalness: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#344751",
    roughness: 0.55,
    metalness: 0.4,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#b4924f",
    metalness: 0.7,
    roughness: 0.35,
  });
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const body = add(
    new THREE.CylinderGeometry(0.7, 0.7, 2.6, 64),
    tank,
    0,
    1.22,
    0,
  );
  body.rotation.z = Math.PI / 2;
  for (const x of [-1.3, 1.3])
    add(new THREE.SphereGeometry(0.7, 48, 32), tank, x, 1.22, 0);
  for (const x of [-0.98, 0.98]) {
    const band = add(
      new THREE.TorusGeometry(0.704, 0.018, 8, 64),
      steel,
      x,
      1.22,
      0,
    );
    band.rotation.y = Math.PI / 2;
    add(new THREE.BoxGeometry(0.38, 0.43, 0.88), steel, x, 0.37, 0);
    add(new THREE.BoxGeometry(0.62, 0.14, 1.2), dark, x, 0.07, 0);
    for (const z of [-0.46, 0.46]) {
      add(
        new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12),
        steel,
        x - 0.2,
        0.16,
        z,
      );
      add(
        new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12),
        steel,
        x + 0.2,
        0.16,
        z,
      );
    }
  }
  add(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 32), steel, 0.18, 1.94, 0);
  add(
    new THREE.CylinderGeometry(0.065, 0.065, 0.19, 16),
    brass,
    0.18,
    2.035,
    0,
  );
  const wheel = add(
    new THREE.TorusGeometry(0.12, 0.022, 8, 24),
    dark,
    0.18,
    2.16,
    0,
  );
  wheel.rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.24, 0.025, 0.025), dark, 0.18, 2.16, 0);
  add(
    new THREE.CylinderGeometry(0.045, 0.045, 0.15, 16),
    brass,
    -0.38,
    1.97,
    0,
  );
  const gauge = add(
    new THREE.CylinderGeometry(0.105, 0.105, 0.065, 32),
    dark,
    -0.38,
    2.09,
    0.025,
  );
  gauge.rotation.x = Math.PI / 2;
  const face = add(
    new THREE.CircleGeometry(0.084, 32),
    new THREE.MeshStandardMaterial({ color: "#f8faf7", roughness: 0.8 }),
    -0.38,
    2.09,
    0.06,
  );
  face.rotation.z = 0.25;
  const needle = add(
    new THREE.BoxGeometry(0.008, 0.062, 0.004),
    dark,
    -0.36,
    2.11,
    0.063,
  );
  needle.rotation.z = -0.5;
  add(
    new THREE.PlaneGeometry(0.93, 0.327),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.7 }),
    0.1,
    1.25,
    0.707,
  );
  return group;
}

export async function createEquipment(
  definition: EquipmentDefinition,
  options?: Pick<PlacedEquipment, "length" | "pipeShape">,
): Promise<THREE.Group> {
  if (definition.asset.type === "procedural") {
    if (!definition.kind || definition.kind === "horizontal")
      return createPlaceholder();
    return createAdditionalModel(definition.kind, options);
  }
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(definition.asset.url);
  const wrapper = new THREE.Group();
  const model = gltf.scene;
  model.scale.setScalar(definition.asset.scaleToMeters);
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  wrapper.add(model);
  return wrapper;
}

export function createContactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, "rgba(16,25,30,0.34)");
  gradient.addColorStop(0.55, "rgba(16,25,30,0.18)");
  gradient.addColorStop(1, "rgba(16,25,30,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(5.3, 2.6),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.renderOrder = -1;
  return mesh;
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
