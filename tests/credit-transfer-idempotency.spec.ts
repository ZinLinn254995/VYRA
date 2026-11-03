import { test, expect } from '@playwright/test';

// Wallet API calls require a signed-in VYRA session. All server responses are mocked.
test.use({ storageState: './tests/e2e-auth-state.json' });

test('credit transfer retry reuses the original idempotency key after an uncertain response', async ({ page }) => {
  const submitted: Array<Record<string, unknown>> = [];

  await page.route('**/api/auth/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true }),
    });
  });

  await page.route('**/api/credits/wallet', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: { username: 'sender', displayName: 'Sender' },
        availableBalance: '100',
        reservedBalance: '0',
        recentActivity: [],
      }),
    });
  });

  await page.route('**/api/credits/recipients**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipients: [{ userId: '20000000-0000-4000-8000-000000000001', username: 'friend', displayName: 'Friend' }],
      }),
    });
  });

  await page.route('**/api/credits/transfers', async route => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ transfers: [] }) });
      return;
    }
    submitted.push(route.request().postDataJSON() as Record<string, unknown>);
    if (submitted.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Transfer status is not confirmed. Check wallet history before retrying.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transfer: { id: '30000000-0000-4000-8000-000000000001' } }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Credit Wallet' }).click();
  await expect(page.getByRole('heading', { name: 'Credit Wallet' })).toBeVisible();

  await page.getByPlaceholder('Search username…').fill('fri');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /@friend/ }).click();
  await page.getByPlaceholder('Enter amount').fill('25');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & send' }).click();

  await expect(page.getByRole('alert')).toContainText('Transfer status is not confirmed');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(submitted).toHaveLength(1);

  // The server response was ambiguous. Re-reviewing the exact same transfer
  // must reuse the original key rather than minting a second transfer request.
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm & send' }).click();

  await expect(page.getByRole('status')).toContainText('Credits sent successfully');
  expect(submitted).toHaveLength(2);
  expect(submitted[1].idempotencyKey).toBe(submitted[0].idempotencyKey);
  expect(submitted[1]).toMatchObject({
    recipientUserId: submitted[0].recipientUserId,
    amount: submitted[0].amount,
    note: submitted[0].note,
  });
});
