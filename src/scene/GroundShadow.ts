import * as THREE from "three";

export const KEY_LIGHT_POSITION = [-4, 7, 5] as const;
export const SHADOW_DIRECTIONS = ["右下", "左下", "左上", "右上"] as const;

// 写真上の方向を保つため、共通光源をカメラの向きに合わせる。
export function shadowLightPosition(
  direction: number,
  azimuth: number,
  elevation: number,
) {
  const [right, down] = [[1, 1], [-1, 1], [-1, -1], [1, -1]][direction];
  const angle = THREE.MathUtils.degToRad(azimuth);
  const depth = down * (elevation < 0 ? -1 : 1);
  return new THREE.Vector3(
    -4 * (right * Math.cos(angle) + depth * Math.sin(angle)),
    7,
    -4 * (-right * Math.sin(angle) + depth * Math.cos(angle)),
  );
}

const FLOOR_Y = -0.015;
const RESOLUTION = 512;

/** 全設備共通の仮光源からモデルの輪郭を地面へ投影する。写真の光源推定は行わない。 */
export class GroundShadow extends THREE.Mesh<
  THREE.PlaneGeometry,
  THREE.MeshBasicMaterial
> {
  private readonly canvas: HTMLCanvasElement;
  private signature: string | null = null;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = RESOLUTION;
    super(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        color: "#10191e",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    this.canvas = canvas;
    this.name = "設備の投影影";
    this.rotation.x = -Math.PI / 2;
    this.renderOrder = -1;
    this.visible = false;
  }

  updateFor(
    object: THREE.Object3D,
    signature: string,
    light: THREE.Vector3 = new THREE.Vector3(...KEY_LIGHT_POSITION),
  ) {
    // 移動・倍率は親グループと一緒に反映。回転と光源変更時は再計算する。
    if (signature === this.signature) return;
    object.updateWorldMatrix(true, true);
    const parentInverse = object.parent
      ? object.parent.matrixWorld.clone().invert()
      : new THREE.Matrix4();
    const surfaces: { points: Float32Array; geometry: THREE.BufferGeometry }[] =
      [];
    const point = new THREE.Vector3();
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    object.traverseVisible((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const positions = child.geometry.getAttribute("position");
      if (!positions) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(
        parentInverse,
        child.matrixWorld,
      );
      const projected = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        const height = Math.max(0, point.y - FLOOR_Y);
        const x =
          point.x - (height * light.x) / light.y;
        const z =
          point.z - (height * light.z) / light.y;
        projected[i * 2] = x;
        projected[i * 2 + 1] = z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      surfaces.push({ points: projected, geometry: child.geometry });
    });
    if (!surfaces.length) {
      this.visible = false;
      return;
    }
    const padding = Math.max(maxX - minX, maxZ - minZ) * 0.025 + 0.02;
    minX -= padding;
    maxX += padding;
    minZ -= padding;
    maxZ += padding;
    const width = maxX - minX,
      depth = maxZ - minZ;
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, RESOLUTION, RESOLUTION);
    ctx.beginPath();
    for (const { points, geometry } of surfaces) {
      const index = geometry.getIndex();
      const count = index?.count ?? points.length / 2;
      for (let i = 0; i + 2 < count; i += 3) {
        const a = index ? index.getX(i) : i;
        let b = index ? index.getX(i + 1) : i + 1;
        let c = index ? index.getX(i + 2) : i + 2;
        // 同じ向きの不透明な輪郭をまとめて塗り、三角形の重なりで影が濃くなるのを防ぐ。
        const area =
          (points[b * 2] - points[a * 2]) *
            (points[c * 2 + 1] - points[a * 2 + 1]) -
          (points[b * 2 + 1] - points[a * 2 + 1]) *
            (points[c * 2] - points[a * 2]);
        if (Math.abs(area) < 1e-12) continue;
        if (area < 0) [b, c] = [c, b];
        ctx.moveTo(
          ((points[a * 2] - minX) / width) * RESOLUTION,
          ((points[a * 2 + 1] - minZ) / depth) * RESOLUTION,
        );
        ctx.lineTo(
          ((points[b * 2] - minX) / width) * RESOLUTION,
          ((points[b * 2 + 1] - minZ) / depth) * RESOLUTION,
        );
        ctx.lineTo(
          ((points[c * 2] - minX) / width) * RESOLUTION,
          ((points[c * 2 + 1] - minZ) / depth) * RESOLUTION,
        );
        ctx.closePath();
      }
    }
    ctx.fillStyle = "#ffffff";
    ctx.filter = "blur(2px)";
    ctx.fill();
    ctx.filter = "none";
    this.position.set((minX + maxX) / 2, FLOOR_Y, (minZ + maxZ) / 2);
    this.scale.set(width, depth, 1);
    this.material.map!.needsUpdate = true;
    this.visible = true;
    this.signature = signature;
  }
}
