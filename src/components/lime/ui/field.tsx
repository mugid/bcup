"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/lime/utils";

export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="field" className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return <label data-slot="field-label" className={cn("text-sm font-medium text-fg", className)} {...props} />;
}
