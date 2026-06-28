'use client';

import { Folder, Library } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pickerOptions, type GroupNode } from './lib';

interface GroupPickerProps {
  groups: GroupNode[];
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  testId?: string;
}

/** Encode/decode between Select's string values and number | null. */
const ROOT_VALUE = 'root';

function encodeValue(v: number | null): string {
  return v === null ? ROOT_VALUE : String(v);
}

function decodeValue(s: string): number | null {
  if (s === ROOT_VALUE) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

/**
 * A shadcn Select listing "Library root" + all groups indented by depth.
 * Folder glyphs per row; depth-based paddingLeft indent.
 */
export function GroupPicker({
  groups,
  value,
  onChange,
  disabled,
  testId,
}: GroupPickerProps): React.JSX.Element {
  const options = pickerOptions(groups);

  return (
    <Select
      value={encodeValue(value)}
      onValueChange={(v) => onChange(decodeValue(v))}
      disabled={disabled}
    >
      <SelectTrigger data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem
            key={opt.id === null ? ROOT_VALUE : opt.id}
            value={opt.id === null ? ROOT_VALUE : String(opt.id)}
          >
            <span
              className="flex items-center gap-1.5"
              style={{ paddingLeft: opt.depth > 0 ? `${opt.depth * 14}px` : undefined }}
            >
              {opt.id === null ? (
                <Library size={14} className="text-muted-foreground shrink-0" />
              ) : (
                <Folder size={14} className="text-muted-foreground shrink-0" />
              )}
              {/* Group names are user labels → body font; mono is for facts only. */}
              <span>
                {opt.name}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
