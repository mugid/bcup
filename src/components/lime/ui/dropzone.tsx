"use client";

import { useRef } from "react";
import { Button } from "@/components/lime/ui/button";

type DropzoneProps = {
  onFilesSelected: (files: FileList) => void | Promise<void>;
  size?: "md" | "lg";
};

export function Dropzone({ onFilesSelected, size = "md" }: DropzoneProps) {
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
      <Button size={size} onClick={() => inputRef.current?.click()}>
        Take a photo
      </Button>
    </>
  );
}
