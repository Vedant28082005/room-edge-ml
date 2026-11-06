import { CircleHelp, Home, Snowflake, Wind, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  ac_on: Snowflake,
  normal: Home,
  window_open: Wind,
};

export function StateIcon({ name, size = 20, color }: { name: string | null; size?: number; color?: string }) {
  const Icon = (name && ICONS[name]) || CircleHelp;
  return <Icon size={size} color={color} strokeWidth={1.75} aria-hidden="true" />;
}
