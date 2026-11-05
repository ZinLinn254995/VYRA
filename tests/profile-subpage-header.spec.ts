import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCollapseProgress } from '../src/components/profile/profileSubpageHeader.utils.ts';

test('expanded hero remains expanded before reaching the sticky bar', () => {
  assert.equal(calculateCollapseProgress(220, 120), 0);
});

test('compact transition progresses smoothly through the approach range', () => {
  assert.equal(calculateCollapseProgress(156, 120), 0);
  assert.equal(calculateCollapseProgress(132, 120), 0.5);
  assert.equal(calculateCollapseProgress(108, 120), 1);
});

test('collapse progress is clamped when the hero is far above or below the bar', () => {
  assert.equal(calculateCollapseProgress(500, 120), 0);
  assert.equal(calculateCollapseProgress(-200, 120), 1);
});

test('short pages remain expanded when their title never reaches the sticky bar', () => {
  const titleTop = 230;
  const stickyBottom = 168;
  assert.equal(calculateCollapseProgress(titleTop, stickyBottom), 0);
});

test('the same transition works with measured mobile and desktop header offsets', () => {
  const mobileStickyBottom = 101 + 48;
  const desktopStickyBottom = 64 + 48;
  assert.equal(calculateCollapseProgress(mobileStickyBottom + 12, mobileStickyBottom), 0.5);
  assert.equal(calculateCollapseProgress(desktopStickyBottom + 12, desktopStickyBottom), 0.5);
});
