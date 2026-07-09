import { describe, expect, it } from 'vitest';
import type { ExtractedFrame } from '../types';
import { WECHAT_STICKER_PRESET, getWechatReadiness } from './wechat';

const frames: ExtractedFrame[] = [
  { id: 'a', dataUrl: 'a', time: 0, selected: true },
  { id: 'b', dataUrl: 'b', time: 1, selected: false },
  { id: 'c', dataUrl: 'c', time: 2, selected: true },
];

describe('WECHAT_STICKER_PRESET', () => {
  it('defaults to a 240 x 240 GIF sticker export', () => {
    expect(WECHAT_STICKER_PRESET).toMatchObject({
      width: 240,
      height: 240,
      gifDelay: 100,
    });
  });
});

describe('getWechatReadiness', () => {
  it('reports selected frame count, duration, and dimension status', () => {
    expect(getWechatReadiness(frames, 240, 240, 100)).toEqual({
      selectedCount: 2,
      durationMs: 200,
      isSquare: true,
      isWechatSize: true,
      hasFrames: true,
      messages: ['wechat.ready'],
    });
  });

  it('reports ready for GIF', () => {
    expect(getWechatReadiness(frames, 240, 240, 100)).toEqual({
      selectedCount: 2,
      durationMs: 200,
      isSquare: true,
      isWechatSize: true,
      hasFrames: true,
      messages: ['wechat.ready'],
    });
  });

  it('reports actionable problems', () => {
    expect(getWechatReadiness(frames, 320, 240, 100).messages).toContain('wechat.size_240');
    expect(getWechatReadiness([], 240, 240, 100).messages).toContain('wechat.select_frame');
  });
});
