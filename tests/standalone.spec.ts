import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

test.beforeAll(() => {
  execFileSync(
    process.execPath,
    [resolve("node_modules/vite/bin/vite.js"), "build", "--mode", "standalone"],
    { stdio: "pipe" },
  );
  execFileSync(process.execPath, [resolve("scripts/inline-standalone.mjs")], {
    stdio: "pipe",
  });
});

test("単一HTMLの内容だけで、ネット未接続でも写真・修復・3D・PNG・PDF結合を利用できる", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const networkRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) networkRequests.push(request.url());
  });
  const directory = testInfo.outputPath("確認用 フォルダー");
  await mkdir(directory, { recursive: true });
  const html = resolve(directory, "LP-VISION.html");
  // 付属のJS・CSS・画像を持たないフォルダーに移して検証する。
  await copyFile(resolve("dist-standalone/LP-VISION.html"), html);
  // この環境のChromiumはfile:を管理ポリシーで禁止している。
  // HTML本体だけを応答し、残りの通信はオフラインとCSPで禁止する。
  const documentUrl = "http://127.0.0.1:5173/__standalone_check__/";
  await page.route(documentUrl, async (route) =>
    route.fulfill({
      body: await readFile(html),
      contentType: "text/html; charset=utf-8",
      headers: {
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'",
      },
    }),
  );
  await context.setOffline(true);
  await page.goto(documentUrl);
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator(".file-name")).toHaveText(
    "サンプル背景（イラスト）",
  );

  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#93a6b0";
    ctx.fillRect(0, 0, 900, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("現場写真ファイル").setInputFiles({
    name: "現場写真.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.locator(".file-name")).toHaveText("現場写真.png");
  const x = page.getByLabel("横位置", { exact: true });
  await x.fill("38");
  await x.press("Tab");
  await page.getByRole("slider", { name: "表示倍率のスライダー" }).fill("85");
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await page.getByLabel("左右の回転", { exact: true }).fill("-35");
  await page.getByRole("button", { name: "カメラ", exact: true }).click();
  await page.getByLabel("見下ろし角度", { exact: true }).fill("25");
  await page.getByLabel("遠近感（画角）", { exact: true }).fill("55");
  await page.getByLabel("遠近感（画角）", { exact: true }).press("Tab");
  const pixels = await page.locator(".equipment-canvas").evaluate((source) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source as HTMLCanvasElement, 0, 0, 128, 128);
    const rgba = ctx.getImageData(0, 0, 128, 128).data;
    let count = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 96) count++;
    return count;
  });
  expect(pixels).toBeGreaterThan(200);
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG保存", exact: true }).click();
  const download = await promise;
  const png = await readFile((await download.path())!);
  expect(download.suggestedFilename()).toBe("現場写真_完成イメージ.png");
  expect(png.readUInt32BE(16)).toBe(900);
  expect(png.readUInt32BE(20)).toBe(600);
  await page.getByRole("button", { name: "初期状態に戻す" }).click();
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("54");
  await expect(page.locator(".file-name")).toHaveText("現場写真.png");
  await page
    .getByRole("button", { name: "写真を簡易修復", exact: true })
    .click();
  const repair = page.getByLabel("簡易修復の作業写真", { exact: true });
  const box = (await repair.boundingBox())!;
  await repair.click({
    position: { x: box.width * 0.25, y: box.height * 0.25 },
  });
  await repair.click({
    position: { x: box.width * 0.75, y: box.height * 0.65 },
  });
  await page
    .getByRole("button", { name: "修復を背景に反映", exact: true })
    .click();
  await expect(page.locator(".file-name")).toHaveText("現場写真_修復済み.png");
  await page.getByRole("button", { name: "サンプル背景", exact: true }).click();
  await expect(page.locator(".file-name")).toHaveText(
    "サンプル背景（イラスト）",
  );
  await page.getByLabel("追加する設備").selectOption("vaporizer");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await expect(page.locator(".placed-row")).toHaveCount(2);
  await page.getByLabel("追加する設備").selectOption("gas-pipe");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  const length = page.getByLabel("配管の仮長さ", { exact: true });
  await length.fill("");
  await expect(length).toHaveValue("");
  await length.pressSequentially("6.8");
  await length.press("Enter");
  await expect(length).toHaveValue("6.8");
  await page.getByLabel("配管の形状").selectOption("u");
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await page.getByLabel("左右の回転", { exact: true }).fill("60");
  await page.getByLabel("左右の回転", { exact: true }).press("Tab");
  await expect(page.locator(".placed-row")).toHaveCount(3);

  await page.getByRole("button", { name: "2 比較・提案書" }).click();
  await page
    .getByRole("button", { name: "A4横・左右に比較", exact: true })
    .click();
  const attachment = await PDFDocument.create();
  attachment.addPage([320, 450]);
  await page.getByLabel("追加するPDFファイル").setInputFiles({
    name: "見積書.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await attachment.save()),
  });
  await expect(page.locator(".pdf-order li")).toHaveCount(2);
  const pdfPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "切替提案書PDFを保存", exact: true })
    .click();
  const pdf = await PDFDocument.load(
    await readFile((await (await pdfPromise).path())!),
  );
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [841.89, 595.28],
    [320, 450],
  ]);
  expect(errors).toEqual([]);
  expect(networkRequests).toEqual([documentUrl]);
});
