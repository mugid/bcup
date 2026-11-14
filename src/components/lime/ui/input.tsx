"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/lime/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn("h-(--control-md) w-full rounded-field border border-line-strong bg-field px-3 text-base text-fg placeholder:text-fg-3 disabled:text-fg-disabled", className)}
      {...props}
    />
  );
}
