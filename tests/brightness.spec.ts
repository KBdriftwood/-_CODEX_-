import { test, expect } from '@playwright/test';

test('背景に応じた補正・手動調整・リセット・設備ごとの独立性', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const ready = () => expect(page.getByRole('button', { name: 'PNG保存', exact: true })).toBeEnabled();
  await ready();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, 200, 300);
    ctx.fillStyle = '#eeeeee'; ctx.fillRect(200, 0, 200, 300);
    return c.toDataURL().split(',')[1];
  });
  await page.getByLabel('現場写真ファイル', { exact: true }).setInputFiles({ name: 'light-dark.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  const change = async (label: string, value: string) => {
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    await input.fill(value); await input.press('Tab'); await ready();
  };
  await change('横位置', '25');
  const image = () => page.locator('.equipment-canvas').evaluate(el => (el as HTMLCanvasElement).toDataURL());
  const luminance = () => page.locator('.equipment-canvas').evaluate(el => {
    const source = el as HTMLCanvasElement;
    const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
    const ctx = c.getContext('2d')!; ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i+3] > 250) { sum += pixels[i] + pixels[i+1] + pixels[i+2]; count++; }
    return sum / count;
  });
  const automatic = page.getByRole('checkbox', { name: '背景に合わせて自動補正' });
  const darkAuto = await luminance();
  await automatic.uncheck(); await ready();
  const neutral = await luminance(); expect(darkAuto).toBeLessThan(neutral);
  await change('横位置', '75');
  await automatic.check(); await ready();
  expect(await luminance()).toBeGreaterThan(neutral);
  await automatic.uncheck(); await ready();
  const original = await image();
  await change('明るさの微調整', '60');
  expect(await luminance()).toBeLessThan(neutral);
  await page.getByRole('button', { name: '明るさを元に戻す', exact: true }).click(); await ready();
  await expect(automatic).not.toBeChecked();
  expect(await image()).toBe(original);
  await change('明るさの微調整', '70');
  await page.getByRole('button', { name: '設備を追加', exact: true }).click(); await ready();
  await expect(page.getByRole('spinbutton', { name: '明るさの微調整', exact: true })).toHaveValue('100');
  await page.locator('.placed-select').first().click();
  await expect(page.getByRole('spinbutton', { name: '明るさの微調整', exact: true })).toHaveValue('70');
  await expect(automatic).not.toBeChecked();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG保存', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
