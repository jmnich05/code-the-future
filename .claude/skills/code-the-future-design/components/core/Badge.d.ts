import { CSSProperties, ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  /** @default "neutral" */
  variant?: 'neutral' | 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger';
  /** Show a leading status dot. @default false */
  dot?: boolean;
  style?: CSSProperties;
}

/**
 * Small mono-cased status/label pill. Uppercase JetBrains Mono on a tinted
 * background — reads as the brand's "operator" labelling voice.
 */
export function Badge(props: BadgeProps): JSX.Element;
