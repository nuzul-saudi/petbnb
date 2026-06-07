// Petbnb — Input
// Text field matching the in-app style: paper fill, whisper hairline,
// 16px radius, Tajawal. RTL by default. Supports an optional label and
// a helper / error line. Focus thickens the border to the accent.

export function Input({
  label,
  value,
  onChange,
  placeholder,
  helper,
  error,
  type = 'text',
  disabled = false,
  id,
  ...rest
}) {
  const inputId = id ?? (label ? `in-${label}` : undefined);
  return (
    <label htmlFor={inputId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
      {label ? (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--weight-bold)',
            fontSize: 'var(--text-caption)',
            color: 'var(--text-body)',
          }}
        >
          {label}
        </span>
      ) : null}
      <input
        id={inputId}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        dir="auto"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-body-lg)',
          color: 'var(--text-body)',
          background: 'var(--surface-card)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border-hairline)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          minHeight: 'var(--tap-min)',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 120ms ease',
        }}
        onFocus={(e) => {
          if (!error) e.target.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          if (!error) e.target.style.borderColor = 'var(--border-hairline)';
        }}
        {...rest}
      />
      {error || helper ? (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-caption)',
            color: error ? 'var(--danger)' : 'var(--text-muted)',
          }}
        >
          {error ?? helper}
        </span>
      ) : null}
    </label>
  );
}
