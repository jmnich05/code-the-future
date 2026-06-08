export function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft = null,
  iconRight = null,
  fullWidth = false,
  disabled = false,
  type = 'button',
  onClick,
  style,
  ...rest
}) {
  const sizes = {
    sm: { padding: '0 16px', height: 38, fontSize: 14, gap: 7 },
    md: { padding: '0 22px', height: 46, fontSize: 15, gap: 8 },
    lg: { padding: '0 30px', height: 56, fontSize: 17, gap: 10 },
  };
  const s = sizes[size] || sizes.md;

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.height,
    minHeight: 'var(--hit-min)',
    padding: s.padding,
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-display)',
    fontWeight: 'var(--weight-semibold)',
    fontSize: s.fontSize,
    letterSpacing: 'var(--tracking-snug)',
    borderRadius: 'var(--radius-pill)',
    border: '2px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'transform var(--dur-fast) var(--ease-out), background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  };

  const variants = {
    primary: {
      background: 'var(--color-primary)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-sm)',
    },
    accent: {
      background: 'var(--color-accent)',
      color: 'var(--text-on-brand)',
      boxShadow: 'var(--shadow-sm)',
    },
    secondary: {
      background: 'var(--surface-card)',
      color: 'var(--text-strong)',
      border: '2px solid var(--border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-primary)',
    },
  };

  const v = variants[variant] || variants.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...v, ...style }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
