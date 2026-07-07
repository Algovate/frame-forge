# Frame Forge

Frame Forge is a browser-based tool for making WeChat dynamic stickers from videos and GIFs. It extracts or parses sticker frames, helps clean and caption the sequence, previews the animation, checks the WeChat export setup, and exports a 240 x 240 animated GIF.

## Features

- Create WeChat dynamic stickers from GIFs and common video formats.
- Extract video frames with FPS and time-range controls.
- Parse GIF frames into an editable sticker-frame sequence.
- Use a 240 x 240 WeChat sticker export preset.
- Preview selected frames at the configured GIF delay.
- Add high-contrast caption text to selected frames.
- Check size, frame count, duration, and last export size before exporting.
- Select, invert, reverse, clip, and delete frame ranges.
- Find duplicate, loop, and jump frames with a similarity threshold.
- Remove backgrounds from selected frames.
- Edit a single frame with pen, eraser, fill, color replace, shape, edge soften, and crop tools.
- Crop one frame or crop selected frames from the editor.
- Use pixel-precise crop inputs plus Full, Center, and 1:1 crop actions.
- Compare edits against previous or next frames with onion-skin overlay.
- Export selected frames as a WeChat GIF, ZIP archive, or sprite sheet.

## WeChat Dynamic Sticker Workflow

1. Import a video or GIF.
2. Extract or parse sticker frames.
3. Crop or fit the result to 240 x 240.
4. Clean unwanted frames.
5. Add captions if needed.
6. Check the WeChat readiness panel.
7. Export `wechat-sticker.gif`.

Static image animation is not part of the current dynamic-sticker workflow. Use a video or GIF source for animated stickers.

## Frame Editor

Open the editor from a frame tile's edit button. Edits are staged inside the modal until you choose Save & close.

Available tools:

- Pen: draw with color, size, hardness, opacity, and blend mode controls.
- Eraser: erase pixels with size and opacity controls.
- Fill: flood-fill a contiguous region using color, opacity, and tolerance.
- Replace color: replace matching pixels across the frame using tolerance.
- Rectangle and ellipse: draw shape outlines.
- Edge soften: locally blur an area with brush controls.
- Crop: crop the current frame, or apply the same pixel crop to selected frames.

Editor shortcuts:

- `Ctrl+Z` / `Cmd+Z`: undo.
- `Ctrl+Y` / `Cmd+Y`: redo.
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`: redo.
- `Escape`: close the editor. Unsaved edits require confirmation.
- `Alt + Scroll`: zoom.
- `Alt` or middle-drag: pan.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Run tests:

```bash
npm run test
```

Run lint:

```bash
npm run lint
```

Build for production:

```bash
npm run build
```

## Notes

The app runs frame processing in the browser. Large videos, long frame sequences, AI background removal, and GIF encoding can use significant memory and CPU.
