/** Applied to the merged row, never the patch alone: a patch flipping only the toggle is valid if the row has both fields. */
export function certificateFieldsComplete(row: {
  certificateEnabled: boolean;
  certificateTitle: string | null;
  certificateSignatory: string | null;
}): boolean {
  if (!row.certificateEnabled) return true;
  return Boolean(row.certificateTitle?.trim() && row.certificateSignatory?.trim());
}
