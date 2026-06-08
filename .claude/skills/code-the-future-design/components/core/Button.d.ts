import { CSSProperties, ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  /** Visual style. @default "primary" */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  /** @default "md" */
  size?: 'sm' | 'md' | 'lg';
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent) => void;
  style?: CSSProperties;
}

/**
 * Primary action control for Code the Future. Pill-shaped, geometric label,
 * subtle press-scale. Use `primary` (blue) for the main path, `accent` (coral)
 * for moments of delight, `secondary`/`ghost` for lower emphasis.
 *
 * @startingPoint section="Core" subtitle="Pill button — primary, accent, secondary, ghost" viewport="700x200"
 */
export function Button(props: ButtonProps): JSX.Element;
