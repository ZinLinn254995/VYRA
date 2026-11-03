import type { Page } from '@playwright/test';

/**
 * Provides a deterministic, non-production Supabase session for browser tests.
 * The Vite test server is configured with the matching e2e-test project URL.
 */
export async function installAuthenticatedE2ESession(page: Page) {
  await page.addInitScript(() => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem('sb-e2e-test-auth-token', JSON.stringify({
      access_token: 'e2e-test-access-token-not-a-real-credential',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'e2e-test-refresh-token-not-a-real-credential',
      user: {
        id: 'e2e-test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e-user@example.invalid',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    }));
  });
  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true, user: { id: 'e2e-test-user-id' } }),
    });
  });
}
