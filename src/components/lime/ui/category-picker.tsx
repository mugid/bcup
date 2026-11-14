"use client";

import { Select } from "@base-ui/react/select";
import { Checkmark, ChevronDown, Icon } from "@/components/lime/icon";
import { useLimePortal } from "@/lib/lime/portal";
import type { Category } from "@/lib/photo-store";

type CategoryPickerProps = {
  categories: Category[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
};

export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const portal = useLimePortal();
  const selectedName = categories.find((category) => category.id === value)?.name ?? "Uncategorized";

  return (
    <Select.Root<string>
      value={value === null ? "uncategorized" : String(value)}
      onValueChange={(next) => {
        if (next) onChange(next === "uncategorized" ? null : Number(next));
      }}
    >
      <Select.Trigger
        aria-label={`Category: ${selectedName}`}
        className="flex h-(--control-md) w-full min-w-0 items-center justify-between rounded-field border border-line-strong bg-field px-3 text-sm text-fg hover:bg-surface-2 data-popup-open:bg-surface-2"
      >
        <Select.Value className="min-w-0 truncate" />
        <Icon icon={ChevronDown} size={16} className="ml-2 text-fg-2" />
      </Select.Trigger>
      <Select.Portal container={portal}>
        <Select.Positioner sideOffset={8} align="start" className="z-(--z-popover)">
          <Select.Popup className="max-h-(--popup-max) min-w-(--anchor-width) overflow-auto rounded-panel border border-line bg-raised p-1 shadow-menu">
            <Select.List>
              <Select.Item value="uncategorized" className="flex h-(--control-md) cursor-default items-center gap-2 rounded-field px-3 text-sm text-fg data-highlighted:bg-surface-2 data-selected:bg-accent-wash">
                <Select.ItemText>Uncategorized</Select.ItemText>
                <Select.ItemIndicator className="ml-auto"><Icon icon={Checkmark} size={16} /></Select.ItemIndicator>
              </Select.Item>
              {categories.map((category) => (
                <Select.Item key={category.id} value={String(category.id)} className="flex h-(--control-md) cursor-default items-center gap-2 rounded-field px-3 text-sm text-fg data-highlighted:bg-surface-2 data-selected:bg-accent-wash">
                  <Select.ItemText>{category.name}</Select.ItemText>
                  <Select.ItemIndicator className="ml-auto"><Icon icon={Checkmark} size={16} /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
