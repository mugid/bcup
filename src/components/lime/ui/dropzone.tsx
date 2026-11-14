"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/lime/ui/button";
import { useLimePortal } from "@/lib/lime/portal";
import { cn } from "@/lib/lime/utils";

type DropzoneProps = {
  onFilesSelected: (files: File[]) => void | Promise<void>;
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  primary?: boolean;
};

export function Dropzone({ onFilesSelected, size = "md", disabled = false, className, buttonClassName, primary = true }: DropzoneProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const portal = useLimePortal();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser cannot access a webcam. Upload a photo instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setCameraReady(true);
        }
      } catch {
        if (!cancelled) setCameraError("Could not open the webcam. Check camera permission or upload a photo instead.");
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files?.length) void onFilesSelected(Array.from(files));
    event.target.value = "";
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Could not capture the photo. Please try again.");
      return;
    }
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("Could not capture the photo. Please try again.");
        return;
      }
      setCameraOpen(false);
      void onFilesSelected([new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" })]);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileChange} />
      <input ref={uploadInputRef} type="file" accept="image/*" multiple disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileChange} />
      <Button size={size} variant={primary ? "primary" : "outline"} className={cn("sm:hidden", buttonClassName)} disabled={disabled} onClick={() => cameraInputRef.current?.click()}>Take a photo</Button>
      <Button size={size} variant={primary ? "primary" : "outline"} className={cn("hidden sm:inline-flex", buttonClassName)} disabled={disabled} onClick={() => setCameraOpen(true)}>Use webcam</Button>
      <Button size={size} variant="outline" className={buttonClassName} disabled={disabled} onClick={() => uploadInputRef.current?.click()}>Upload photos</Button>
      <Dialog.Root open={cameraOpen} onOpenChange={setCameraOpen}>
        <Dialog.Portal container={portal}>
          <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim" />
          <Dialog.Popup className="fixed left-4 top-1/2 z-(--z-dialog) flex max-h-[90dvh] inset-x-4 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-sheet bg-raised p-4 shadow-overlay sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-overlay sm:-translate-x-1/2 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-xl font-semibold text-fg">Take a photo</Dialog.Title>
              <Dialog.Close className="rounded-control px-3 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Close</Dialog.Close>
            </div>
            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-panel bg-surface object-contain" style={{ transform: "scaleX(-1)" }} aria-label="Live webcam preview" />
            {cameraError && <p role="alert" className="text-sm text-danger-text">{cameraError}</p>}
            <Button size="lg" disabled={!cameraReady} onClick={capturePhoto}>Capture photo</Button>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export function VideoPicker({ onFileSelected, disabled = false, selected = false, label, primary = false, pending = false }: { onFileSelected: (file: File | null) => void; disabled?: boolean; selected?: boolean; label?: string; primary?: boolean; pending?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return <>
    <input ref={inputRef} id="clip-file" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { onFileSelected(event.target.files?.[0] ?? null); event.target.value = ""; }} />
    <Button type="button" variant={primary ? "primary" : "outline"} disabled={disabled} pending={pending} onClick={() => inputRef.current?.click()}>{label ?? (selected ? "Change video" : "Choose a video")}</Button>
  </>;
}
