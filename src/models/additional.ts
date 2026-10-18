import * as THREE from "three";
import type { EquipmentDefinition } from "./catalog";
import type { PlacedEquipment } from "../state/editor";

export function createAdditionalModel(
  kind: EquipmentDefinition["kind"],
  options?: Pick<PlacedEquipment, "length" | "pipeShape">,
) {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({
    color: "#e4ebed",
    metalness: 0.18,
    roughness: 0.4,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: "#576c79",
    metalness: 0.55,
    roughness: 0.4,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: "#adb1ac",
    roughness: 0.95,
  });
  const teal = new THREE.MeshStandardMaterial({
    color: "#23657a",
    roughness: 0.55,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#ba9c5b",
    metalness: 0.6,
    roughness: 0.4,
  });
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const value = new THREE.Mesh(geometry, material);
    value.position.set(x, y, z);
    group.add(value);
    return value;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
  if (kind === "vertical") {
    mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.7, 48), white, 0, 1.75);
    mesh(new THREE.SphereGeometry(0.8, 40, 24), white, 0, 0.9);
    mesh(new THREE.SphereGeometry(0.8, 40, 24), white, 0, 2.6);
    // 上端を含む高さ約3.6mの外観イメージ。すべて仮寸法。
    for (const x of [-0.48, 0.48])
      for (const z of [-0.48, 0.48]) {
        box(0.15, 0.55, 0.15, steel, x, 0.275, z);
        box(0.35, 0.06, 0.35, steel, x, 0.03, z);
      }
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16), brass, 0, 3.43);
    box(0.65, 0.32, 0.035, teal, 0, 1.7, 0.81);
    for (const y of [1.1, 2.3]) {
      const ring = mesh(
        new THREE.TorusGeometry(0.805, 0.016, 8, 48),
        steel,
        0,
        y,
      );
      ring.rotation.x = Math.PI / 2;
    }
  } else if (kind === "foundation") {
    box(3.2, 0.25, 2, concrete, 0, 0.125, 0);
    const line = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 0.25, 2)),
      new THREE.LineBasicMaterial({ color: "#8b918c" }),
    );
    line.position.y = 0.125;
    group.add(line);
  } else if (kind === "barrier") {
    box(3.5, 2, 0.2, concrete, 0, 1, 0);
    for (const x of [-1.3, 1.3]) box(0.4, 0.18, 0.9, concrete, x, 0.09, 0);
  } else if (kind === "vaporizer") {
    box(1.2, 0.1, 0.65, steel, 0, 0.05, 0);
    box(1.1, 1.35, 0.52, white, 0, 0.8, 0);
    box(0.36, 0.65, 0.03, teal, 0.25, 0.95, 0.28);
    for (const x of [-0.35, -0.12]) {
      mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.65, 16),
        brass,
        x,
        1.15,
        0.33,
      );
      box(0.14, 0.04, 0.14, steel, x, 1.52, 0.33);
    }
    box(0.18, 0.08, 0.04, steel, 0.25, 1.06, 0.31);
    mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12),
      brass,
      -0.32,
      0.25,
      0.31,
    );
  } else if (kind === "heater") {
    box(1, 1.6, 0.6, white, 0, 0.9, 0);
    for (const x of [-0.35, 0.35]) box(0.12, 0.15, 0.38, steel, x, 0.075, 0);
    for (let y = 0.8; y < 1.5; y += 0.1)
      box(0.72, 0.025, 0.025, steel, 0, y, 0.31);
    box(0.44, 0.2, 0.035, teal, 0, 0.5, 0.32);
    mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.17, 24),
      steel,
      0.25,
      1.78,
      0,
    );
  } else {
    const length = Math.max(0.2, options?.length ?? 2.5);
    const material = new THREE.MeshStandardMaterial({
      color: kind === "hot-pipe" ? "#c36f58" : "#bd9d4d",
      metalness: 0.45,
      roughness: 0.42,
    });
    const points = [
      new THREE.Vector3(-length / 2, 0.12, 0),
      new THREE.Vector3(length / 2, 0.12, 0),
    ];
    if (options?.pipeShape === "elbow" || options?.pipeShape === "u")
      points.push(
        new THREE.Vector3(length / 2, Math.max(0.3, length * 0.55), 0),
      );
    if (options?.pipeShape === "u")
      points.push(
        new THREE.Vector3(-length / 2, Math.max(0.3, length * 0.55), 0),
      );
    for (let i = 1; i < points.length; i++) {
      const direction = points[i].clone().sub(points[i - 1]);
      const pipe = mesh(
        new THREE.CylinderGeometry(0.04, 0.04, direction.length(), 16),
        material,
      );
      pipe.position.copy(
        points[i]
          .clone()
          .add(points[i - 1])
          .multiplyScalar(0.5),
      );
      pipe.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
    }
    for (const point of points) {
      const fitting = mesh(new THREE.SphereGeometry(0.055, 12, 8), material);
      fitting.position.copy(point);
    }
  }
  // 使用しなかったマテリアルも残さない。
  const used = new Set<THREE.Material>();
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) used.add(object.material);
  });
  for (const material of [white, steel, concrete, teal, brass])
    if (!used.has(material)) material.dispose();
  return group;
}
