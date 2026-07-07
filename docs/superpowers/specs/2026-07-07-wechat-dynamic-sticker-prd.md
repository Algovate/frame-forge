# WeChat Dynamic Sticker Maker PRD

## Product Goal

Frame Forge should become a browser-based tool for making WeChat dynamic stickers from real motion sources: video clips and existing GIFs. The product should help users extract, clean, crop, caption, preview, validate, and export a WeChat-ready animated GIF.

The first release should focus on one polished dynamic sticker at a time. Static images are not part of the first dynamic-generation path because simple preset motion is unlikely to meet the desired quality bar.

## Product Positioning

Current Frame Forge is technically a frame extraction and editing tool. The target product is a WeChat dynamic sticker maker.

The shift is mainly workflow and product focus:

- From "extract frames" to "make a WeChat dynamic sticker."
- From generic frame exports to WeChat-oriented GIF export.
- From raw frame utilities to creator-facing trimming, cleanup, captioning, preview, and readiness checks.
- From supporting every media type equally to prioritizing video and GIF sources for high-quality motion.

## Target Users

### Video Clip Creator

The user has a short video containing a reaction, gesture, facial expression, or character movement. They want to trim the useful moment, extract frames, crop to a square sticker canvas, add text, and export a WeChat-ready GIF.

### GIF Editor

The user already has an animated GIF. They want to resize, crop, retime, clean duplicate frames, add text, and export a WeChat-ready GIF.

## First Release Scope

### P0: Video and GIF to WeChat Dynamic Sticker

- Import common video files and animated GIFs.
- Keep static image files out of the primary dynamic-sticker flow.
- For video: select time range and frame rate, then extract frames.
- For GIF: parse frames and preserve the animation sequence.
- Provide a WeChat main-sticker preset with a 240 x 240 square canvas.
- Crop or fit extracted frames to the WeChat canvas.
- Clean frame sequences by deleting, selecting, reversing, clipping, and detecting duplicate/loop/jump frames.
- Add caption text to selected or all frames.
- Preview the animation at the intended frame delay.
- Export selected frames as an animated GIF using the WeChat preset by default.
- Show a WeChat readiness panel before export.

### P1: Quality and Compression

- Add selected-frame delay controls.
- Add one-click frame reduction for large animations.
- Add output size estimation before export and actual size reporting after export.
- Add compression suggestions: reduce frames, increase delay, simplify dimensions, or remove duplicate frames.
- Generate a static thumbnail from the selected animation.
- Save the most recent project state locally.

### P2: Sticker Pack Workflow

- Manage 8, 16, or 24 dynamic sticker entries.
- Batch validate all sticker entries.
- Export main GIFs plus thumbnails.
- Generate WeChat supporting assets such as cover, panel icon, and banner.

## Explicitly Out of Scope for P0

- Single static image to dynamic sticker generation.
- Motion presets for still images.
- AI-generated animation.
- WeChat account login or direct upload.
- Full sticker album submission automation.
- Cloud projects, accounts, sharing, or collaboration.
- Replacing the existing frame editor with a full design suite.

Static image import may be supported later for static stickers, thumbnails, covers, or pack assets, but it should not block the first dynamic-sticker release.

## Product Structure

### Left Panel: Source and Extraction

Rename the current source area around sticker creation:

- Source import: video or GIF.
- Source preview.
- Video range selector when the source is video.
- FPS selector when the source is video.
- GIF parse summary when the source is GIF.
- Primary action:
  - Video: "Extract sticker frames"
  - GIF: "Parse GIF frames"

Unsupported static images should receive a clear message in P0: "Static image animation is not supported in this version. Use a video or GIF for dynamic stickers."

### Center Panel: Frame Workspace

The center area remains the core frame workspace:

- Frame grid or compact timeline.
- Selection count.
- Select all, invert selection.
- Delete selected and delete unselected.
- Reverse frames.
- Clip start and clip end from a selected frame.
- Detect duplicate, loop, and jump frames.
- Open frame editor for pixel-level cleanup and crop.

The label should move from generic "Frames" toward "Sticker frames" or "Timeline" to reinforce the sticker-making task.

### Right Panel: Preview, Caption, Cleanup, Export

The right panel should support the final creative and export steps:

- Animation preview.
- Caption controls.
- AI background removal.
- WeChat readiness checks.
- Primary export: animated GIF.
- Secondary exports: ZIP and sprite sheet, collapsed under advanced export.

"Pro utilities" should be renamed to "Image cleanup" or "Smart cleanup."

## Core Workflows

### Video Flow

1. User imports a video.
2. App shows a video preview.
3. User selects a short time range.
4. User chooses FPS.
5. User extracts frames.
6. App creates a selected frame sequence.
7. User crops or fits frames to 240 x 240.
8. User removes bad, duplicate, or non-looping frames.
9. User adds caption text.
10. User previews the animation.
11. App shows WeChat readiness checks.
12. User exports GIF.

### GIF Flow

1. User imports a GIF.
2. App parses the GIF into frames.
3. App shows the animation preview and frame workspace.
4. User crops or fits frames to 240 x 240.
5. User adjusts sequence and removes bad frames.
6. User adds caption text.
7. User previews the result.
8. App shows WeChat readiness checks.
9. User exports GIF.

## Functional Requirements

### Source Import

- Accept common video files already supported by the app.
- Accept GIF files.
- Classify GIF separately from video.
- Reject static images in P0 with a clear user-facing message.
- Keep object URL cleanup when replacing source files.

### Video Extraction

- Preserve existing FPS and time range controls.
- Keep estimated frame count visible.
- Prevent extraction when selected duration or FPS would produce zero frames.
- Show progress and recover cleanly from extraction errors.
- Default settings should favor short sticker loops over long frame sequences.

### GIF Parsing

- Parse GIF frames into the existing frame sequence model.
- Preserve frame order.
- Preserve usable frame timing where possible, or map it to the app's GIF delay control.
- Show parse success and frame count.

### WeChat Canvas

- Provide a 240 x 240 WeChat main-sticker preset.
- Make this preset the default export size.
- Provide crop and fit tools for square composition.
- Keep custom export size available as an advanced option.

### Frame Cleanup

- Keep existing selection, deletion, invert, reverse, clip start, and clip end operations.
- Keep duplicate, loop, and jump frame detection.
- Update labels so the controls are understandable to sticker creators.
- Do not remove advanced frame tools; move lower-priority exports and utilities out of the main path.

### Caption Tool

- Add a caption model that can render text onto selected frames.
- Support text content, font size, fill color, stroke color, stroke width, and position.
- Include quick positions: top center, middle center, bottom center.
- Default to high-contrast sticker text.
- Render captions into exported GIF frames.

### Preview

- Preview only selected frames, because selected frames define the export.
- Use the configured GIF delay.
- Make it obvious when no frames are selected.

### WeChat Readiness

- Show whether the output size is 240 x 240.
- Show selected frame count.
- Show estimated duration.
- Show estimated file size when feasible.
- After export, report actual file size when feasible.
- Show practical fixes when output is too heavy or not square.

### Export

- Make animated GIF the primary export in WeChat mode.
- Use selected frames only.
- Default width and height to 240 x 240.
- Keep ZIP and sprite-sheet export available under advanced export.

## Non-Functional Requirements

- The app remains fully browser-based.
- Processing should never leave the UI stuck in a loading state after an error.
- Existing video and GIF workflows must continue to work.
- UI copy should be creator-facing and WeChat-sticker specific.
- Heavy operations should provide progress feedback.
- Memory cleanup for generated URLs should remain explicit.

## Acceptance Criteria

- A user can import a video, extract a short range, crop to 240 x 240, add text, preview, and export a GIF.
- A user can import a GIF, parse it, clean frames, add text, preview, and export a GIF.
- Static images are not presented as a dynamic-sticker source in P0.
- If a user imports a static image, the app explains that P0 supports video and GIF for dynamic stickers.
- The primary export path defaults to 240 x 240 GIF.
- The app shows WeChat readiness checks before export.
- Existing frame editor and cleanup utilities remain functional.
- ZIP and sprite-sheet export remain available but are secondary.

## Recommended Implementation Direction

Build on the existing frame-sequence architecture:

1. Reframe source handling around video and GIF dynamic-sticker inputs.
2. Add WeChat mode defaults: 240 x 240 export, selected-frame preview, and GIF-first export.
3. Add caption rendering over selected frames.
4. Add readiness checks and export feedback.
5. Move non-WeChat exports into advanced export.

This avoids low-quality still-image animation and keeps the product aligned with the desired quality threshold for real dynamic stickers.

