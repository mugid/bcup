"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/lime/utils";

type ChipProps = ComponentProps<typeof ButtonPrimitive> & { selected: boolean };

export function Chip({ selected, className, ...props }: ChipProps) {
  return (
    <ButtonPrimitive
      type="button"
      aria-pressed={selected}
      data-slot="chip"
      className={cn(
        "inline-flex h-(--control-sm) shrink-0 items-center justify-center rounded-control px-3 text-sm font-medium text-fg transition-[background-color,color] duration-(--dur-instant)",
        selected ? "bg-accent-wash" : "bg-surface-2 hover:bg-surface-3",
        className,
      )}
      {...props}
    />
  );
}
