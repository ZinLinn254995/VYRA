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
  const folders: Array<{ id: string; user_id: string; parent_id: string | null; name: string; created_at: string; updated_at: string }> = [
    { id: folderRoot, user_id: userId, parent_id: null, name: 'Characters', created_at: now, updated_at: now },
    { id: folderChild, user_id: userId, parent_id: folderRoot, name: 'Heroes', created_at: now, updated_at: now },
    { id: 'e2e-folder-archive', user_id: userId, parent_id: null, name: 'Archive', created_at: now, updated_at: now },
  ];
  const item = {
    id: itemId, user_id: userId, folder_id: null, source_kind: 'upload', source_asset_id: null,
    bucket_id: 'vyral-assets', storage_path: userId + '/media-library/original.png',
    file_name: 'legacy-sample.png', mime_type: 'image/png', size_bytes: 82,
    metadata: {}, created_at: now, updated_at: now,
  };
  const unsupportedItem = {
    id: 'e2e-unsupported-image', user_id: userId, folder_id: null, source_kind: 'upload', source_asset_id: null,
    bucket_id: 'vyral-assets', storage_path: userId + '/media-library/unsupported.jpg',
    file_name: 'unsupported-image.jpg', mime_type: 'image/jpeg', size_bytes: 12,
    metadata: {}, created_at: now, updated_at: now,
  };
  const items = [item, unsupportedItem];
  const originalPath = item.storage_path;
  const unsupportedOriginalPath = unsupportedItem.storage_path;
  const invalidImage = Buffer.from('not-a-decodable-image');
  const uploadedThumbnailPaths: string[] = [];
  const uploadedOriginalPaths: string[] = [];
  const deletedMediaItemIds: string[] = [];
  const originalObjectMutations: string[] = [];
  const observedRequests: string[] = [];
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGO8o2HDQApgIkn1qIZRDUNKAwAGbAFgcb+cnwAAAABJRU5ErkJggg==', 'base64');
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
    observedRequests.push(method + ' ' + url.pathname + url.search);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
    if (url.pathname.endsWith('/auth/v1/signup') && method === 'POST') return json(route, { user, session });
    if (url.pathname.endsWith('/auth/v1/user') && method === 'GET') return json(route, user);
    if (url.pathname.endsWith('/rest/v1/media_library_folders') && method === 'GET') return json(route, folders);
    if (url.pathname.endsWith('/rest/v1/media_library_folders') && method === 'POST') {
      const payload = request.postDataJSON() as { user_id: string; parent_id: string | null; name: string };
      const created = { id: 'e2e-folder-created', ...payload, created_at: now, updated_at: now };
      folders.push(created);
      return json(route, created);
    }
    if (url.pathname.endsWith('/rest/v1/media_library_folders') && method === 'PATCH') {
      const payload = request.postDataJSON() as Partial<(typeof folders)[number]>;
      const targetId = url.searchParams.get('id')?.replace('eq.', '');
      const target = folders.find((candidate) => candidate.id === targetId);
      if (target) Object.assign(target, payload);
      const response = target ? { ...target } : null;
      return request.headers()['accept']?.includes('vnd.pgrst.object+json')
        ? json(route, response)
        : json(route, response ? [response] : []);
    }
    if (url.pathname.endsWith('/rest/v1/media_library_folders') && method === 'DELETE') {
      const targetId = url.searchParams.get('id')?.replace('eq.', '');
      const index = folders.findIndex((candidate) => candidate.id === targetId);
      if (index >= 0) folders.splice(index, 1);
      return json(route, []);
    }
    if (url.pathname.endsWith('/rest/v1/media_library_items') && method === 'POST') {
      const payload = request.postDataJSON() as (typeof items)[number];
      items.push(payload);
      return json(route, [payload]);
    }
    if (url.pathname.endsWith('/rest/v1/media_library_items') && method === 'GET') {
      const requestedId = url.searchParams.get('id')?.replace('eq.', '');
      const selectedItems = requestedId ? items.filter((candidate) => candidate.id === requestedId) : items;
      return request.headers()['accept']?.includes('vnd.pgrst.object+json')
        ? json(route, selectedItems[0] ?? null)
        : json(route, selectedItems);
    }
    if (url.pathname.endsWith('/rest/v1/rpc/delete_media_library_items_and_queue_storage_cleanup') && method === 'POST') {
      const payload = request.postDataJSON() as { p_item_ids: string[] };
      deletedMediaItemIds.push(...payload.p_item_ids);
      const before = items.length;
      for (let index = items.length - 1; index >= 0; index -= 1) {
        if (payload.p_item_ids.includes(items[index].id)) items.splice(index, 1);
      }
      return json(route, before - items.length);
    }
    if (url.pathname.endsWith('/rest/v1/media_library_items') && method === 'PATCH') {
      const patch = request.postDataJSON() as Partial<(typeof items)[number]>;
      const rawIds = url.searchParams.get('id') ?? '';
      const targetIds = rawIds.startsWith('in.(')
        ? rawIds.slice(4, -1).split(',')
        : [rawIds.replace('eq.', '')];
      const targets = items.filter((candidate) => targetIds.includes(candidate.id));
      for (const target of targets) Object.assign(target, patch);
      const response = targets.map(({ id }) => ({ id }));
      return request.headers()['accept']?.includes('vnd.pgrst.object+json')
        ? json(route, response[0] ?? null)
        : json(route, response);
    }
    if (url.pathname.includes('/storage/v1/object/sign/vyral-assets/')) {
      if (method === 'POST') {
        const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/sign/vyral-assets/')[1] ?? '');
        const signedURL = '/object/sign/vyral-assets/' + objectPath + '?token=e2e';
        return json(route, { signedURL });
      }
      if (method === 'GET') {
        const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/sign/vyral-assets/')[1] ?? '');
        return route.fulfill({ status: 200, contentType: objectPath === unsupportedOriginalPath ? 'image/jpeg' : 'image/png', headers: corsHeaders, body: objectPath === unsupportedOriginalPath ? invalidImage : png });
      }
    }
    if (url.pathname.includes('/storage/v1/object/authenticated/vyral-assets/') && method === 'GET') {
      const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/authenticated/vyral-assets/')[1] ?? '');
      return route.fulfill({ status: 200, contentType: objectPath === unsupportedOriginalPath ? 'image/jpeg' : 'image/png', headers: corsHeaders, body: objectPath === unsupportedOriginalPath ? invalidImage : png });
    }
    if (url.pathname.includes('/storage/v1/object/vyral-assets/')) {
      const objectPath = decodeURIComponent(url.pathname.split('/storage/v1/object/vyral-assets/')[1] ?? '');
      if (method === 'GET') return route.fulfill({ status: 200, contentType: objectPath === unsupportedOriginalPath ? 'image/jpeg' : 'image/png', headers: corsHeaders, body: objectPath === unsupportedOriginalPath ? invalidImage : png });
      if (method === 'POST') {
        if (objectPath.includes('/media-library-thumbnails/')) uploadedThumbnailPaths.push(objectPath);
        else if (objectPath.includes('/media-library/')) uploadedOriginalPaths.push(objectPath);
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
  await page.addInitScript((storedSession) => {
    window.localStorage.setItem('sb-e2e-test-auth-token', JSON.stringify(storedSession));
  }, session);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open user profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Open user profile' }).click();
  await page.getByRole('button', { name: /My Media Library/ }).click();

  await expect(page.getByText('legacy-sample.png')).toBeVisible();
  await expect(page.getByText('unsupported-image.jpg')).toBeVisible();
  console.log('MEDIA_LIBRARY_E2E_REQUESTS', JSON.stringify(observedRequests));
  await expect.poll(() => uploadedThumbnailPaths.length).toBe(1);
  await expect.poll(() => typeof item.metadata.thumbnail_path === 'string').toBe(true);
  await expect.poll(() => unsupportedItem.metadata.thumbnail_backfill_attempts === 1).toBe(true);
  await expect.poll(() => typeof unsupportedItem.metadata.thumbnail_backfill_retry_after_at === 'string').toBe(true);
  expect(unsupportedItem.metadata.thumbnail_backfill_attempted_at).toBeUndefined();
  expect(uploadedThumbnailPaths[0]).toContain(userId + '/media-library-thumbnails/' + itemId + '-');
  expect(originalObjectMutations).toEqual([]);
  expect(unsupportedItem.metadata.thumbnail_path).toBeUndefined();
  expect(unsupportedItem.storage_path).toBe(unsupportedOriginalPath);

  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('article img[alt=""]')).toBeVisible();
  expect(item.storage_path).toBe(originalPath);

  // Exercise the actual signed-in Library surface at narrow phone, tablet and
  // desktop widths, not only the public application shell.
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document, 'Media Library document overflow at ' + width + 'px: ' + JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body, 'Media Library body overflow at ' + width + 'px: ' + JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.getByText('Name', { exact: true })).toBeVisible();

  // Desktop file-manager semantics: a single click selects without opening;
  // a double click opens the authorized preview and exposes its download action.
  const fileRow = page.getByTestId('media-library-entry-' + itemId);
  await fileRow.click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await expect(fileRow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await fileRow.dblclick();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download original file' })).toBeVisible();
  const downloadPopupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Download original file' }).click();
  const downloadPopup = await downloadPopupPromise;
  await expect.poll(() => new URL(downloadPopup.url()).searchParams.get('download')).toBe('legacy-sample.png');
  await downloadPopup.close();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Keyboard users can select with Space and open with Enter.
  await fileRow.focus();
  await fileRow.press('Space');
  await expect(fileRow).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 selected')).toBeVisible();
  await fileRow.press('Space');
  await expect(fileRow).toHaveAttribute('aria-pressed', 'false');
  await fileRow.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Folder CRUD and hierarchy operations use the same signed-in Library UI.
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByPlaceholder('New folder name').fill('  Project   Assets  ');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const createdFolder = page.getByTestId('media-library-entry-e2e-folder-created');
  await expect(createdFolder).toBeVisible();
  await expect(createdFolder).toContainText('Project Assets');

  await createdFolder.click();
  await page.getByRole('button', { name: 'Rename selected item' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: 'New name' }).fill('Project Archive');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('media-library-entry-e2e-folder-created')).toContainText('Project Archive');

  // Exercise a real browser file selection and the file rename/move/delete actions.
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: 'uploaded-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('VYRA Media Library browser upload test'),
  });
  await expect(page.getByText('1 file uploaded.')).toBeVisible();
  await expect.poll(() => uploadedOriginalPaths.length).toBe(1);
  const uploadedRecord = items.find((candidate) => candidate.file_name === 'uploaded-notes.txt');
  expect(uploadedRecord).toBeTruthy();
  expect(uploadedRecord?.storage_path).toContain(userId + '/media-library/');
  const uploadedRow = page.getByTestId('media-library-entry-' + uploadedRecord!.id);
  await expect(uploadedRow).toBeVisible();
  await uploadedRow.click();
  await page.getByRole('button', { name: 'Rename selected item' }).click();
  await page.getByRole('textbox', { name: 'New name' }).fill('project-notes.txt');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Name updated.')).toBeVisible();
  expect(uploadedRecord?.file_name).toBe('project-notes.txt');
  // Rename intentionally clears selection; select the file again before moving it.
  await uploadedRow.click();
  const moveDestination = page.getByRole('combobox', { name: 'Move selected files to folder' });
  await moveDestination.selectOption('e2e-folder-archive');
  await expect(page.getByText('1 file moved.')).toBeVisible();
  expect(uploadedRecord?.folder_id).toBe('e2e-folder-archive');
  // Moving into a different folder removes the file from the root listing.
  // Open the destination folder before asserting/deleting the moved file.
  const archiveFolderRow = page.getByTestId('media-library-entry-e2e-folder-archive');
  await archiveFolderRow.focus();
  await archiveFolderRow.press('Enter');
  const movedFileRow = page.getByTestId('media-library-entry-' + uploadedRecord!.id);
  await expect(movedFileRow).toBeVisible();
  await movedFileRow.click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete selected items' }).click();
  await expect.poll(() => deletedMediaItemIds.includes(uploadedRecord!.id)).toBe(true);
  await expect(page.getByTestId('media-library-entry-' + uploadedRecord!.id)).toHaveCount(0);

  // Return to the root before selecting the renamed empty folder for deletion.
  await page.getByRole('button', { name: 'My Media', exact: true }).click();
  // Empty-folder deletion is confirmed through the normal selection toolbar.
  await page.getByTestId('media-library-entry-e2e-folder-created').click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete selected items' }).click();
  await expect(page.getByTestId('media-library-entry-e2e-folder-created')).toHaveCount(0);
});
