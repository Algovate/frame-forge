# Workflow-First UI Design

## Goal

Organize Frame Forge around its primary outcome—creating a sticker—while retaining reusable assets and grid video splitting as supporting capabilities.

## Information architecture

The top-level navigation contains three destinations:

- **Sticker Studio**: import, extract, curate, prepare, preview, and export frames.
- **Project Assets**: a user-invoked asset panel containing reusable split clips and edited images.
- **Tools**: video grid splitter.

Canvas editing is contextual rather than top-level. Selecting Edit on a frame opens the canvas editor with an explicit back action that returns to Sticker Studio. The canvas empty state still accepts a standalone image, so that ability is retained without a competing global destination.

Project Assets provides the standalone route: selecting an image asset opens it in Canvas Editor, while selecting a video clip loads it into Sticker Studio. The Canvas empty state remains a fallback for a direct image drop if Canvas is reached through either route.

## Layout

On desktop, Project Assets is an optional left rail. It starts closed and opens only from the header; creating assets shows a count badge but does not auto-open or compress the workspace. When open it remains a 256px scrolling panel. Sticker Studio retains the existing frame-grid and right-side preparation/export controls.

On viewports below `lg`, all workspaces are single-column. The assets panel is a collapsible full-width section positioned above the active workspace, never a parallel fixed-width rail. The header wraps safely and top-level navigation keeps text labels and touch-sized controls.

## Interactions

- A frame card's edit action stores the current frame id and enters Canvas Editor.
- Canvas provides a Back to frames control; it returns without changing the selected frame state. Save and Close preserves its current save behavior, then also returns to Sticker Studio. Back leaves unsaved edits in the current behavior (no new discard dialog); this does not alter the frame until Save is used.
- Frame bulk actions are grouped by intent. Smart cleanup and selection controls remain visible before selection; destructive and mutation actions (duplicate, reverse, trim before/after, delete selected, and delete unselected) are hidden until at least one frame is selected. Icon controls receive accessible labels and text labels at useful widths.
- Video Splitter remains a focused tool. Its generated clips continue populating the existing project asset state.

## Non-goals

- No changes to extraction, ffmpeg processing, matting, export formats, or asset data models.
- No routing, persistence layer, or new external dependencies.

## Validation

- Existing unit tests pass.
- Desktop UI exposes Sticker Studio, Project Assets, and Tools.
- At 375px, no workspace content extends beyond the viewport and the asset panel can be opened and closed.
- Editing a frame exposes a clear route back to Sticker Studio.
