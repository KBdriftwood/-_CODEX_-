import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { shadowLightPosition } from "../src/scene/GroundShadow";

test("カメラを回しても共通光源の影が選択した画面方向を向く", () => {
  for (const azimuth of [-180, -70, 0, 28, 110, 180]) {
    for (const elevation of [-20, 14, 60]) {
      const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 100);
      const a = THREE.MathUtils.degToRad(azimuth);
      const e = THREE.MathUtils.degToRad(elevation);
      camera.position.set(10 * Math.cos(e) * Math.sin(a), 10 * Math.sin(e), 10 * Math.cos(e) * Math.cos(a));
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      for (const [direction, [x, y]] of [[1, -1], [-1, -1], [-1, 1], [1, 1]].entries()) {
        const light = shadowLightPosition(direction, azimuth, elevation);
        const tip = new THREE.Vector3(-light.x / light.y, 0, -light.z / light.y).project(camera);
        expect(Math.sign(tip.x)).toBe(x);
        expect(Math.sign(tip.y)).toBe(y);
      }
    }
  }
});

test("影ボタンが全4方向を巡回し、設備を動かさず描画を更新する", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "PNG保存", exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByLabel("追加する設備").selectOption("gas-pipe");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await expect(page.getByRole("button", { name: "PNG保存", exact: true })).toBeEnabled();
  const values = await page.getByRole("spinbutton").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  const canvas = page.locator(".equipment-canvas");
  const images: string[] = [];
  for (const direction of ["右下", "左下", "左上", "右上"]) {
    const button = page.getByRole("button", { name: `影の向き：${direction}`, exact: true });
    await expect(button).toBeVisible();
    const image = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL());
    images.push(image);
    await button.click();
    await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).not.toBe(image);
  }
  expect(new Set(images).size).toBe(4);
  await expect(page.getByRole("button", { name: "影の向き：右下", exact: true })).toBeVisible();
  await expect.poll(() => canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(images[0]);
  expect(await page.getByRole("spinbutton").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(values);
});
