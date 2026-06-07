import React from 'react';

export function Input({
  label,
  hint,
  error,
  iconLeft = null,
  type = 'text',
  id,
  style,
  ...rest
}) {
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const [focused, setFocused] = React.useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-body)', ...style }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 48,
          padding: '0 16px',
          background: 'var(--surface-card)',
          border: `2px solid ${error ? 'var(--color-danger)' : focused ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: focused && !error ? 'var(--ring)' : 'none',
          transition: 'border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
        }}
      >
        {iconLeft && <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{iconLeft}</span>}
        <input
          id={inputId}
          type={type}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-strong)',
            minWidth: 0,
          }}
          {...rest}
        />
      </div>
      {(hint || error) && (
        <span style={{ fontSize: 'var(--text-xs)', color: error ? 'var(--color-danger)' : 'var(--text-muted)' }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
