import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from './brand';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('BRAND', () => {
  it('matches the theme colour shipped in globals.css', () => {
    // Catches the manifest and CSS theme colour drifting apart.
    const css = readFileSync('src/styles/globals.css', 'utf8');
    expect(css).toContain(BRAND.themeColor);
  });

  it('is the only place the product name is written', () => {
    // Catches a component hardcoding "Majlis", so a rename stays one line.
    const offenders = walk('src')
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('brand.ts') && !f.endsWith('brand.test.ts'))
      .filter((f) => readFileSync(f, 'utf8').includes('Majlis'));
    expect(offenders).toEqual([]);
  });
});
