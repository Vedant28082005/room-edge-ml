import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { applyTheme, getThemePref, setThemePref, type ThemePref } from '../lib/theme';

const OPTIONS: { v: ThemePref; label: string; icon: LucideIcon }[] = [
  { v: 'light', label: 'Light', icon: Sun },
  { v: 'dark', label: 'Dark', icon: Moon },
  { v: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref]);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {OPTIONS.map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => {
            setPref(v);
            setThemePref(v);
          }}
          className={`rounded-md p-1.5 transition-colors ${pref === v ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'}`}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
