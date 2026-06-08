import { CSSProperties, ReactNode, InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  /** Error message — turns the field red and replaces the hint. */
  error?: string;
  iconLeft?: ReactNode;
  style?: CSSProperties;
}

/**
 * Text field with label, hint, error and optional leading icon. Focus ring
 * uses the brand blue; 48px tall to stay finger-friendly.
 */
export function Input(props: InputProps): JSX.Element;
