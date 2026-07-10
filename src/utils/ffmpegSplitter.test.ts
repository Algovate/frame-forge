import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createSplitZip, getSplitGridGeometry, getSplitPartFilename, type SplitVideoPart } from './ffmpegSplitter';

describe('ffmpeg splitter helpers', () => {
  it('names parts in row/column order', () => {
    expect(getSplitPartFilename('source', 2, 3)).toBe('source_part_2_3.mp4');
  });

  it('calculates row-major crop geometry with padding and gap', () => {
    const geometry = getSplitGridGeometry(
      { width: 420, height: 220 },
      2,
      2,
      { top: 10, right: 20, bottom: 10, left: 20 },
      10,
    );

    expect(geometry.cellWidth).toBe(185);
    expect(geometry.cellHeight).toBe(95);
    expect(geometry.parts).toEqual([
      { row: 0, col: 0, x: 20, y: 10, width: 185, height: 95 },
      { row: 0, col: 1, x: 215, y: 10, width: 185, height: 95 },
      { row: 1, col: 0, x: 20, y: 115, width: 185, height: 95 },
      { row: 1, col: 1, x: 215, y: 115, width: 185, height: 95 },
    ]);
  });

  it('rejects grid settings that leave no room for cells', () => {
    expect(() =>
      getSplitGridGeometry(
        { width: 100, height: 100 },
        2,
        2,
        { top: 50, right: 0, bottom: 50, left: 0 },
        0,
      ),
    ).toThrow('Grid padding/gap leaves no room for cells');
  });

  it('packages split parts into a ZIP by filename', async () => {
    const parts: SplitVideoPart[] = [
      {
        row: 0,
        col: 0,
        filename: 'source_part_0_0.mp4',
        blob: new Blob(['a'], { type: 'video/mp4' }),
        file: new File(['a'], 'source_part_0_0.mp4', { type: 'video/mp4' }),
        width: 10,
        height: 10,
      },
      {
        row: 0,
        col: 1,
        filename: 'source_part_0_1.mp4',
        blob: new Blob(['b'], { type: 'video/mp4' }),
        file: new File(['b'], 'source_part_0_1.mp4', { type: 'video/mp4' }),
        width: 10,
        height: 10,
      },
    ];

    const zipBlob = await createSplitZip(parts);
    const zip = await JSZip.loadAsync(zipBlob);

    expect(Object.keys(zip.files).sort()).toEqual(['source_part_0_0.mp4', 'source_part_0_1.mp4']);
  });
});
