import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.setTimeout(60_000);
async function pipe(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
  await page
    .getByRole("button", { name: "選択設備を削除", exact: true })
    .click();
  await page.getByLabel("追加する設備").selectOption("gas-pipe");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await expect(page.getByLabel("配管の仮長さ", { exact: true })).toHaveValue(
    "2.5",
  );
}
async function change(page: Page, label: string, value: number) {
  const input = page.getByRole("spinbutton", { name: label, exact: true });
  await input.fill(String(value));
  await input.press("Enter");
}
async function shadow(page: Page) {
  return page.locator(".equipment-canvas").evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(element as HTMLCanvasElement, 0, 0, 384, 384);
    const data = ctx.getImageData(0, 0, 384, 384).data;
    const mask: number[] = [];
    let count = 0,
      left = 384,
      top = 384,
      right = 0,
      bottom = 0;
    for (let i = 0; i < data.length; i += 4) {
      const yes =
        data[i + 3] > 5 &&
        data[i + 3] < 96 &&
        data[i] < 55 &&
        data[i + 1] < 55 &&
        data[i + 2] < 55;
      mask.push(yes ? 1 : 0);
      if (yes) {
        const x = (i / 4) % 384,
          y = Math.floor(i / 4 / 384);
        count++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    return { mask, count, width: right - left + 1, height: bottom - top + 1 };
  });
}
const difference = (a: { mask: number[] }, b: { mask: number[] }) =>
  a.mask.reduce(
    (sum, pixel, index) => sum + (pixel !== b.mask[index] ? 1 : 0),
    0,
  );

test("配管の長さを空にして小数・複数桁を打ち直し、確定時だけ補正する", async ({
  page,
}) => {
  await pipe(page);
  const input = page.getByLabel("配管の仮長さ", { exact: true });
  await input.fill("1");
  await input.press("Enter");
  await input.click();
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  await input.pressSequentially("0.8");
  await expect(input).toHaveValue("0.8");
  await input.press("Enter");
  await input.click();
  await input.pressSequentially("10.5");
  await expect(input).toHaveValue("10.5");
  await input.press("Enter");
  await input.fill("0.1");
  await expect(input).toHaveValue("0.1");
  await input.press("Tab");
  await expect(input).toHaveValue("0.2");
  await input.fill("15");
  await expect(input).toHaveValue("15");
  await input.press("Enter");
  await expect(input).toHaveValue("12");
  await input.fill("");
  await input.press("Enter");
  await expect(input).toHaveValue("12");
  await input.fill("3.8");
  await input.press("Enter");
  await page.getByLabel("追加する設備").selectOption("hot-pipe");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await expect(input).toHaveValue("2.5");
  await input.fill("1.2");
  await input.press("Enter");
  await page
    .getByRole("button", { name: "LPガス配管 1を選択", exact: true })
    .click();
  await expect(input).toHaveValue("3.8");
  await page
    .getByRole("button", { name: "お湯配管 2を選択", exact: true })
    .click();
  await expect(input).toHaveValue("1.2");
});

test("配管の長さ・形・回転を変えると、影の画素と広がりも追従する", async ({
  page,
}) => {
  await pipe(page);
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await change(page, "見下ろし角度", 55);
  const short = await shadow(page);
  expect(short.count).toBeGreaterThan(30);
  await change(page, "配管の仮長さ", 5);
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled();
  const long = await shadow(page);
  expect(long.width).toBeGreaterThan(short.width * 1.5);
  await page.getByLabel("配管の形状").selectOption("elbow");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled();
  const elbow = await shadow(page);
  expect(difference(long, elbow)).toBeGreaterThan(30);
  await page.getByLabel("配管の形状").selectOption("u");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled();
  const bent = await shadow(page);
  expect(difference(elbow, bent)).toBeGreaterThan(30);
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await change(page, "左右の回転", 65);
  const yaw = await shadow(page);
  expect(difference(bent, yaw)).toBeGreaterThan(50);
  await change(page, "前後の傾き", 20);
  const pitch = await shadow(page);
  expect(difference(yaw, pitch)).toBeGreaterThan(30);
  await change(page, "左右の傾き", 15);
  const roll = await shadow(page);
  expect(difference(pitch, roll)).toBeGreaterThan(30);
  await page.screenshot({
    path: test.info().outputPath("pipe-shadow.png"),
    fullPage: true,
  });
});

test("形と回転に追従した影をPNG保存でき、保存後もプレビューを保つ", async ({
  page,
}) => {
  await pipe(page);
  await page.getByLabel("配管の形状").selectOption("u");
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await change(page, "見下ろし角度", 55);
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await change(page, "左右の回転", 45);
  const source = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1200, 800);
    return canvas.toDataURL().split(",")[1];
  });
  await page
    .getByLabel("現場写真ファイル")
    .setInputFiles({
      name: "白背景.png",
      mimeType: "image/png",
      buffer: Buffer.from(source, "base64"),
    });
  await expect(page.locator(".file-name")).toHaveText("白背景.png");
  const before = await shadow(page);
  expect(before.count).toBeGreaterThan(30);
  const data = await page.locator(".equipment-canvas").evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(element as HTMLCanvasElement, 0, 0, 384, 384);
    return Array.from(ctx.getImageData(0, 0, 384, 384).data);
  });
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG保存", exact: true }).click();
  const png = await readFile((await (await promise).path())!);
  const pixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 384;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, 384, 384);
    return Array.from(ctx.getImageData(0, 0, 384, 384).data);
  }, png.toString("base64"));
  let differences = 0;
  for (let i = 0; i < before.mask.length; i++)
    if (before.mask[i]) {
      const alpha = data[i * 4 + 3] / 255;
      for (let channel = 0; channel < 3; channel++)
        if (
          Math.abs(
            pixels[i * 4 + channel] -
              (data[i * 4 + channel] * alpha + 255 * (1 - alpha)),
          ) > 22
        )
          differences++;
    }
  expect(differences / (before.count * 3)).toBeLessThan(0.05);
  const after = await shadow(page);
  expect(difference(before, after)).toBe(0);
});
