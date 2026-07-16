import { expect, test } from '@playwright/test';

test('creates a novel draft through the real local backend and locates it after refresh', async ({ page }) => {
  if (process.env.E2E_FORCE_BROWSER_ASSERTION_FAILURE === '1') {
    await page.goto('/novels');
    await expect(page.getByText('RP-01A forced browser assertion failure')).toBeVisible();
    return;
  }

  const title = `RP-01A 浏览器验收 ${process.env.E2E_RUN_ID ?? Date.now()}`;

  const listResponse = page.waitForResponse((response) => response.url().includes('/novels') && response.status() === 200);
  await page.goto('/novels');
  await listResponse;
  await expect(page.getByRole('heading', { name: '小说列表' })).toBeVisible();

  await page.getByRole('button', { name: '创建小说' }).click();
  await expect(page.getByRole('heading', { name: '创建小说草稿' })).toBeVisible();
  await page.getByRole('textbox', { name: '小说标题' }).fill(title);

  const createResponse = page.waitForResponse(
    (response) => response.url().includes('/novels/drafts') && response.request().method() === 'POST'
  );
  await page.getByRole('button', { name: '创建草稿' }).click();
  const response = await createResponse;
  expect(response.status()).toBe(201);
  const payload = await response.json();
  expect(payload.success).toBe(true);
  expect(payload.data.title).toBe(title);

  await expect(page).toHaveURL(/\/novels\?created=/);
  await expect(page.getByText(title)).toBeVisible();

  const reloadResponse = page.waitForResponse((item) => item.url().includes('/novels') && item.status() === 200);
  await page.reload();
  await reloadResponse;
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText('后端接口')).toBeVisible();
});
