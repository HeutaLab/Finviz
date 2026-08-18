/**
 * Dark-only by design: the heatmap's colour encoding is calibrated against
 * a dark ground, and a light background washes the neutral slate out until
 * flat names read as gains.
 */
export const theme = {
  bg: '#0b0d12',
  surface: '#151922',
  surfaceRaised: '#1d222d',
  border: '#2a3040',
  text: '#e8ecf4',
  textMuted: '#8b93a7',
  accent: '#4c8dff',
  danger: '#f63538',
  success: '#30cc5a',
  radius: 12,
  space: (n: number) => n * 4,
} as const;

export const font = {
  tile: 'System',
} as const;
