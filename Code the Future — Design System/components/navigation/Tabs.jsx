import React from 'react';

export function Tabs({ tabs = [], value, defaultValue, onChange, style, ...rest }) {
  const [internal, setInternal] = React.useState(defaultValue ?? tabs[0]?.value);
  const active = value !== undefined ? value : internal;

  const select = (v) => {
    if (value === undefined) setInternal(v);
    onChange && onChange(v);
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 5,
        background: 'var(--surface-sunken)',
        borderRadius: 'var(--radius-pill)',
        fontFamily: 'var(--font-display)',
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const on = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => select(t.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              border: 'none',
              cursor: 'pointer',
              padding: '0 18px',
              height: 38,
              borderRadius: 'var(--radius-pill)',
              fontFamily: 'var(--font-display)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--text-sm)',
              color: on ? 'var(--text-on-brand)' : 'var(--text-muted)',
              background: on ? 'var(--color-primary)' : 'transparent',
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
              transition: 'background var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out)',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
