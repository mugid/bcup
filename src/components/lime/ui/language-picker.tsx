"use client";

import { Select } from "@base-ui/react/select";
import { Icon, Checkmark } from "@/components/lime/icon";
import { useLimePortal } from "@/lib/lime/portal";
import { LANGUAGES, type Language } from "@/lib/languages";

const FLAGS: Record<Language, string> = {
  Spanish: "🇪🇸",
  Chinese: "🇨🇳",
  French: "🇫🇷",
  German: "🇩🇪",
  Japanese: "🇯🇵",
  Korean: "🇰🇷",
  Portuguese: "🇵🇹",
  Russian: "🇷🇺",
};

type LanguagePickerProps = {
  value: Language;
  onChange: (language: Language) => void;
};

export function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const portal = useLimePortal();

  return (
    <Select.Root<Language>
      value={value}
      onValueChange={(next) => { if (next) onChange(next); }}
    >
      <Select.Trigger
        aria-label={`Language: ${value}`}
        className="flex size-(--control-lg) items-center justify-center rounded-control border border-line-strong bg-page text-xl shadow-card hover:bg-surface data-popup-open:bg-surface"
      >
        <span aria-hidden="true">{FLAGS[value]}</span>
      </Select.Trigger>
      <Select.Portal container={portal}>
        <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false} className="z-(--z-popover)">
          <Select.Popup className="w-80 rounded-panel border border-line bg-raised p-1 shadow-menu">
            <Select.List className="grid grid-cols-2 gap-1">
              {LANGUAGES.map((language) => (
                <Select.Item
                  key={language}
                  value={language}
                  className="flex h-(--control-lg) cursor-default items-center gap-2 rounded-field px-2 text-sm text-fg data-highlighted:bg-surface-2 data-selected:bg-accent-wash"
                >
                  <span aria-hidden="true" className="text-lg">{FLAGS[language]}</span>
                  <Select.ItemText>{language}</Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Icon icon={Checkmark} size={16} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
