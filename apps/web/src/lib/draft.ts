/** Keeps the user's edited fields and takes the server's value for the rest. */
export function rebaseDraft<T extends object>(draft: T, oldBase: T, next: T): T {
  const out = { ...next };
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (draft[key] !== oldBase[key]) out[key] = draft[key];
  }
  return out;
}
