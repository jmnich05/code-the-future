export function Card({
  children,
  variant = 'default',
  padding = 'md',
  interactive = false,
  style,
  ...rest
}) {
  const pads = { sm: 'var(--space-4)', md: 'var(--space-5)', lg: 'var(--space-7)' };
  const variants = {
    default: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-sm)',
      color: 'var(--text-body)',
    },
    elevated: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--text-body)',
    },
    dark: {
      background: 'var(--gradient-night)',
      border: '1px solid var(--border-on-dark)',
      boxShadow: 'var(--shadow-lg)',
      color: 'var(--text-on-dark)',
    },
    outline: {
      background: 'transparent',
      border: '2px solid var(--border-strong)',
      color: 'var(--text-body)',
    },
  };
  const v = variants[variant] || variants.default;

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: pads[padding] || pads.md,
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
        cursor: interactive ? 'pointer' : 'default',
        ...v,
        ...style,
      }}
      onMouseEnter={interactive ? (e) => {
        e.currentTarget.style.transform = 'translateY(-3px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-xl)';
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = v.boxShadow || 'none';
      } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
