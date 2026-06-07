import { CSSProperties, ReactNode } from 'react';

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Controlled active value. */
  value?: string;
  /** Uncontrolled initial value. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  style?: CSSProperties;
}

/**
 * Pill segmented control for switching views. Works controlled (`value` +
 * `onChange`) or uncontrolled (`defaultValue`). Active pill uses brand blue.
 */
export function Tabs(props: TabsProps): JSX.Element;
