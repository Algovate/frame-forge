/** Shared class strings and rc-slider theming so the sidebars / gallery /
 *  preview stay visually in sync without copy-pasted constants. */

export const HEADING = 'flex items-center gap-1.5 text-sm font-semibold mb-2.5';
export const FIELD =
  'w-full min-h-[32px] bg-background border border-hairline rounded-control px-2 py-1 text-xs text-foreground placeholder:text-muted/60 focus:border-primary transition-colors';

export const SLIDER_STYLES = {
  track: { backgroundColor: 'var(--color-primary)' },
  handle: {
    borderColor: 'var(--color-primary)',
    backgroundColor: 'var(--color-primary)',
    opacity: 1,
  },
  rail: { backgroundColor: 'var(--color-hairline)' },
} as const;
