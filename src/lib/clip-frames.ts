export async function extractClipFrames(file: File): Promise<{ duration: number; frames: Blob[] }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This video could not be opened."));
    });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 1 || duration > 15) throw new Error("Choose a video between 1 and 15 seconds.");
    if (!video.videoWidth || !video.videoHeight) throw new Error("This video has no visible frames.");
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read video frames.");
    const frames: Blob[] = [];
    for (const fraction of [0.08, 0.35, 0.65, 0.92]) {
      const target = Math.min(duration - 0.01, Math.max(0, duration * fraction));
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Could not read video frames."));
        video.currentTime = target;
      });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not read video frames.")), "image/jpeg", 0.76));
      frames.push(frame);
    }
    return { duration, frames };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
