import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
}

async function fixture(
  page: Page,
  width: number,
  height: number,
  mimeType = "image/png",
) {
  const data = await page.evaluate(
    ({ width, height, mimeType }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#93a6b0";
      ctx.fillRect(0, 0, width, height);
      // 非対称の目印。写真の向きが保存時に変わっていないことも確認する。
      ctx.fillStyle = "#cf634d";
      ctx.fillRect(0, 0, width * 0.07, height * 0.07);
      return canvas.toDataURL(mimeType).split(",")[1];
    },
    { width, height, mimeType },
  );
  return Buffer.from(data, "base64");
}

async function upload(
  page: Page,
  width: number,
  height: number,
  name = "現場写真.png",
) {
  const buffer = await fixture(page, width, height);
  await page
    .getByLabel("現場写真ファイル")
    .setInputFiles({ name, mimeType: "image/png", buffer });
  await expect(page.locator(".file-name")).toHaveText(name);
  return buffer;
}

async function change(page: Page, label: string, value: number) {
  const input = page.getByRole("spinbutton", { name: label, exact: true });
  await input.fill(String(value));
  await input.press("Tab");
  await expect(input).toHaveValue(String(value));
}

async function previewPixels(page: Page, includeData = false) {
  return page.locator(".equipment-canvas").evaluate((element, includeData) => {
    const source = element as HTMLCanvasElement;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0, 256, 256);
    const data = ctx.getImageData(0, 0, 256, 256).data;
    let left = 256,
      top = 256,
      right = 0,
      bottom = 0,
      count = 0;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        if (data[(y * 256 + x) * 4 + 3] > 96) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
          count++;
        }
      }
    return {
      left,
      top,
      right,
      bottom,
      count,
      data: includeData ? Array.from(data) : [],
    };
  }, includeData);
}

test("3Dが表示され、マウス・数値・スライダー・リセットが連動する", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  expect((await previewPixels(page)).count).toBeGreaterThan(1000);
  const stage = page.locator(".photo-stage");
  const originalBackground = await page
    .locator(".background-photo")
    .getAttribute("src");
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, {
    steps: 8,
  });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("横位置", { exact: true }).inputValue()),
  ).toBeCloseTo(64, 0);
  expect(
    Number(await page.getByLabel("縦位置", { exact: true }).inputValue()),
  ).toBeCloseTo(70, 0);
  await change(page, "横位置", 37.5);
  await expect(
    page.getByRole("slider", { name: "横位置のスライダー" }),
  ).toHaveValue("37.5");
  await page.getByRole("slider", { name: "表示倍率のスライダー" }).fill("125");
  await expect(page.getByLabel("表示倍率", { exact: true })).toHaveValue("125");
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "設備の回転", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const beforeRotation = await page
    .locator(".equipment-canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await change(page, "左右の回転", 60);
  await change(page, "前後の傾き", 8);
  expect(
    await page
      .locator(".equipment-canvas")
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
  ).not.toBe(beforeRotation);
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await change(page, "見る方向", -20);
  await change(page, "見下ろし角度", 30);
  await change(page, "遠近感（画角）", 70);
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("見る方向", { exact: true })).toHaveValue("-19");
  await expect(page.locator(".background-photo")).toHaveAttribute(
    "src",
    originalBackground!,
  );
  await page.getByRole("button", { name: "初期状態に戻す" }).click();
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("54");
  await expect(page.getByLabel("縦位置", { exact: true })).toHaveValue("75");
  await expect(page.getByLabel("表示倍率", { exact: true })).toHaveValue("100");
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await expect(page.getByLabel("左右の回転", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("前後の傾き", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("左右の傾き", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await expect(page.getByLabel("見る方向", { exact: true })).toHaveValue("28");
  await expect(page.getByLabel("見下ろし角度", { exact: true })).toHaveValue(
    "14",
  );
  await expect(page.getByLabel("遠近感（画角）", { exact: true })).toHaveValue(
    "38",
  );
  expect(errors).toEqual([]);
});

test("写真の差し替え・エラー・同じファイルの再選択を扱える", async ({
  page,
}) => {
  await start(page);
  const outbound: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) outbound.push(request.url());
  });
  const image = await upload(page, 600, 900);
  let bounds = (await page.locator(".photo-stage").boundingBox())!;
  expect(bounds.width / bounds.height).toBeCloseTo(600 / 900, 2);
  const validSource = await page
    .locator(".background-photo")
    .getAttribute("src");
  await page.getByLabel("現場写真ファイル").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad file"),
  });
  await expect(page.getByRole("alert")).toContainText("JPEG・PNG・WebP");
  await expect(page.locator(".background-photo")).toHaveAttribute(
    "src",
    validSource!,
  );
  await page.getByLabel("現場写真ファイル").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a png"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "画像を読み込めませんでした",
  );
  await page.getByLabel("現場写真ファイル").setInputFiles({
    name: "現場写真.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByRole("status")).toContainText("写真を読み込みました");
  await upload(page, 1200, 700, "横長写真.png");
  bounds = (await page.locator(".photo-stage").boundingBox())!;
  expect(bounds.width / bounds.height).toBeCloseTo(1200 / 700, 2);
  await page.getByRole("button", { name: "初期状態に戻す" }).click();
  await expect(page.locator(".file-name")).toHaveText("横長写真.png");
  expect(outbound).toEqual([]);
});

for (const [width, height] of [
  [1200, 800],
  [600, 900],
]) {
  test(`${width}×${height}のPNGで背景・3D・配置を保存し、画面リサイズでもずれない`, async ({
    page,
  }) => {
    await start(page);
    await upload(page, width, height);
    await change(page, "横位置", 46);
    await change(page, "縦位置", 79);
    await change(page, "表示倍率", 72);
    await page.getByRole("button", { name: "設備の回転", exact: true }).click();
    await change(page, "左右の回転", -28);
    await change(page, "左右の傾き", 4);
    await page.getByRole("button", { name: "カメラ", exact: true }).click();
    await change(page, "見る方向", 40);
    await change(page, "見下ろし角度", 27);
    await change(page, "遠近感（画角）", 65);
    const before = await previewPixels(page);
    expect(before.count).toBeGreaterThan(500);
    await page.setViewportSize({ width: 1080, height: 800 });
    await expect
      .poll(async () => {
        const canvasSize = await page
          .locator(".equipment-canvas")
          .evaluate((c) => {
            const canvas = c as HTMLCanvasElement;
            return Math.abs(
              canvas.width -
                Math.floor(canvas.clientWidth * Math.min(devicePixelRatio, 2)),
            );
          });
        return canvasSize;
      })
      .toBeLessThan(3);
    const after = await previewPixels(page, true);
    for (const key of ["left", "top", "right", "bottom"] as const)
      expect(Math.abs(before[key] - after[key])).toBeLessThanOrEqual(2);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG保存", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("現場写真_完成イメージ.png");
    const png = await readFile((await download.path())!);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
    const exported = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 256, 256);
      const data = ctx.getImageData(0, 0, 256, 256).data;
      return {
        data: Array.from(data),
        marker: Array.from(ctx.getImageData(2, 2, 1, 1).data),
        background: Array.from(ctx.getImageData(245, 5, 1, 1).data),
      };
    }, png.toString("base64"));
    expect(exported.marker).toEqual([207, 99, 77, 255]);
    expect(exported.background).toEqual([147, 166, 176, 255]);
    // 各ピクセルの背景と3Dの合成を比較。UI表示だけのバッジは含めない。
    let mismatches = 0,
      samples = 0;
    for (let y = 24; y < 230; y++)
      for (let x = 24; x < 240; x++) {
        const index = (y * 256 + x) * 4;
        const alpha = after.data[index + 3] / 255;
        const background = [147, 166, 176];
        for (let channel = 0; channel < 3; channel++) {
          const expected =
            after.data[index + channel] * alpha +
            background[channel] * (1 - alpha);
          if (Math.abs(exported.data[index + channel] - expected) > 22)
            mismatches++;
          samples++;
        }
      }
    expect(mismatches / samples).toBeLessThan(0.02);
    const restored = await previewPixels(page);
    for (const key of ["left", "top", "right", "bottom"] as const)
      expect(restored[key]).toBe(after[key]);
    await expect(page.getByRole("status")).toContainText("PNGを作成しました");
  });
}

test("JPEGのEXIF回転を読み込みと保存で維持する", async ({ page }) => {
  await start(page);
  const jpeg = await fixture(page, 800, 600, "image/jpeg");
  const exif = Buffer.concat([
    Buffer.from([0xff, 0xe1, 0, 34]),
    Buffer.from("Exif\0\0"),
    Buffer.from("49492a0008000000010012010300010000000600000000000000", "hex"),
  ]);
  const buffer = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
  await page
    .getByLabel("現場写真ファイル")
    .setInputFiles({ name: "回転写真.jpg", mimeType: "image/jpeg", buffer });
  await expect(page.locator(".file-name")).toHaveText("回転写真.jpg");
  await expect(page.locator(".photo-file")).toContainText("600 × 800");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG保存", exact: true }).click();
  const png = await readFile((await (await promise).path())!);
  expect(png.readUInt32BE(16)).toBe(600);
  expect(png.readUInt32BE(20)).toBe(800);
  const topRight = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 800;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(595, 5, 1, 1).data);
  }, png.toString("base64"));
  expect(topRight[0]).toBeGreaterThan(190);
  expect(topRight[1]).toBeLessThan(115);
});

test("大きな画像は縦横比を保ち最大4096pxに縮小して保存する", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await start(page);
  await upload(page, 4500, 2250, "高解像度.png");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG保存", exact: true }).click();
  const png = await readFile((await (await promise).path())!);
  expect(png.readUInt32BE(16)).toBe(4096);
  expect(png.readUInt32BE(20)).toBe(2048);
});

test("狭い画面でも横にはみ出さず操作できる", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await change(page, "見下ろし角度", 35);
  const box = (await page.locator(".photo-stage").boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(1.6, 2);
});

test("回転・カメラのドラッグを区別し、数値入力の範囲と小数を正規化する", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await start(page);
  const stage = page.locator(".photo-stage");
  const box = (await stage.boundingBox())!;
  const drag = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 40,
      box.y + box.height / 2 + 20,
      { steps: 3 },
    );
    await page.mouse.up();
  };
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await drag();
  await expect(page.getByLabel("左右の回転", { exact: true })).toHaveValue(
    "16",
  );
  await expect(page.getByLabel("前後の傾き", { exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await drag();
  await expect(page.getByLabel("見る方向", { exact: true })).toHaveValue("42");
  await expect(page.getByLabel("見下ろし角度", { exact: true })).toHaveValue(
    "18",
  );
  await page.getByRole("button", { name: "移動", exact: true }).click();
  const x = page.getByLabel("横位置", { exact: true });
  await x.fill("150");
  await x.press("Tab");
  await expect(x).toHaveValue("100");
  await x.fill("");
  await x.press("Tab");
  await expect(x).toHaveValue("100");
  await x.fill("18.123");
  await x.press("Tab");
  await expect(x).toHaveValue("18.1");
  await x.fill("18.123");
  await x.press("Tab");
  await expect(x).toHaveValue("18.1");
  await expect(
    page.getByRole("slider", { name: "横位置のスライダー" }),
  ).toHaveValue("18.1");
});

test("3D描画が失われたら案内を表示し、誤ったPNGの保存を止める", async ({
  page,
}) => {
  await start(page);
  await page.locator(".equipment-canvas").evaluate((element) => {
    const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
    gl.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(page.getByRole("alert")).toContainText(
    "グラフィックアクセラレーション",
  );
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".scene-error")).toContainText(
    "3D表示を利用できません",
  );
});
