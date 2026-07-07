import { describe, expect, it } from 'vitest';
import { getObjectFitRect } from './canvasFit';

describe('getObjectFitRect', () => {
  it('contains a wide source inside a square canvas without distortion', () => {
    expect(getObjectFitRect(480, 240, 240, 240, 'contain')).toEqual({
      dx: 0,
      dy: 60,
      dw: 240,
      dh: 120,
    });
  });

  it('covers a square canvas with a wide source without distortion', () => {
    expect(getObjectFitRect(480, 240, 240, 240, 'cover')).toEqual({
      dx: -120,
      dy: 0,
      dw: 480,
      dh: 240,
    });
  });
});
