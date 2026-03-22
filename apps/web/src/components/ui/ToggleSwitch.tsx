interface ToggleSwitchOption {
  value: string;
  icon: string;
  title: string;
}

interface ToggleSwitchProps {
  value: string;
  options: ToggleSwitchOption[];
  onChange: (value: string) => void;
}

export function ToggleSwitch({ value, options, onChange }: ToggleSwitchProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'hsl(var(--muted))',
        borderRadius: '4px',
        padding: '2px',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '3px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: value === option.value ? 'hsl(var(--card))' : 'transparent',
            color: value === option.value ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
            boxShadow: value === option.value ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
            transition: 'all 0.2s ease',
          }}
          aria-pressed={value === option.value}
          aria-label={option.title}
          title={option.title}
        >
          <i className={option.icon} style={{ fontSize: '14px' }} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
