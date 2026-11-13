import { test, expect } from '@playwright/test';

// AI Chat must use the platform-managed OpenAI route. Customers never supply
// provider credentials in browser storage or request headers.
test.use({ storageState: './tests/e2e-auth-state.json' });

test('Global AI Chat streams through platform-managed OpenAI without a customer API key', async ({ page }) => {
  let capturedRequest: { stream?: boolean; messages?: Array<{ role: string; content: string }> } | null = null;
  let capturedAuthorization = '';
  let legacyProviderRequests = 0;

  await page.route('**/api/ai/chat', async (route) => {
    const body = route.request().postDataJSON() as { stream?: boolean; messages?: Array<{ role: string; content: string }> } | null;
    if (body?.messages) {
      capturedRequest = body;
      capturedAuthorization = route.request().headers()['authorization'] || '';
    }
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
      body: [
        'data: {"model":"gpt-4.1-mini","choices":[{"delta":{"content":"OpenAI platform chat response."}}]}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n'),
    });
  });
  await page.route('**/api/providers/openrouter/**', async (route) => {
    legacyProviderRequests += 1;
    await route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'AI Chat' }).click();

  const composer = page.getByPlaceholder('Message VYRA AI…');
  await expect(composer).toBeVisible();
  await composer.fill('Explain how quantum computing works in simple terms.');
  await composer.press('Enter');

  await expect(page.getByText('OpenAI platform chat response.')).toBeVisible();
  expect(capturedRequest?.stream).toBe(true);
  expect(capturedRequest?.messages?.some((message) => message.role === 'user' && message.content.includes('quantum computing'))).toBe(true);
  expect(capturedAuthorization).toMatch(/^Bearer\s+\S+/i);
  expect(legacyProviderRequests).toBe(0);
});
