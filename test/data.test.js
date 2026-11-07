/**
 * Characterization tests: data.js utility functions.
 *
 * These tests capture current behavior — they verify the code works as it
 * currently does, not as it "should". If refactoring changes behavior, these
 * tests will catch it.
 */
import { describe, test, expect } from 'vitest';

const { pick, cellPos, moodFromValue, clamp, STATE_LABEL, TASK_LABEL } = globalThis;

describe('pick()', () => {
  test('returns an element from a non-empty array', () => {
    const arr = [10, 20, 30];
    const result = pick(arr);
    expect(arr).toContain(result);
  });

  test('returns undefined for an empty array', () => {
    expect(pick([])).toBeUndefined();
  });

  test('returns the only element of a single-element array', () => {
    const results = new Set();
    for (let i = 0; i < 20; i++) results.add(pick([42]));
    expect(results).toEqual(new Set([42]));
  });
});

describe('clamp()', () => {
  test('clamps value below range to lower bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('clamps value above range to upper bound', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('returns value unchanged when in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('cellPos()', () => {
  test('returns an object with x, y, w, h', () => {
    const pos = cellPos('A1', 'dev_1');
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
    expect(pos).toHaveProperty('w');
    expect(pos).toHaveProperty('h');
  });

  test('returns valid numbers', () => {
    const pos = cellPos('B2', 'design_1');
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.w).toBe('number');
    expect(typeof pos.h).toBe('number');
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});

describe('moodFromValue()', () => {
  test('preserves the numeric value without sharing mood templates', () => {
    const first = moodFromValue(0.6);
    const second = moodFromValue(0.6);
    expect(first).toMatchObject({ key: 'relaxed', label: '放鬆', value: 0.6 });
    first.value = 0.1;
    expect(second.value).toBe(0.6);
    expect(globalThis.MOODS.every(mood => !('value' in mood))).toBe(true);
  });

  test('clamps mood values and maps high values to positive mood', () => {
    expect(moodFromValue(2)).toMatchObject({ key: 'happy', value: 1 });
    expect(moodFromValue(-2)).toMatchObject({ key: 'stressed', value: 0 });
  });
});

describe('STATE_LABEL', () => {
  test('maps all expected state keys', () => {
    const keys = ['sitting', 'standing', 'walking', 'resting', 'meeting', 'gone'];
    keys.forEach(k => {
      expect(STATE_LABEL).toHaveProperty(k);
      expect(typeof STATE_LABEL[k]).toBe('string');
    });
  });
});

describe('TASK_LABEL', () => {
  test('maps all expected task keys', () => {
    const keys = ['project_work', 'client_visit', 'outside_leisure', 'day1_prospecting',
      'work', 'pursue_deal', 'break', 'meeting', 'lunch', 'overtime', 'leave', 'idle'];
    keys.forEach(k => {
      expect(TASK_LABEL).toHaveProperty(k);
      expect(typeof TASK_LABEL[k]).toBe('string');
    });
  });
});
