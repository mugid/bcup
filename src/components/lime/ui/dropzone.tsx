"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/lime/ui/button";
import { useLimePortal } from "@/lib/lime/portal";
import { cn } from "@/lib/lime/utils";

type MediaPickerProps = {
  onFileSelected: (file: File) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function MediaPicker({ onFileSelected, disabled = false, className }: MediaPickerProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portal = useLimePortal();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    async function startCamera() {
      setCameraError("");
      setCameraReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser cannot access a webcam. Upload a file instead.");
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
        if (!cancelled) setCameraError("Could not open the webcam. Check camera permission or upload a file instead.");
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [cameraOpen]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onFileSelected(file);
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
      void onFileSelected(new File([blob], `webcam-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  function stopRecording() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported("video/webm")) {
      setCameraError("This browser cannot record webcam video. Upload a video instead.");
      return;
    }
    setCameraError("");
    const chunks: Blob[] = [];
    try {
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => {
        recorder.onstop = null;
        if (recorder.state === "recording") recorder.stop();
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        setCameraError("Could not record the video. Please try again.");
        setRecording(false);
      };
      recorder.onstop = () => {
        setRecording(false);
        const blob = new Blob(chunks, { type: "video/webm" });
        if (!blob.size) { setCameraError("No video was recorded. Please try again."); return; }
        setCameraOpen(false);
        void onFileSelected(new File([blob], `webcam-${Date.now()}.webm`, { type: "video/webm" }));
      };
      recorder.start();
      setRecording(true);
      recordingTimeoutRef.current = setTimeout(stopRecording, 15_000);
    } catch {
      setCameraError("Could not start recording. Please try again.");
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1 rounded-control border border-line bg-raised p-1 shadow-menu", className)}>
      <input ref={cameraInputRef} type="file" accept="image/*,video/*" capture="environment" disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileChange} />
      <input ref={uploadInputRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" disabled={disabled} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={handleFileChange} />
      <Button size="md" variant="primary" className="min-w-0 flex-1 px-2 sm:hidden" disabled={disabled} onClick={() => cameraInputRef.current?.click()}>Use camera</Button>
      <Button size="md" variant="primary" className="hidden min-w-0 flex-1 px-2 sm:inline-flex" disabled={disabled} onClick={() => setCameraOpen(true)}>Use camera</Button>
      <Button size="md" variant="outline" className="min-w-0 flex-1 px-2" disabled={disabled} onClick={() => uploadInputRef.current?.click()}>Upload</Button>
      <Dialog.Root open={cameraOpen} onOpenChange={(open) => { setCameraOpen(open); if (!open) setRecording(false); }}>
        <Dialog.Portal container={portal}>
          <Dialog.Backdrop className="fixed inset-0 z-(--z-dialog) bg-scrim" />
          <Dialog.Popup className="fixed left-4 top-1/2 z-(--z-dialog) flex max-h-[90dvh] inset-x-4 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-sheet bg-raised p-4 shadow-overlay sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-overlay sm:-translate-x-1/2 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-xl font-semibold text-fg">Use camera</Dialog.Title>
              <Dialog.Close className="rounded-control px-3 py-2 text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Close</Dialog.Close>
            </div>
            <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-panel bg-surface object-contain" style={{ transform: "scaleX(-1)" }} aria-label="Live webcam preview" />
            {cameraError && <p role="alert" className="text-sm text-danger-text">{cameraError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="lg" disabled={!cameraReady || recording} onClick={capturePhoto}>Capture photo</Button>
              <Button size="lg" variant="outline" disabled={!cameraReady} onClick={recording ? stopRecording : startRecording}>{recording ? "Stop recording" : "Record video"}</Button>
            </div>
            {recording && <p role="status" className="text-sm text-fg-2">Recording up to 15 seconds…</p>}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
