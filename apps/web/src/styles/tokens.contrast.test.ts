import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Parsed from the real stylesheet, so a copy of the tokens cannot pass while the CSS fails. */
const CSS = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

export type Theme = Record<string, string>;

function camel(name: string): string {
  const [head, ...rest] = name.split('-');
  return (head ?? '') + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/**
 * Scoped to one rule so a token missing from `.dark` cannot inherit the light value.
 * Matched at line start: `.dark` first appears inside `@custom-variant`, not as a rule.
 */
function block(selector: string): Theme {
  const rule = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{`, 'm');
  const open = CSS.search(rule);
  if (open === -1) throw new Error(`globals.css has no ${selector} rule`);
  const body = CSS.slice(CSS.indexOf('{', open) + 1, CSS.indexOf('}', open));

  const theme: Theme = {};
  for (const [, name, hex] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    theme[camel(name!)] = hex!.toUpperCase();
  }
  return theme;
}

const LIGHT = block(':root');
const DARK = block('.dark');

/** Deliberately not redefined in `.dark`: the focus ring keeps one value in both themes. */
const FIXED = ['focus', 'focusContrast'];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every token a pair below names, so a typo reads as a missing token, not 1:1. */
function at(theme: Theme, name: string): string {
  const hex = theme[name];
  if (!hex) throw new Error(`globals.css declares no --${name}`);
  return hex;
}

const TEXT = 4.5;
/** SC 1.4.11 non-text contrast: a border or a ring, not a glyph. */
const NON_TEXT = 3;

/** [foreground token, background token, minimum ratio]. */
const PAIRS: Array<[string, string, number]> = [
  ['ink', 'bg', TEXT],
  ['ink', 'surface', TEXT],
  ['ink', 'surface2', TEXT],
  ['ink2', 'bg', TEXT],
  ['ink2', 'surface', TEXT],
  ['ink2', 'surface2', TEXT],
  ['ink3', 'bg', TEXT],
  ['ink3', 'surface', TEXT],
  ['primary', 'bg', TEXT],
  ['primary', 'surface', TEXT],
  ['primaryFg', 'primary', TEXT],
  ['primaryFg', 'primaryHover', TEXT],
  ['primarySoftFg', 'primarySoft', TEXT],
  ['okFg', 'okSoft', TEXT],
  ['warnFg', 'warnSoft', TEXT],
  ['badFg', 'badSoft', TEXT],
  ['infoFg', 'infoSoft', TEXT],
  ['muteFg', 'muteSoft', TEXT],
  ['bad', 'surface', TEXT],
  ['borderControl', 'bg', NON_TEXT],
  ['borderControl', 'surface', NON_TEXT],
  ['borderControl', 'surface2', NON_TEXT],
  ['primary', 'bg', NON_TEXT],
  ['primary', 'surface', NON_TEXT],
];

/** Object rows: the array form's positional `%s` printed a hex where the ratio belonged. */
function pairs(t: Theme) {
  return PAIRS.map(([fg, bg, min]) => ({
    pair: `${fg} on ${bg}`,
    fg: at(t, fg!),
    bg: at(t, bg!),
    min: min!,
  }));
}

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_name, theme) => {
  it.each(pairs(theme))('$pair meets $min:1', ({ fg, bg, min }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('contrast()', () => {
  // Only the two known extremes pin down swapped or dropped coefficients.
  it('returns 21 for black on white', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('returns 1 for a colour against itself', () => {
    expect(contrast('#0E5F55', '#0E5F55')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrast('#FAF7F2', '#1C1713')).toBeCloseTo(contrast('#1C1713', '#FAF7F2'), 10);
  });
});

describe('theme completeness', () => {
  // Derived from the stylesheet, so a token added to only one theme fails.
  it('.dark redefines every :root colour but the fixed ones', () => {
    expect(Object.keys(DARK).sort()).toEqual(
      Object.keys(LIGHT)
        .filter((k) => !FIXED.includes(k))
        .sort(),
    );
  });

  it.each(FIXED)('--%s is declared once, in :root only', (name) => {
    expect(LIGHT[name]).toBeDefined();
    expect(DARK[name]).toBeUndefined();
  });
});
