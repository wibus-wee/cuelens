export type EasingFunction = (progress: number) => number;

export type EasingName =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeOutQuint'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeOutElastic';

const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;

export const EASINGS: Readonly<Record<EasingName, EasingFunction>> = {
  linear: (value) => value,
  easeInQuad: (value) => value * value,
  easeOutQuad: (value) => value * (2 - value),
  easeInOutQuad: (value) => (value < 0.5 ? 2 * value * value : -1 + (4 - 2 * value) * value),
  easeInCubic: (value) => value * value * value,
  easeOutCubic: (value) => 1 + (value - 1) ** 3,
  easeInOutCubic: (value) =>
    value < 0.5 ? 4 * value * value * value : 1 + (value - 1) * (2 * value - 2) * (2 * value - 2),
  easeOutQuart: (value) => 1 - (1 - value) ** 4,
  easeInOutQuart: (value) => (value < 0.5 ? 8 * value ** 4 : 1 - 8 * (1 - value) ** 4),
  easeOutQuint: (value) => 1 - (1 - value) ** 5,
  easeInExpo: (value) => (value <= 0 ? 0 : 2 ** (10 * value - 10)),
  easeOutExpo: (value) => (value >= 1 ? 1 : 1 - 2 ** (-10 * value)),
  easeInOutExpo: (value) =>
    value <= 0
      ? 0
      : value >= 1
        ? 1
        : value < 0.5
          ? 2 ** (20 * value - 10) / 2
          : (2 - 2 ** (-20 * value + 10)) / 2,
  easeOutBack: (value) => 1 + BACK_C3 * (value - 1) ** 3 + BACK_C1 * (value - 1) ** 2,
  easeInOutBack: (value) =>
    value < 0.5
      ? ((2 * value) ** 2 * ((BACK_C2 + 1) * 2 * value - BACK_C2)) / 2
      : ((2 * value - 2) ** 2 * ((BACK_C2 + 1) * (2 * value - 2) + BACK_C2) + 2) / 2,
  easeOutElastic: (value) =>
    value <= 0
      ? 0
      : value >= 1
        ? 1
        : 2 ** (-10 * value) * Math.sin((value * 10 - 0.75) * ELASTIC_C4) + 1,
};

export function resolveEasing(easing: EasingName | EasingFunction | undefined): EasingFunction {
  if (typeof easing === 'function') return easing;
  return easing ? EASINGS[easing] : EASINGS.linear;
}
