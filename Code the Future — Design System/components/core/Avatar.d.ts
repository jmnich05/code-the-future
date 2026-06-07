import { CSSProperties } from 'react';

export interface AvatarProps {
  /** Full name — used for initials fallback and tooltip. */
  name?: string;
  /** Image URL; when present, replaces the initials. */
  src?: string | null;
  /** Pixel diameter. @default 44 */
  size?: number;
  /** Gradient used for the initials fallback. @default "spark" */
  variant?: 'spark' | 'sunrise' | 'night';
  style?: CSSProperties;
}

/**
 * Circular avatar. Shows an image when `src` is set, otherwise initials on a
 * brand gradient. Sized in px; keep ≥36 for legibility.
 */
export function Avatar(props: AvatarProps): JSX.Element;
