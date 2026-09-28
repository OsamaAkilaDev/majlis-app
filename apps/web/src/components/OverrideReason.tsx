'use client';

import { Field } from '@/components/Field';
import { Input } from '@/components/ui/input';

/** The API refuses an Admin override without a reason. `label` tells two on one screen apart. */
export function OverrideReason({
  value,
  onChange,
  label = 'Override reason',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={500}
        className="sm:max-w-md"
      />
    </Field>
  );
}
