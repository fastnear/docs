const { test, expect } = require("@playwright/test");

async function verifyInteraction(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder="Paste API key"]').waitFor();

  const metaLayout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(
      ".fastnear-interaction__meta-item, .standalone-meta-card"
    ));
    return cards.slice(0, 3).map((card) => {
      const rect = card.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) };
    });
  });

  expect(metaLayout.length).toBeGreaterThanOrEqual(3);
  expect(metaLayout[1].y).toBeGreaterThan(metaLayout[0].y);
  expect(metaLayout[2].y).toBeGreaterThan(metaLayout[1].y);

  await expect(page.getByRole("button", { name: "Copy curl command" })).toBeVisible();

  await page.evaluate(() => {
    window.__originalFetch = window.fetch;
    window.__lastRequestBody = null;
    window.fetch = async (...args) => {
      const [, init] = args;
      window.__lastRequestBody = init?.body || null;
      return window.__originalFetch(...args);
    };
  });

  const finalitySelect = page.locator('select[aria-label="Select finality"]').first();
  await finalitySelect.selectOption("near-final");
  await page.getByRole("button", { name: "Send request" }).click();

  await expect.poll(async () => {
    return page.evaluate(() => window.__lastRequestBody);
  }).not.toBeNull();

  const requestBody = await page.evaluate(() => JSON.parse(window.__lastRequestBody));
  expect(requestBody.params.finality).toBe("near-final");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(url).origin,
  });
  await page.getByRole("button", { name: "Copy curl command" }).click();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('"finality":"near-final"');
}

test("Redocly pilot uses stacked meta cards and finality-aware requests", async ({ page }) => {
  await verifyInteraction(page, "http://127.0.0.1:4000/rpcs/account/view_account");
});

test("Standalone pilot uses stacked meta cards and finality-aware requests", async ({ page }) => {
  await verifyInteraction(page, "http://127.0.0.1:4010/rpcs/account/view_account");
});
