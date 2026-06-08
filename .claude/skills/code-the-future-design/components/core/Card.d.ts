import { CSSProperties, ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  /** @default "default" */
  variant?: 'default' | 'elevated' | 'dark' | 'outline';
  /** @default "md" */
  padding?: 'sm' | 'md' | 'lg';
  /** Lift + deepen shadow on hover. @default false */
  interactive?: boolean;
  style?: CSSProperties;
}

/**
 * Rounded content container with the brand's soft cool shadow. `dark` uses the
 * Night gradient for futuristic sections; `interactive` adds a hover lift.
 *
 * @startingPoint section="Core" subtitle="Rounded card — default, elevated, dark, outline" viewport="700x260"
 */
export function Card(props: CardProps): JSX.Element;
