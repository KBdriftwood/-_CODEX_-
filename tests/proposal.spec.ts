import { test, expect, type Page } from "@playwright/test";
import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFRawStream,
  PDFArray,
  decodePDFRawStream,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
test.setTimeout(60_000);

async function start(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled({ timeout: 15_000 });
}
async function change(page: Page, label: string, value: number) {
  const input = page.getByRole("spinbutton", { name: label, exact: true });
  await input.fill(String(value));
  await input.press("Tab");
  await expect(input).toHaveValue(String(value));
}
async function image(page: Page, color: string, width = 900, height = 600) {
  return Buffer.from(
    await page.evaluate(
      ({ color, width, height }) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
        return canvas.toDataURL().split(",")[1];
      },
      { color, width, height },
    ),
    "base64",
  );
}
async function upload(
  page: Page,
  label: string,
  color: string,
  name: string,
  width = 900,
  height = 600,
) {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name,
    mimeType: "image/png",
    buffer: await image(page, color, width, height),
  });
}
async function colorOf(page: Page, selector: string) {
  return page.locator(selector).evaluate(async (element) => {
    const img = element as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  });
}
function pageContents(pdf: PDFDocument, index: number) {
  const contents = pdf.getPage(index).node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref))
      : [contents];
  return streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream))
        throw new Error("PDFページの描画内容がありません。");
      return Buffer.from(decodePDFRawStream(stream).decode()).toString(
        "latin1",
      );
    })
    .join("\n");
}

async function pdfDownload(page: Page, name = "切替提案書PDFを保存") {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await promise;
  return { download, bytes: await readFile((await download.path())!) };
}

test("8種類の設備を追加でき、選択設備ごとに位置と回転を保持する", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await start(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await change(page, "横位置", 20);
  const ids = [
    "sample-bulk",
    "foundation",
    "barrier",
    "vaporizer",
    "heater",
    "gas-pipe",
    "hot-pipe",
  ];
  for (const id of ids) {
    await page.getByLabel("追加する設備").selectOption(id);
    await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  }
  await expect(page.locator(".placed-row")).toHaveCount(8);
  await change(page, "横位置", 80);
  await page.getByRole("button", { name: "設備の回転", exact: true }).click();
  await change(page, "左右の回転", 45);
  await page
    .getByRole("button", { name: "縦バルク 1を選択", exact: true })
    .click();
  await expect(page.getByLabel("左右の回転", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "移動", exact: true }).click();
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("20");
  await page
    .getByRole("button", { name: "お湯配管 8を選択", exact: true })
    .click();
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("80");
  const before = await page
    .locator(".equipment-canvas")
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByLabel("配管の仮長さ", { exact: true }).fill("4.5");
  await page.getByLabel("配管の形状").selectOption("u");
  await expect(
    page.getByRole("button", { name: "PNG保存", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page
        .locator(".equipment-canvas")
        .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
    )
    .not.toBe(before);
  await expect(page.getByLabel("表示倍率", { exact: true })).toHaveValue("100");
  await page.getByRole("button", { name: "選択設備を複製" }).click();
  await expect(page.locator(".placed-row")).toHaveCount(9);
  await expect(page.getByLabel("配管の仮長さ", { exact: true })).toHaveValue(
    "4.5",
  );
  await page.getByRole("button", { name: "選択設備を削除" }).click();
  await expect(page.locator(".placed-row")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("写真上の設備をクリックして選択し、他の設備を動かさずドラッグできる", async ({
  page,
}) => {
  await start(page);
  await change(page, "横位置", 20);
  await page.getByLabel("追加する設備").selectOption("sample-bulk");
  await page.getByRole("button", { name: "設備を追加", exact: true }).click();
  await change(page, "横位置", 77);
  await page
    .getByRole("button", { name: "縦バルク 1を選択", exact: true })
    .click();
  const point = await page.locator(".equipment-canvas").evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(element as HTMLCanvasElement, 0, 0, 200, 200);
    const pixels = ctx.getImageData(0, 0, 200, 200).data;
    for (let y = 60; y < 140; y++)
      for (let x = 135; x < 180; x++) {
        let inside = true;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (pixels[((y + dy) * 200 + x + dx) * 4 + 3] < 250) inside = false;
        if (inside) return { x: x / 200, y: y / 200 };
      }
    throw new Error("横バルクの実描画が見つかりません。");
  });
  const box = (await page.locator(".photo-stage").boundingBox())!;
  await page.mouse.move(
    box.x + box.width * point.x,
    box.y + box.height * point.y,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * (point.x + 0.03),
    box.y + box.height * point.y,
    { steps: 3 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "横バルク 2を選択", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("80");
  await page
    .getByRole("button", { name: "縦バルク 1を選択", exact: true })
    .click();
  await expect(page.getByLabel("横位置", { exact: true })).toHaveValue("20");
});

test("加工済み写真を背景にしても元写真を保持し、比率違いを拒否して取り消せる", async ({
  page,
}) => {
  await start(page);
  await upload(page, "現場写真ファイル", "#cc5533", "元写真.png");
  await expect(page.locator(".file-name")).toHaveText("元写真.png");
  await upload(page, "加工済み写真ファイル", "#338866", "加工済み.png");
  await expect(page.locator(".file-name")).toHaveText("加工済み.png");
  await upload(
    page,
    "加工済み写真ファイル",
    "#3366cc",
    "比率違い.png",
    600,
    900,
  );
  await expect(page.getByRole("alert")).toContainText("同じ縦横比");
  await expect(page.locator(".file-name")).toHaveText("加工済み.png");
  await page.getByRole("button", { name: "2 比較・提案書" }).click();
  await expect(page.getByAltText("比較用の元の写真")).toBeVisible();
  expect(await colorOf(page, 'img[alt="比較用の元の写真"]')).toEqual([
    204, 85, 51,
  ]);
  expect(await colorOf(page, 'img[alt="加工後の写真と配置した設備"]')).toEqual([
    51, 136, 102,
  ]);
  await page
    .getByRole("button", { name: "元の写真を拡大", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "1 設備を配置" }).click();
  await page.getByRole("button", { name: "背景を1つ戻す" }).click();
  await expect(page.locator(".file-name")).toHaveText("元写真.png");
  expect(await colorOf(page, ".background-photo")).toEqual([204, 85, 51]);
});

for (const orientation of ["portrait", "landscape"] as const) {
  test(`A4${orientation === "portrait" ? "縦" : "横"}の比較PDFに日本語と元写真・完成予想を収める`, async ({
    page,
  }) => {
    await start(page);
    await upload(page, "現場写真ファイル", "#cc5533", "元写真.png");
    await upload(page, "加工済み写真ファイル", "#338866", "加工済み.png");
    await expect(page.locator(".file-name")).toHaveText("加工済み.png");
    await page.getByRole("button", { name: "2 比較・提案書" }).click();
    await expect(page.getByLabel("提案書の題名", { exact: true })).toHaveValue("LPガス設備 Before After");
    await expect(page.getByLabel("会社名・担当者", { exact: true })).toHaveValue("ニイミ産業");
    await page.getByLabel("お客様名", { exact: true }).fill("株式会社テスト");
    await page.getByLabel("現場名", { exact: true }).fill("東京工場");
    await page
      .getByRole("button", {
        name:
          orientation === "portrait" ? "A4縦・上下に比較" : "A4横・左右に比較",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "印刷プレビュー", exact: true })
      .click();
    const canvas = page.getByLabel(
      `A4${orientation === "portrait" ? "縦" : "横"}の印刷プレビュー`,
      { exact: true },
    );
    await expect(canvas).toBeVisible();
    const dimensions = orientation === "portrait" ? [2480, 3508] : [3508, 2480];
    await expect
      .poll(() =>
        canvas.evaluate((c) => [
          (c as HTMLCanvasElement).width,
          (c as HTMLCanvasElement).height,
        ]),
      )
      .toEqual(dimensions);
    const { download, bytes } = await pdfDownload(page);
    expect(download.suggestedFilename()).toBe("株式会社テスト_切替提案書.pdf");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("LPガス設備 Before After");
    const first = pdf.getPage(0);
    expect(first.getWidth()).toBeCloseTo(
      orientation === "portrait" ? 595.28 : 841.89,
      1,
    );
    expect(first.getHeight()).toBeCloseTo(
      orientation === "portrait" ? 841.89 : 595.28,
      1,
    );
    const objects = first.node
      .Resources()!
      .lookup(PDFName.of("XObject"), PDFDict);
    const raster = pdf.context.lookup(objects.values()[0]);
    if (!(raster instanceof PDFRawStream))
      throw new Error("比較ページの画像がありません。");
    expect(raster.dict.get(PDFName.of("Width"))!.toString()).toBe(
      String(dimensions[0]),
    );
    expect(raster.dict.get(PDFName.of("Height"))!.toString()).toBe(
      String(dimensions[1]),
    );
    // 保存PDFに実際に入ったJPEGから、元写真と加工後の色を別々の位置で検証。
    const samples = await page.evaluate(
      async ({ base64, orientation }) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${base64}`;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = image.width;
        c.height = image.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const positions =
          orientation === "portrait"
            ? [
                [1240, 750],
                [1240, 2150],
              ]
            : [
                [300, 900],
                [2000, 900],
              ];
        return positions.map(([x, y]) =>
          Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3),
        );
      },
      { base64: Buffer.from(raster.contents).toString("base64"), orientation },
    );
    expect(samples[0][0]).toBeGreaterThan(180);
    expect(samples[0][1]).toBeLessThan(110);
    expect(samples[1][0]).toBeLessThan(80);
    expect(samples[1][1]).toBeGreaterThan(110);
    await page.screenshot({
      path: test.info().outputPath(`A4-${orientation}.png`),
      fullPage: true,
    });
  });
}

test("複数PDFを追加・並べ替え・削除し、各書類のページ寸法を保って結合する", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "2 比較・提案書" }).click();
  const a = await PDFDocument.create();
  a.addPage([320, 420]).drawText("Quotation page 1");
  a.addPage([420, 320]).drawText("Quotation page 2");
  const b = await PDFDocument.create();
  b.addPage([700, 500]).drawText("Drawing page");
  const sourceA = await PDFDocument.load(await a.save());
  const sourceB = await PDFDocument.load(await b.save());
  await page.getByLabel("追加するPDFファイル").setInputFiles([
    {
      name: "見積書.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await a.save()),
    },
    {
      name: "図面.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await b.save()),
    },
  ]);
  await expect(page.locator(".pdf-order li")).toHaveCount(3);
  await expect(page.locator(".proposal-controls")).toContainText("4ページ");
  await page.getByRole("button", { name: "3番目のPDFを上へ" }).click();
  await page.getByRole("button", { name: "2番目のPDFを上へ" }).click();
  await page.getByRole("button", { name: "1 設備を配置" }).click();
  await page.getByRole("button", { name: "2 比較・提案書" }).click();
  await expect(page.locator(".pdf-order li").first()).toContainText("図面.pdf");
  let pdf = await PDFDocument.load((await pdfDownload(page)).bytes);
  expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [700, 500],
    [595.28, 841.89],
    [320, 420],
    [420, 320],
  ]);
  expect(pageContents(pdf, 0)).toBe(pageContents(sourceB, 0));
  expect(pageContents(pdf, 2)).toBe(pageContents(sourceA, 0));
  expect(pageContents(pdf, 3)).toBe(pageContents(sourceA, 1));
  await page.getByRole("button", { name: "2番目のPDFを削除" }).click();
  pdf = await PDFDocument.load(
    (await pdfDownload(page, "メール添付用PDFを保存")).bytes,
  );
  expect(pdf.getPageCount()).toBe(3);
  await expect(page.getByRole("status")).toContainText("普段のメール");
  const mailto = await page
    .getByRole("link", { name: "メール作成画面を開く" })
    .getAttribute("href");
  expect(mailto).toMatch(/^mailto:/);
  expect(decodeURIComponent(mailto!)).toContain("PDFを添付");
  await page.getByLabel("追加するPDFファイル").setInputFiles({
    name: "不正.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a PDF"),
  });
  await expect(page.getByRole("alert")).toContainText("PDFを読み込めません");
  await expect(page.locator(".pdf-order li")).toHaveCount(2);
});

test("印刷に選択した用紙の向きと比較画像を渡し、狭い画面でも操作できる", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "2 比較・提案書" }).click();
  await page
    .getByRole("button", { name: "A4横・左右に比較", exact: true })
    .click();
  await page.evaluate(() => {
    const original = document.createElement.bind(document);
    document.createElement = ((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      const element = original(tag, options);
      if (tag === "iframe")
        element.addEventListener("load", () => {
          (element as HTMLIFrameElement).contentWindow!.print = () => {};
        });
      return element;
    }) as typeof document.createElement;
  });
  await page
    .getByRole("button", { name: "比較ページを印刷", exact: true })
    .click();
  const frame = page.frameLocator('iframe[title="比較ページの印刷"]');
  await expect(frame.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/jpeg/,
  );
  expect(await frame.locator("style").textContent()).toContain(
    "size:A4 landscape",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "切替提案書PDFを保存", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
