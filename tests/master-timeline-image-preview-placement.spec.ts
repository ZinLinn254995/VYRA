import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Master Editor routes active Image previews into the shared upper Storyboard preview frame', () => {
  const editor = readFileSync(resolve(process.cwd(), 'src/components/workspace/MasterTimelineEditor.tsx'), 'utf8');
  const workspace = readFileSync(resolve(process.cwd(), 'src/components/workspace/WorkspacePage.tsx'), 'utf8');

  assert.match(editor, /onImagePreviewChange\?\./);
  assert.match(editor, /onImagePreviewChange\?=\{?handleMasterTimelineImagePreviewChange\}?/);
  assert.doesNotMatch(editor, /<img src=\{imagePreviewUrl\}/);

  const previewFrameStart = workspace.indexOf('className="profile-storyboard-preview-frame');
  const previewFrameEnd = workspace.indexOf('</div>', previewFrameStart);
  const previewFrame = workspace.slice(previewFrameStart, previewFrameEnd);
  assert.match(previewFrame, /masterTimelineImagePreview/);
  assert.match(previewFrame, /<img/);
  assert.match(workspace, /onImagePreviewChange=\{handleMasterTimelineImagePreviewChange\}/);
  assert.match(workspace, /ref=\{masterTimelineVideoPreviewRef\}/);
  assert.match(workspace, /onTextPreviewOverlaysChange=\{handleMasterTimelineTextPreviewChange\}/);
  assert.doesNotMatch(editor, /<video\\s+ref=\\{masterVideoPreviewRef\\}/);
});
