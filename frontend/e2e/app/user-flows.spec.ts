import { test, expect } from '../test-with-coverage';
import { waitForPageLoad } from '../fixtures';
import { HOME_TO_BLOG, HOME_TO_CATALOG, CATALOG_BROWSE } from '../helpers/flow-tags';

test.describe('User Flows', () => {
  test('should navigate from home to blog detail', { tag: [...HOME_TO_BLOG] }, async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    const readBlogsBtn = page.locator('text=Read blogs');
    if (await readBlogsBtn.isVisible()) {
      await readBlogsBtn.click();
      await waitForPageLoad(page);
    } else {
      await page.goto('/blogs');
      await waitForPageLoad(page);
    }

    await expect(page).toHaveURL(/.*blogs/);

    const blogCards = page.locator('a[href^="/blogs/"]');
    const count = await blogCards.count();

    if (count > 0) {
      // quality: allow-fragile-selector (blog list links uniquely scoped by href pattern)
      await blogCards.first().click();
      await waitForPageLoad(page);
      await expect(page).toHaveURL(/.*blogs\/.+/);
    }
  });

  test('should navigate from home to product detail', { tag: [...HOME_TO_CATALOG, '@outcome:success'] }, async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    // quality: allow-fragile-selector (catalog CTA link scoped by href)
    const catalogLink = page.getByRole('link', { name: /Explorar catálogo|Shop now/i }).first();
    if (await catalogLink.isVisible()) {
      await catalogLink.click();
      await page.waitForURL(/.*catalog/, { timeout: 10_000 });
    } else {
      await page.goto('/catalog');
    }
    await waitForPageLoad(page);

    await expect(page).toHaveURL(/.*catalog/);

    // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
    const peluchCards = page.locator('a[href^="/peluches/"]');
    const count = await peluchCards.count();

    if (count > 0) {
      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.first().click();
      await page.waitForURL(/.*peluches\/.+/, { timeout: 10_000 });
      await expect(page).toHaveURL(/.*peluches\/.+/);
    }
  });

  test('should browse multiple peluches in catalog', { tag: [...CATALOG_BROWSE, '@outcome:display'] }, async ({ page }) => {
    await page.goto('/catalog');
    await waitForPageLoad(page);

    // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
    const peluchCards = page.locator('a[href^="/peluches/"]');
    const count = await peluchCards.count();

    if (count >= 3) {
      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.nth(0).click();
      await waitForPageLoad(page);
      await expect(page).toHaveURL(/.*peluches\/.+/);

      await page.goto('/catalog');
      await waitForPageLoad(page);

      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.nth(1).click();
      await waitForPageLoad(page);
      await expect(page).toHaveURL(/.*peluches\/.+/);

      await page.goto('/catalog');
      await waitForPageLoad(page);

      // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
      await peluchCards.nth(2).click();
      await waitForPageLoad(page);
      await expect(page).toHaveURL(/.*peluches\/.+/);
    }
  });

  test('should use browser back button correctly', { tag: [...HOME_TO_CATALOG, '@outcome:success'] }, async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);

    await page.goto('/catalog');
    await waitForPageLoad(page);

    // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
    const peluchCards = page.locator('a[href^="/peluches/"]');
    await expect(peluchCards.first()).toBeVisible();

    // quality: allow-fragile-selector (peluch list links uniquely scoped by href pattern)
    await peluchCards.first().click();
    await expect(page).toHaveURL(/\/peluches\/[^/?]+/);
    await waitForPageLoad(page);

    await page.goBack();
    await waitForPageLoad(page);
    await expect(page).toHaveURL(/\/catalog(?:\?.*)?$/);

    await page.goBack();
    await waitForPageLoad(page);
    await expect(page).toHaveURL('/');
  });

});
