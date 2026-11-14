import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'compact-mobile', width: 320, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'wide-desktop', width: 1440, height: 900 },
];

async function openSection(page: import('@playwright/test').Page, label: 'Marketplace' | 'Workspace' | 'AI Chat') {
  const navigation = page.locator('nav[aria-label="Main navigation"]:visible');
  await navigation.getByRole('button', { name: label, exact: true }).click();
}

for (const viewport of viewports) {
  test(`Current VYRA shell and navigation fit ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
    await expect(page.locator('nav[aria-label="Main navigation"]:visible')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(errors).toEqual([]);
  });
}

test('Marketplace does not display fictional demo listings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No Vyrals listed yet' })).toBeVisible();
  await expect(page.getByText('Story Character Pack')).toHaveCount(0);
  await expect(page.getByText('Milo — The Explorer')).toHaveCount(0);
  await expect(page.getByText('Neon City at Night')).toHaveCount(0);
});

test('Workspace opens the Vyral and media libraries and storyboard creation entry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'Workspace');

  await expect(page.getByRole('heading', { name: 'My Storyboards' })).toBeVisible();
  await expect(page.getByRole('button', { name: /My Vyrals/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /My Media Library/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Storyboards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Storyboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Create Storyboard' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to access your account, credits and Workspace.')).toBeVisible();
});

test('Workspace asks guests to sign in before opening the cloud Media Library', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'Workspace');

  await page.getByRole('button', { name: /My Media Library/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByText('Sign in to access your account, credits and Workspace.')).toBeVisible();
});

test('AI Chat opens with its composer without starting a paid request', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await openSection(page, 'AI Chat');

  await expect(page.getByRole('heading', { name: 'Hello! What would you like to create today?' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message VYRA AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
});


test('Signed-in Media Library backfills a legacy image thumbnail without touching its original', async ({ page }) => {
  const userId = 'e2e-media-library-user';
  const folderRoot = 'e2e-folder-characters';
  const folderChild = 'e2e-folder-heroes';
  const itemId = 'e2e-legacy-image';
  const now = new Date().toISOString();
  const jwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = jwtPart({ alg: 'HS256', typ: 'JWT' }) + '.' + jwtPart({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.e2e-signature';
  const user = {
    id: userId, aud: 'authenticated', role: 'authenticated', email: null, phone: '',
    app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    user_metadata: { is_anonymous: true, display_name: 'Temporary Guest', session_kind: 'vyral_test_guest' },
    identities: [], created_at: now, is_anonymous: true,
  };
  const session = { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'e2e-refresh-token', user };
  const folders = [
    { id: folderRoot, user_id: userId, parent_id: null, name: 'Characters', created_at: now, updated_at: now },
    { id: folderChild, user_id: userId, parent_id: folderRoot, name: 'Heroes', created_at: now, updated_at: now },
    { id: 'e2e-folder-archive', user_id: userId, parent_id: null, name: 'Archive', created_at: now, updated_at: now },
  ];
  const item = {
    id: itemId, user_id: userId, folder_id: null, source_kind: 'upload', source_asset_id: null,
    bucket_id: 'vyral-assets', storage_path: userId + '/media-library/original.png',
    file_name: 'legacy-sample.png', mime_type: 'image/png', size_bytes: 68,
    metadata: {}, created_at: now, updated_at: now,
  };
  const originalPath = item.storage_path;
  const uploadedThumbnailPaths: string[] = [];
  const originalObjectMutations: string[] = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WioAAAAASUVORK5CYII=', 'base64');
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, prefer, x-upsert',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  };
  const json = (route: import('@playwright/test').Route, value: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(value) });

  await page.route('https://e2e-test.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (url.pathname.endsWith('/auth/v1/signup') && method === 'POST') return json(route, { user, session });
    if (url.pathname.endsWith('/auth/v1/user') && method === 'GET') return json(route, user);
    if (url.pathname.endsWith('/rest/v1/media_library_folders') && method === 'GET') return json(route, folders);
    if (url.pathname.endsWith('/rest/v1/media_library_items') && method === 'GET') return json(route, [item]);
    if (url.pathname.endsWith('/rest/v1/media_library_items') && method === 'PATCH') {
      const patch = request.postDataJSON() as { metadata?: Record<string, unknown> };
      if (patch.metadata) item.metadata = patch.metadata;
      const response = { id: itemId };
      return request.headers()['accept']?.includes('vnd.pgrst.object+json')
        ? json(route, response)
        : json(route, [response]);
    }
    if (url.pathname.includes('/storage/v1/object/sign/vyral-assets/')) {
      if (method === 'POST') {
        const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/sign/vyral-assets/')[1] ?? '');
        const signedURL = '/object/sign/vyral-assets/' + objectPath + '?token=e2e';
        return json(route, { signedURL });
      }
      if (method === 'GET') return route.fulfill({ status: 200, contentType: 'image/png', headers: corsHeaders, body: png });
    }
    if (url.pathname.includes('/storage/v1/object/authenticated/vyral-assets/') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', headers: corsHeaders, body: png });
    }
    if (url.pathname.includes('/storage/v1/object/vyral-assets/')) {
      const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/vyral-assets/')[1] ?? '');
      if (method === 'POST') {
        uploadedThumbnailPaths.push(objectPath);
        return json(route, { Key: objectPath });
      }
      if (method === 'DELETE' || method === 'PUT') {
        if (objectPath === originalPath) originalObjectMutations.push(method + ' ' + objectPath);
        return json(route, {});
      }
    }
    return json(route, {});
  });
  await page.route('**/api/auth/session', (route) => json(route, { authenticated: true }));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open user profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Open user profile' }).click();
  await page.getByRole('button', { name: /My Media Library/ }).click();

  await expect(page.getByText('legacy-sample.png')).toBeVisible();
  await expect.poll(() => uploadedThumbnailPaths.length).toBe(1);
  await expect.poll(() => typeof item.metadata.thumbnail_path === 'string').toBe(true);
  expect(uploadedThumbnailPaths[0]).toContain(userId + '/media-library-thumbnails/' + itemId + '-');
  expect(originalObjectMutations).toEqual([]);

  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('article img[alt=""]')).toBeVisible();
  expect(item.storage_path).toBe(originalPath);
});
