export function Badge({ children, variant = 'neutral', dot = false, style, ...rest }) {
  const variants = {
    neutral: { bg: 'var(--ink-100)', fg: 'var(--ink-700)' },
    primary: { bg: 'var(--blue-50)', fg: 'var(--blue-700)' },
    secondary: { bg: 'var(--teal-50)', fg: 'var(--teal-700)' },
    accent: { bg: 'var(--coral-50)', fg: 'var(--coral-700)' },
    success: { bg: 'var(--color-success-bg)', fg: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning-bg)', fg: 'var(--amber-600)' },
    danger: { bg: 'var(--color-danger-bg)', fg: 'var(--color-danger)' },
  };
  const v = variants[variant] || variants.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 11px',
        background: v.bg,
        color: v.fg,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-pill)',
        lineHeight: 1.4,
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.fg, display: 'inline-block' }} />
      )}
      {children}
    </span>
  );
}
