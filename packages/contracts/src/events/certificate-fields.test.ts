import { describe, expect, it } from 'vitest';
import { certificateFieldsComplete } from './certificate-fields';

const off = { certificateEnabled: false, certificateTitle: null, certificateSignatory: null };

describe('certificateFieldsComplete', () => {
  it('asks for nothing while certificates are off', () => {
    expect(certificateFieldsComplete(off)).toBe(true);
    // A leftover title must not trap an officer who only wanted to switch certificates off.
    expect(certificateFieldsComplete({ ...off, certificateTitle: 'Old title' })).toBe(true);
  });

  it('needs both fields once certificates are on', () => {
    // Each half asserted missing on its own: a title-only rule would issue a document signed by nobody.
    const on = { ...off, certificateEnabled: true };
    expect(certificateFieldsComplete(on)).toBe(false);
    expect(certificateFieldsComplete({ ...on, certificateTitle: 'A' })).toBe(false);
    expect(certificateFieldsComplete({ ...on, certificateSignatory: 'B' })).toBe(false);
    expect(certificateFieldsComplete({ ...on, certificateTitle: 'A', certificateSignatory: 'B' })).toBe(true);
  });

  it('does not count whitespace as a value', () => {
    // `!== null` would accept this and print a blank line where a name belongs.
    const on = { certificateEnabled: true, certificateTitle: '   ', certificateSignatory: 'B' };
    expect(certificateFieldsComplete(on)).toBe(false);
  });
});
