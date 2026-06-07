export function Avatar({ name = '', src = null, size = 44, variant = 'spark', style, ...rest }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');

  const gradients = {
    spark: 'var(--gradient-spark)',
    sunrise: 'var(--gradient-sunrise)',
    night: 'var(--gradient-night)',
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-full)',
        background: src ? `center/cover no-repeat url(${src})` : (gradients[variant] || gradients.spark),
        color: 'var(--white)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 'var(--weight-bold)',
        fontSize: size * 0.4,
        letterSpacing: '0.01em',
        flex: 'none',
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18)',
        userSelect: 'none',
        ...style,
      }}
      title={name}
      {...rest}
    >
      {!src && initials}
    </div>
  );
}
