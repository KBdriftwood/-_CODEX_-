import { test, expect } from "@playwright/test";

test("カメラ・設備回転を変えても未選択の設備の画素と設定を保つ", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "PNG保存", exact: true })).toBeEnabled({ timeout: 15000 });
  const change = async (label: string, value: string) => {
    const input = page.getByRole("spinbutton", { name: label, exact: true });
    await input.fill(value);
    await input.press("Tab");
  };
  const select = (index: number) => page.locator(".placed-select").nth(index).click();
  await change("横位置", "25");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await expect(page.getByRole("button", { name: "PNG保存", exact: true })).toBeEnabled();
  await change("横位置", "75");
  const halves = () => page.locator(".equipment-canvas").evaluate(element => {
    const source = element as HTMLCanvasElement;
    return [0, 1].map(side => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(source.width / 2); canvas.height = source.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(source, side * canvas.width, 0, canvas.width, source.height, 0, 0, canvas.width, source.height);
      return canvas.toDataURL();
    });
  });
  const before = await halves();
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await change("見る方向", "-50");
  await change("見下ろし角度", "40");
  await change("遠近感（画角）", "55");
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await change("左右の回転", "65");
  const after = await halves();
  expect(after[0]).toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
  await select(0);
  await expect(page.getByRole("spinbutton", { name: "左右の回転", exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "見る方向", exact: true })).toHaveValue("28");
  await expect(page.getByRole("spinbutton", { name: "見下ろし角度", exact: true })).toHaveValue("14");
  await expect(page.getByRole("spinbutton", { name: "遠近感（画角）", exact: true })).toHaveValue("38");
  await select(1);
  await expect(page.getByRole("spinbutton", { name: "見る方向", exact: true })).toHaveValue("-50");
  await expect(page.getByRole("spinbutton", { name: "見下ろし角度", exact: true })).toHaveValue("40");
  // 別設備が選択中でも、写真上でつかんだ設備のカメラだけを回す。
  const point = await page.locator(".equipment-canvas").evaluate(element => {
    const source = element as HTMLCanvasElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rect = source.getBoundingClientRect();
    const x = Math.floor(canvas.width * 0.25);
    for (let y = Math.floor(canvas.height * 0.4); y < canvas.height * 0.7; y++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 200)
        return { x: rect.x + x / canvas.width * rect.width, y: rect.y + y / canvas.height * rect.height };
    }
    throw new Error("最初の設備の描画を検出できません。");
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 35, point.y + 10, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator(".placed-select").nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("spinbutton", { name: "見る方向", exact: true })).not.toHaveValue("28");
  await select(1);
  await expect(page.getByRole("spinbutton", { name: "見る方向", exact: true })).toHaveValue("-50");

});
