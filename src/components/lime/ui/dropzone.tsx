"use client";

import { useRef } from "react";
import { Button } from "@/components/lime/ui/button";

type DropzoneProps = {
  onFilesSelected: (files: FileList) => void | Promise<void>;
  size?: "md" | "lg";
  disabled?: boolean;
  pending?: boolean;
};

export function Dropzone({ onFilesSelected, size = "md", disabled, pending }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) void onFilesSelected(files);
          event.target.value = "";
        }}
      />
      <Button size={size} disabled={disabled} pending={pending} onClick={() => inputRef.current?.click()}>
        Take a photo
      </Button>
    </>
  );
}
