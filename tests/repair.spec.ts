import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60_000);
async function start(page: Page, width: number, height: number) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
  const data = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#93a6b0";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#338866";
      ctx.fillRect(width * 0.1, height * 0.1, width * 0.3, height * 0.3);
      ctx.fillStyle = "#cc5533";
      ctx.fillRect(
        width * 0.72,
        height * 0.65 - width * 0.03,
        width * 0.06,
        width * 0.06,
      );
      return canvas.toDataURL().split(",")[1];
    },
    { width, height },
  );
  await page
    .getByLabel("現場写真ファイル")
    .setInputFiles({
      name: "修復の現場.png",
      mimeType: "image/png",
      buffer: Buffer.from(data, "base64"),
    });
  await expect(page.locator(".file-name")).toHaveText("修復の現場.png");
  await page.getByLabel("横位置", { exact: true }).fill("20");
  await page.getByLabel("横位置", { exact: true }).press("Tab");
}
async function brush(page: Page) {
  const canvas = page.getByLabel("簡易修復の作業写真", { exact: true });
  const box = (await canvas.boundingBox())!;
  await page
    .getByRole("slider", { name: "修復ブラシの大きさ", exact: true })
    .fill("12");
  await page
    .getByRole("slider", { name: "修復ブラシの境界のぼかし", exact: true })
    .fill("0");
  await page.getByRole("button", { name: "修復元を選ぶ", exact: true }).click();
  await canvas.click({
    position: { x: box.width * 0.25, y: box.height * 0.25 },
  });
  await expect(
    page.getByRole("button", { name: "塗って修復", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.765, box.y + box.height * 0.65, {
    steps: 3,
  });
  await page.mouse.up();
}
async function pixel(page: Page, selector: string, x = 0.75, y = 0.65) {
  return page.locator(selector).evaluate(
    async (element, point) => {
      const canvas = document.createElement("canvas");
      if (element instanceof HTMLImageElement) {
        await element.decode();
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
      } else {
        canvas.width = (element as HTMLCanvasElement).width;
        canvas.height = (element as HTMLCanvasElement).height;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(element as HTMLImageElement, 0, 0);
      return Array.from(
        ctx.getImageData(
          Math.round(canvas.width * point.x),
          Math.round(canvas.height * point.y),
          1,
          1,
        ).data,
      ).slice(0, 3);
    },
    { x, y },
  );
}
for (const [width, height] of [
  [900, 600],
  [600, 900],
]) {
  test(`${width}×${height}の簡易修復で指定部分だけを写し込み、取り消しと元写真の保持ができる`, async ({
    page,
  }) => {
    await start(page, width, height);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/.test(request.url())) requests.push(request.url());
    });
    await page
      .getByRole("button", { name: "写真を簡易修復", exact: true })
      .click();
    const canvas = 'canvas[aria-label="簡易修復の作業写真"]';
    await expect(
      page.getByRole("dialog", { name: "写真の簡易修復" }),
    ).toBeVisible();
    expect(await pixel(page, canvas)).toEqual([204, 85, 51]);
    await brush(page);
    expect(await pixel(page, canvas)).toEqual([51, 136, 102]);
    expect(await pixel(page, canvas, 0.95, 0.1)).toEqual([147, 166, 176]);
    await page
      .getByRole("button", { name: "修復を1回取り消す", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "修復を背景に反映", exact: true }),
    ).toBeDisabled();
    expect(await pixel(page, canvas)).toEqual([204, 85, 51]);
    await brush(page);
    await page
      .getByRole("button", { name: "修復を背景に反映", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "写真の簡易修復" }),
    ).toHaveCount(0);
    await expect(page.locator(".file-name")).toHaveText(
      "修復の現場_修復済み.png",
    );
    expect(await pixel(page, ".background-photo")).toEqual([51, 136, 102]);
    const bounds = (await page.locator(".photo-stage").boundingBox())!;
    expect(bounds.width / bounds.height).toBeCloseTo(width / height, 2);
    await page.getByRole("button", { name: "2 比較・提案書" }).click();
    expect(await pixel(page, 'img[alt="比較用の元の写真"]')).toEqual([
      204, 85, 51,
    ]);
    expect(await pixel(page, 'img[alt="加工後の写真と配置した設備"]')).toEqual([
      51, 136, 102,
    ]);
    await page.getByRole("button", { name: "1 設備を配置" }).click();
    await page
      .getByRole("button", { name: "背景を1つ戻す", exact: true })
      .click();
    expect(await pixel(page, ".background-photo")).toEqual([204, 85, 51]);
    expect(requests).toEqual([]);
  });
}
test("修復を全てやり直す操作と、反映せず閉じる操作で元の背景に戻せる", async ({
  page,
}) => {
  await start(page, 900, 600);
  const original = await page.locator(".background-photo").getAttribute("src");
  await page
    .getByRole("button", { name: "写真を簡易修復", exact: true })
    .click();
  await brush(page);
  await page
    .getByRole("button", { name: "この画面の修復をやり直す", exact: true })
    .click();
  expect(await pixel(page, 'canvas[aria-label="簡易修復の作業写真"]')).toEqual([
    204, 85, 51,
  ]);
  await expect(
    page.getByRole("button", { name: "修復を背景に反映", exact: true }),
  ).toBeDisabled();
  await brush(page);
  await page
    .getByRole("button", { name: "反映せず閉じる", exact: true })
    .click();
  await expect(page.locator(".background-photo")).toHaveAttribute(
    "src",
    original!,
  );
  await expect(page.locator(".file-name")).toHaveText("修復の現場.png");
});
