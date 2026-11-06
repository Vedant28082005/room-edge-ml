const BY_NAME: Record<string, string> = {
  ac_on: '#3B82F6',
  normal: '#10B981',
  window_open: '#F59E0B',
};
const NEUTRALS = ['#8B93A5', '#A9AFBD', '#6B7280', '#C4C9D4'];

export const ERROR_COLOR = '#EF4444';

/** Class colour by name; unknown classes get a neutral grey (varied by index so stacks stay readable). */
export function classColor(name: string | null | undefined, index = 0): string {
  if (name && BY_NAME[name]) return BY_NAME[name];
  return NEUTRALS[index % NEUTRALS.length];
}
