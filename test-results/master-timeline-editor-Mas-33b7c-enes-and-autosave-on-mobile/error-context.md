# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: master-timeline-editor.spec.ts >> Master Timeline edits remain aligned, preserve source scenes, and autosave on mobile
- Location: tests/master-timeline-editor.spec.ts:39:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('textbox')
Expected: visible
Error: strict mode violation: getByRole('textbox') resolved to 6 elements:
    1) <input maxlength="100" value="Timeline Regression" placeholder="Storyboard title" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-9"/> aka getByRole('textbox', { name: 'Storyboard title' })
    2) <textarea rows="2" maxlength="500" placeholder="What is this story about?" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-[4.5rem] resize-y py-2">A saved description</textarea> aka getByRole('textbox', { name: 'What is this story about?' })
    3) <input value="Test category" placeholder="AI suggested" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-9"/> aka getByRole('textbox', { name: 'AI suggested' }).first()
    4) <input value="" placeholder="AI suggested" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-9"/> aka getByRole('textbox', { name: 'AI suggested' }).nth(1)
    5) <input value="" placeholder="AI suggested" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-9"/> aka getByRole('textbox', { name: 'AI suggested' }).nth(2)
    6) <input value="" placeholder="Tags" class="min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] [-webkit-text-fill-color:var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:outline-2 focus:outline-[var(--vyra-accent-primary)] focus:outline-offset-2 placeholder:text-[var(--vyra-text-muted)] min-h-9"/> aka getByRole('textbox', { name: 'Tags' })

Call log:
  - Expect "toBeVisible" getByRole('textbox') with timeout 5000ms
  - waiting for getByRole('textbox')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - button "VYRA Marketplace home" [ref=e7]:
          - generic [ref=e9]: VYRA
        - generic [ref=e10]:
          - generic "Available credit balance" [ref=e11]:
            - text: —
            - generic [ref=e17]: Credits
          - button "Open user profile" [ref=e18]
      - navigation "Main navigation" [ref=e22]:
        - button "Marketplace" [ref=e23]
        - button "Workspace" [ref=e28]
        - button "AI Chat" [ref=e34]
  - main [ref=e40]:
    - generic [ref=e42]:
      - generic [ref=e44]:
        - button "Workspace" [ref=e45]
        - heading "Timeline Regression" [level=1] [ref=e55]
        - paragraph [ref=e56]: A saved description
      - generic [ref=e57]:
        - generic [ref=e58]:
          - generic [ref=e59]:
            - heading "Storyboard details" [level=2] [ref=e60]
            - generic [ref=e61]: AI suggested · Editable
          - generic [ref=e65]:
            - generic [ref=e66]:
              - generic [ref=e67]: Title
              - textbox "Storyboard title" [ref=e68]: Timeline Regression
            - generic [ref=e69]:
              - generic [ref=e70]: Description
              - textbox "What is this story about?" [ref=e71]: A saved description
            - generic [ref=e72]:
              - generic [ref=e73]: category
              - textbox "AI suggested" [ref=e74]: Test category
            - generic [ref=e75]:
              - generic [ref=e76]: Visual style
              - textbox "AI suggested" [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e79]: mood
              - textbox "AI suggested" [ref=e80]
            - generic [ref=e81]:
              - generic [ref=e82]: Tags
              - textbox "Tags" [ref=e83]
        - generic [ref=e84]:
          - generic [ref=e85]:
            - generic [ref=e87]:
              - heading "Storyboard Preview" [level=2] [ref=e88]
              - paragraph [ref=e89]: The complete video preview will appear here as scenes receive media.
            - generic [ref=e92]:
              - paragraph [ref=e95]: Your video preview
              - paragraph [ref=e96]: 2 scenes in this Storyboard
          - generic [ref=e97]:
            - generic [ref=e98]:
              - generic [ref=e99]:
                - heading "Scenes" [level=2] [ref=e100]
                - paragraph [ref=e101]: Build the story in the order you want.
              - button "Add Scene" [ref=e102]
            - generic [ref=e104]:
              - generic [ref=e105]:
                - generic [ref=e106]:
                  - generic [ref=e107]: Scene 1
                  - checkbox "Select First Scene" [ref=e108]
                - 'button "Open Scene Editor: First Scene" [ref=e110]':
                  - paragraph [ref=e114]: First Scene
                  - paragraph [ref=e115]: 10s · Open Scene Editor
                - generic [ref=e116]:
                  - button "Move scene left" [disabled] [ref=e117]
                  - button "Duplicate scene" [ref=e120]
                  - button "Move scene right" [ref=e124]
                  - button "Delete scene" [ref=e127]
              - generic [ref=e131]:
                - generic [ref=e132]:
                  - generic [ref=e133]: Scene 2
                  - checkbox "Select Second Scene" [ref=e134]
                - 'button "Open Scene Editor: Second Scene" [ref=e136]':
                  - paragraph [ref=e140]: Second Scene
                  - paragraph [ref=e141]: 8s · Open Scene Editor
                - generic [ref=e142]:
                  - button "Move scene left" [ref=e143]
                  - button "Duplicate scene" [ref=e146]
                  - button "Move scene right" [disabled] [ref=e150]
                  - button "Delete scene" [ref=e153]
          - region "Master timeline editor" [ref=e157]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - heading "Master Timeline" [level=2] [ref=e160]
                - paragraph [ref=e161]: Scenes, Audio and Text share one timeline.
              - generic [ref=e162]:
                - button "Undo" [disabled] [ref=e163]
                - button "Redo" [disabled] [ref=e167]
                - button "Play" [ref=e172]
                - generic [ref=e175]:
                  - text: 00:00:00.0
                  - generic [ref=e176]: / 00:00:18.0
                - button "Zoom out" [ref=e178]
                - button "Fit timeline" [ref=e182]
                - button "Zoom in" [ref=e188]
                - button "Turn snapping off" [pressed] [ref=e192]
            - generic [ref=e197]:
              - button "Add Audio" [ref=e198]
              - button "Add Text" [ref=e200]
            - generic [ref=e205]:
              - generic [ref=e206]: Time
              - generic [ref=e207]:
                - generic: 00:00:00.0
                - generic: 00:00:05.0
                - generic: 00:00:10.0
                - generic: 00:00:15.0
              - generic [ref=e208]: Scenes
              - generic [ref=e209]:
                - button "First Scene Scene 1 10.0s" [ref=e210]:
                  - generic [ref=e211]: First Scene
                  - generic [ref=e216]:
                    - generic [ref=e217]: Scene 1
                    - generic [ref=e218]: 10.0s
                - button "Transition after First Scene" [ref=e220]
                - button "Second Scene Scene 2 8.0s" [ref=e222]:
                  - generic [ref=e223]: Second Scene
                  - generic [ref=e228]:
                    - generic [ref=e229]: Scene 2
                    - generic [ref=e230]: 8.0s
              - generic [ref=e232]: Audio
              - generic [ref=e233]: Add an Audio track for music, voice or effects.
              - generic [ref=e234]: Text
              - generic [ref=e235]: Add a Text track for titles, dialogue or captions.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.use({ storageState: './tests/e2e-auth-state.json' });
  4  | 
  5  | const storageKey = 'vyra_storyboards_v1:00000000-0000-4000-8000-000000000001';
  6  | const storyboardId = 'timeline-regression-storyboard';
  7  | 
  8  | const seedStoryboard = (page: import('@playwright/test').Page) => page.addInitScript(({ key, id }) => {
  9  |   const now = new Date().toISOString();
  10 |   localStorage.setItem(key, JSON.stringify([{
  11 |     id,
  12 |     title: 'Timeline Regression',
  13 |     topic: 'A saved description',
  14 |     createdAt: now,
  15 |     updatedAt: now,
  16 |     details: {
  17 |       category: 'Test category',
  18 |       scenes: [
  19 |         { id: 'scene-one', title: 'First Scene', description: '', duration: 10, transition: 'None' },
  20 |         { id: 'scene-two', title: 'Second Scene', description: '', duration: 8, transition: 'None' },
  21 |       ],
  22 |       masterTimeline: {
  23 |         sceneRanges: { 'scene-one': { sourceIn: 0, sourceOut: 10 } },
  24 |         transitions: {},
  25 |         audioTracks: [],
  26 |         textTracks: [],
  27 |       },
  28 |     },
  29 |   }]));
  30 | }, { key: storageKey, id: storyboardId });
  31 | 
  32 | const openStoryboard = async (page: import('@playwright/test').Page) => {
  33 |   await page.goto('/');
  34 |   await page.getByRole('button', { name: 'Workspace' }).click();
  35 |   await page.getByRole('button', { name: 'Open storyboard: Timeline Regression' }).click();
  36 |   await expect(page.getByRole('region', { name: 'Master timeline editor' })).toBeVisible();
  37 | };
  38 | 
  39 | test('Master Timeline edits remain aligned, preserve source scenes, and autosave on mobile', async ({ page }) => {
  40 |   await page.setViewportSize({ width: 390, height: 844 });
  41 |   await seedStoryboard(page);
  42 |   await openStoryboard(page);
  43 | 
  44 |   const title = page.getByRole('textbox').filter({ hasValue: 'Timeline Regression' });
> 45 |   await expect(title).toBeVisible();
     |                       ^ Error: expect(locator).toBeVisible() failed
  46 |   await expect(page.getByLabel('Description')).toHaveValue('A saved description');
  47 |   await expect(page.getByLabel('category', { exact: true })).toHaveValue('Test category');
  48 | 
  49 |   const editor = page.getByRole('region', { name: 'Master timeline editor' });
  50 |   await editor.locator('[title^="First Scene"]').click();
  51 |   await page.getByLabel('Scene source in').fill('3');
  52 |   await page.getByLabel('Scene source out').fill('6');
  53 |   await expect(page.locator('[title^="First Scene"]')).toContainText('3.0s');
  54 | 
  55 |   await editor.getByRole('button', { name: 'Add Audio' }).click();
  56 |   await editor.getByRole('button', { name: 'Add Text' }).click();
  57 |   await expect(editor.getByText('Audio 1')).toBeVisible();
  58 |   await expect(editor.getByText('Text 1')).toBeVisible();
  59 |   await page.getByLabel('Clip start time').fill('1.5');
  60 |   await editor.locator('.cursor-crosshair').click({ position: { x: 140, y: 16 } });
  61 |   await editor.getByRole('button', { name: 'Split selected clip' }).click();
  62 |   await expect(editor.getByRole('button', { name: 'Audio clip: New audio clip (2)' })).toBeVisible();
  63 |   await editor.getByRole('button', { name: 'Duplicate selected clip' }).click();
  64 | 
  65 |   const editorViewport = editor.locator('.overflow-auto').first();
  66 |   const dimensions = await page.evaluate(() => ({
  67 |     documentWidth: document.documentElement.scrollWidth,
  68 |     viewportWidth: document.documentElement.clientWidth,
  69 |   }));
  70 |   expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  71 |   expect(await editorViewport.evaluate((element) => element.scrollWidth)).toBeGreaterThan(await editorViewport.evaluate((element) => element.clientWidth));
  72 | 
  73 |   await expect.poll(() => page.evaluate(({ key, id }) => {
  74 |     const records = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ id: string; details?: { masterTimeline?: { sceneInstances?: Array<{ sceneId: string; sourceIn: number; sourceOut: number }> } } }>;
  75 |     const timeline = records.find((item) => item.id === id)?.details?.masterTimeline;
  76 |     return timeline?.sceneInstances?.find((item) => item.sceneId === 'scene-one')?.sourceOut ?? null;
  77 |   }, { key: storageKey, id: storyboardId })).toBe(6);
  78 | 
  79 |   const originalDuration = await page.evaluate(({ key, id }) => {
  80 |     const records = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ id: string; details?: { scenes?: Array<{ id: string; duration: number }> } }>;
  81 |     return records.find((item) => item.id === id)?.details?.scenes?.find((item) => item.id === 'scene-one')?.duration;
  82 |   }, { key: storageKey, id: storyboardId });
  83 |   expect(originalDuration).toBe(10);
  84 | 
  85 |   await page.reload();
  86 |   await openStoryboard(page);
  87 |   await expect(page.getByLabel('Scene source in')).toHaveValue('3');
  88 |   await expect(page.getByLabel('Scene source out')).toHaveValue('6');
  89 |   await expect(page.getByText('Audio 1')).toBeVisible();
  90 |   await expect(page.getByText('Text 1')).toBeVisible();
  91 | });
  92 | 
```