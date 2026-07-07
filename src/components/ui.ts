/** Shared class strings and rc-slider theming so the sidebars / gallery /
 *  preview stay visually in sync without copy-pasted constants. */

export const HEADING = 'flex items-center gap-2 text-base font-semibold mb-4';
export const FIELD =
  'w-full min-h-[40px] bg-background border border-hairline rounded-control px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-primary transition-colors';

export const SLIDER_STYLES = {
  track: { backgroundColor: 'var(--color-primary)' },
  handle: {
    borderColor: 'var(--color-primary)',
    backgroundColor: 'var(--color-primary)',
    opacity: 1,
  },
  rail: { backgroundColor: 'var(--color-hairline)' },
} as const;
