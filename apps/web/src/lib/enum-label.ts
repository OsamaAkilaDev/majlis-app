/** "VICE_LEAD" -> "Vice Lead". */
export function enumLabel(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

/** Every ClubRole but CTO, which enumLabel would title-case into "Cto". */
export function roleLabel(role: string): string {
  return role === 'CTO' ? 'CTO' : enumLabel(role);
}
