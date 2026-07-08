import type { ExtractedFrame, WechatReadiness } from '../types';

export const WECHAT_STICKER_PRESET = {
  width: 240,
  height: 240,
  gifDelay: 100,
} as const;

export const getSelectedFrameCount = (frames: ExtractedFrame[]) => frames.filter((frame) => frame.selected).length;

export const getWechatReadiness = (
  frames: ExtractedFrame[],
  width: number,
  height: number,
  gifDelay: number,
): WechatReadiness => {
  const selectedCount = getSelectedFrameCount(frames);
  const isSquare = width === height;
  const isWechatSize = width === WECHAT_STICKER_PRESET.width && height === WECHAT_STICKER_PRESET.height;
  const messages: string[] = [];

  if (selectedCount === 0) messages.push('wechat.select_frame');
  if (!isWechatSize) messages.push('wechat.size_240');
  if (!isSquare) messages.push('wechat.square_canvas');
  if (messages.length === 0) messages.push('wechat.ready');
  return {
    selectedCount,
    durationMs: selectedCount * gifDelay,
    isSquare,
    isWechatSize,
    hasFrames: selectedCount > 0,
    messages,
  };
};
