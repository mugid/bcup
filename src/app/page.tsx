"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Tabs } from "@base-ui/react/tabs";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Icon, Image } from "@/components/lime/icon";
import { Button, Spinner } from "@/components/lime/ui/button";
import { Dropzone, VideoPicker } from "@/components/lime/ui/dropzone";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { PracticeQuiz } from "@/components/practice-quiz";
import { isLanguage, type Language } from "@/lib/languages";
import { categoryEmoji } from "@/lib/category-emoji";
import { cropTransparentObject } from "@/lib/cutout";
import { resizeForIdentification } from "@/lib/resize-for-identification";
import { extractClipFrames } from "@/lib/clip-frames";
type Photo = NonNullable<ReturnType<typeof useQuery<typeof api.photos.list>>>[number];
type IdentifiablePhoto = Pick<Photo, "_id" | "url">;
type HomeTab = "collections" | "videos" | "practice";
type ClipAnalysis = { title: string; descriptions: { text: string; translation: string }[]; words: { text: string; translation: string }[] };

function isHomeTab(value: string | null): value is HomeTab {
  return value === "collections" || value === "videos" || value === "practice";
}

type Bounds = { left: number; top: number; width: number; height: number };
function CategoryCard({ id, name, emoji: savedEmoji, photos, activeId, closing, closingInstant, restoreFocus, onOpen, onRequestClose, onClosed }: {
  id: string; name: string; emoji?: string; photos: Photo[];
  activeId: string | null; closing: boolean; closingInstant: boolean; restoreFocus: boolean;
  onOpen: (id: string, instant: boolean) => void; onRequestClose: (instant?: boolean, restoreFocus?: boolean) => void; onClosed: () => void;
}) {
  const [origin, setOrigin] = useState<Bounds | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [instant, setInstant] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeTriggerRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const closeLabelRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const contentAnimationsRef = useRef<Animation[]>([]);
  const skipMotionRef = useRef(false);
  const emoji = categoryEmoji(name, savedEmoji);
  const isActive = activeId === id;
  const position = useMemo(() => {
    if (!origin || !viewport) return undefined;
    const columns = viewport.width >= 640 ? 3 : 2;
    const rows = Math.ceil(photos.length / columns);
    const width = Math.min(640, viewport.width - 32);
    const height = Math.min(viewport.height * 0.85, Math.max(origin.height, 80 + rows * 144 + Math.max(0, rows - 1) * 12));
    return { position: "fixed" as const, left: (viewport.width - width) / 2, top: (viewport.height - height) / 2, width, height };
  }, [origin, viewport, photos.length]);

  function open(event: MouseEvent<HTMLButtonElement>) {
    if (isActive) {
      onRequestClose(event.detail === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches, event.detail === 0);
      return;
    }
    if (activeId !== null) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOrigin({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    skipMotionRef.current = event.detail === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setInstant(skipMotionRef.current);
    setRevealed(skipMotionRef.current);
    onOpen(id, skipMotionRef.current);
    if (event.detail === 0) requestAnimationFrame(() => activeTriggerRef.current?.focus());
  }

  useLayoutEffect(() => {
    if (!isActive || !origin || !position || !cardRef.current || animationRef.current || skipMotionRef.current) return;
    const frame = (bounds: Bounds) => ({
      left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    });
    animationRef.current = cardRef.current.animate([
      frame(origin),
      frame(position),
    ], {
      duration: 260,
      easing: "cubic-bezier(0.77, 0, 0.175, 1)",
      fill: "both",
    });
    animationRef.current.onfinish = () => setRevealed(true);
    const timing = { duration: 260, fill: "both" as const, easing: "linear" };
    contentAnimationsRef.current = [
      previewRef.current?.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 0.76 }, { opacity: 0, offset: 1 }], timing),
      detailsRef.current?.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.78 }, { opacity: 1, offset: 1 }], timing),
      countRef.current?.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 0.76 }, { opacity: 0, offset: 1 }], timing),
      closeLabelRef.current?.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.78 }, { opacity: 1, offset: 1 }], timing),
    ].filter((animation): animation is Animation => Boolean(animation));
  }, [isActive, origin, position]);

  useEffect(() => {
    if (!isActive || !closing) return;
    const animation = animationRef.current;
    if (!animation || skipMotionRef.current || closingInstant) {
      onClosed();
      if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
      return;
    }
    animation.onfinish = () => {
      onClosed();
      if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };
    animation.reverse();
    contentAnimationsRef.current.forEach((contentAnimation) => contentAnimation.reverse());
  }, [isActive, closing, closingInstant, restoreFocus, onClosed]);

  useEffect(() => {
    if (isActive) return;
    animationRef.current?.cancel();
    animationRef.current = null;
    contentAnimationsRef.current.forEach((animation) => animation.cancel());
    contentAnimationsRef.current = [];
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onRequestClose(true, true);
      } else if (event.key === "Tab" && cardRef.current) {
        const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"))
          .filter((element) => !element.closest("[inert]"));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !cardRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !cardRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    function onResize() { setViewport({ width: window.innerWidth, height: window.innerHeight }); }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [isActive, onRequestClose]);

  const showDetails = revealed && !closing;

  return (
    <div style={isActive && origin ? { height: origin.height } : undefined}>
    <div ref={cardRef} style={isActive ? position : undefined} className={`flex w-full min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-surface ${isActive ? "z-(--z-dialog) shadow-overlay" : ""}`}>
      {isActive ? (
        <>
          <Button ref={activeTriggerRef} variant="plain" size="category" onClick={open} aria-expanded="true" aria-label={`Close ${name}`}>
            <span className="flex w-full items-start justify-between gap-3">
              <span className="min-w-0 break-words text-lg font-semibold text-fg">{emoji} {name}</span>
              <span className="grid shrink-0 text-sm text-fg-2 [grid-template-areas:'stack']">
                <span ref={countRef} aria-hidden="true" className={`[grid-area:stack] ${instant ? "opacity-0" : "opacity-100"}`}>{photos.length} {photos.length === 1 ? "object" : "objects"}</span>
                <span ref={closeLabelRef} aria-hidden="true" className={`justify-self-end [grid-area:stack] ${instant ? "opacity-100" : "opacity-0"}`}>Close</span>
              </span>
            </span>
          </Button>
          <div className="relative min-h-0 flex-1">
          <div ref={previewRef} aria-hidden="true" className={`absolute inset-0 grid grid-cols-3 content-start gap-2 px-3 pb-3 ${instant ? "opacity-0" : "opacity-100"}`}>
            {photos.slice(0, 3).map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo._id} src={photo.url ?? undefined} alt="" className="size-(--control-lg) rounded-field object-contain" />
            ))}
          </div>
          <div ref={detailsRef} aria-hidden={!showDetails} inert={!showDetails} className={`absolute inset-0 grid grid-cols-2 content-start gap-3 overflow-y-auto px-3 pb-3 sm:grid-cols-3 ${instant ? "opacity-100" : "opacity-0"}`}>
            {photos.map((photo) => (
              <Link key={photo._id} href={`/objects/${photo._id}`} className="flex min-w-0 flex-col items-center gap-2 rounded-panel p-2 text-center text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url ?? undefined} alt="" className="size-[calc(var(--control-lg)*2)] rounded-field object-contain" />
                <span className="w-full text-base font-medium break-words">{photo.label === null ? "No clear object" : photo.label ?? "Identifying…"}</span>
              </Link>
            ))}
          </div>
          </div>
        </>
      ) : <Button ref={triggerRef} id={`category-trigger-${id}`} type="button" variant="plain" size="category" onClick={open} aria-expanded="false" aria-label={`Open ${name}`}>
        <span className="flex w-full items-start justify-between gap-3">
          <span className="min-w-0 break-words text-lg font-semibold text-fg">{emoji} {name}</span>
          <span className="shrink-0 text-sm text-fg-2">{photos.length} {photos.length === 1 ? "object" : "objects"}</span>
        </span>
        <span className="grid w-fit grid-cols-3 gap-2">
          {photos.slice(0, 3).map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo._id} src={photo.url ?? undefined} alt="" className="size-(--control-lg) rounded-field object-contain" />
          ))}
        </span>
      </Button>}
    </div>
    </div>
  );
}

export default function Home() {
  const convex = useConvex();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const photoResults = useQuery(api.photos.list, ownerId ? { ownerId } : "skip");
  const clipResults = useQuery(api.clips.list, ownerId ? { ownerId } : "skip");
  const categoryResults = useQuery(api.categories.list, ownerId ? { ownerId } : "skip");
  const photos = photoResults ?? [];
  const clips = clipResults ?? [];
  const categories = categoryResults ?? [];
  const dataReady = photoResults !== undefined && categoryResults !== undefined && clipResults !== undefined;
  const createPhoto = useMutation(api.photos.create);
  const createClip = useMutation(api.clips.create);
  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const applyIdentification = useMutation(api.photos.applyIdentification);
  const identificationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isPreparing, setIsPreparing] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [videoStatus, setVideoStatus] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [language, setLanguage] = useState<Language>("Spanish");
  const [activeTab, setActiveTab] = useState<HomeTab>("collections");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [closingCategory, setClosingCategory] = useState(false);
  const [instantCategory, setInstantCategory] = useState(false);
  const [closingInstant, setClosingInstant] = useState(false);
  const [restoreCategoryFocus, setRestoreCategoryFocus] = useState(false);
  useEffect(() => {
    const syncTab = () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(isHomeTab(requested) ? requested : "collections");
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    return () => window.removeEventListener("popstate", syncTab);
  }, []);

  function changeTab(next: HomeTab) {
    setActiveTab(next);
    const url = next === "collections" ? "/" : `/?tab=${next}`;
    if (window.location.pathname + window.location.search !== url) window.history.pushState(null, "", url);
  }
  const openCategory = useCallback((id: string, instant: boolean) => {
    setClosingCategory(false);
    setClosingInstant(false);
    setRestoreCategoryFocus(false);
    setInstantCategory(instant);
    setActiveCategoryId(id);
  }, []);
  const requestCloseCategory = useCallback((instant = false, restoreFocus = false) => {
    setClosingInstant(instant);
    setRestoreCategoryFocus(restoreFocus);
    setClosingCategory(true);
  }, []);
  const finishCloseCategory = useCallback(() => {
    setActiveCategoryId(null);
    setClosingCategory(false);
    setClosingInstant(false);
    setRestoreCategoryFocus(false);
  }, []);

  useEffect(() => {
    if (activeCategoryId === null) return;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
    };
  }, [activeCategoryId]);

  useEffect(() => {
    try {
      let saved = localStorage.getItem("bcup-owner-id");
      if (!saved) {
        saved = crypto.randomUUID();
        localStorage.setItem("bcup-owner-id", saved);
      }
      setOwnerId(saved);
    } catch {
      setError("Browser storage is required to access your photos.");
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bcup-language");
      if (isLanguage(saved)) setLanguage(saved);
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (!photoResults) return;
    setPendingIds((current) => {
      const completed = photoResults.filter((photo) => photo.label !== undefined && current.has(photo._id));
      if (completed.length === 0) return current;
      const next = new Set(current);
      for (const photo of completed) next.delete(photo._id);
      return next;
    });
  }, [photoResults]);

  function handleLanguageChange(nextLanguage: Language) {
    setLanguage(nextLanguage);
    try {
      localStorage.setItem("bcup-language", nextLanguage);
    } catch {
      // The selection still works for the current visit.
    }
  }

  async function identifyPhoto(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    try {
      if (!ownerId) return;
      const file = sourceFile ?? (photo.url
        ? await fetch(photo.url).then((response) => {
          if (!response.ok) throw new Error("Photo could not be loaded.");
          return response.blob();
        })
        : null);
      if (!file) throw new Error("Photo could not be loaded.");
      const resized = await resizeForIdentification(file);
      const form = new FormData();
      form.append("photo", resized, "photo.jpg");
      form.append("language", photoLanguage);
      const currentCategories = await convex.query(api.categories.list, { ownerId });
      form.append("categories", JSON.stringify(currentCategories.map((category) => category.name)));
      const response = await fetch("/api/identify", { method: "POST", body: form });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result &&
          typeof result.error === "string" ? result.error : "Identification request failed.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("label" in result) || !("category" in result)) {
        throw new Error("Invalid identification result");
      }
      const label = result.label;
      const suggestedCategory = result.category;
      if (!(typeof label === "string" || label === null) ||
          !(typeof suggestedCategory === "string" || suggestedCategory === null)) {
        throw new Error("Invalid identification result");
      }
      const pronunciation = "pronunciation" in result && typeof result.pronunciation === "string" ? result.pronunciation : null;
      await applyIdentification({ ownerId, photoId: photo._id, language: photoLanguage, label, suggestedCategory, pronunciation });
      setError("");
    } catch (cause) {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(photo._id);
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Could not identify the object.");
    }
  }

  function queueIdentification(photo: IdentifiablePhoto, photoLanguage: Language, sourceFile?: Blob) {
    setPendingIds((current) => new Set(current).add(photo._id));
    identificationQueueRef.current = identificationQueueRef.current
      .then(() => identifyPhoto(photo, photoLanguage, sourceFile));
  }

  async function handlePhotoSelection(files: File[]) {
    if (!ownerId || isPreparing) return;
    changeTab("collections");
    const selected = files.filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) {
      setError("Choose a photo to add.");
      return;
    }

    setIsPreparing(true);
    try {
      for (const file of selected) {
        const form = new FormData();
        form.append("photo", await resizeForIdentification(file, 1024), "photo.jpg");
        const removalResponse = await fetch("/api/remove-background", { method: "POST", body: form });
        if (!removalResponse.ok) {
          const result: unknown = await removalResponse.json().catch(() => null);
          throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error : "Could not remove the background.");
        }
        const cutout = await cropTransparentObject(await removalResponse.blob());
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: cutout });
        if (!response.ok) throw new Error("Upload failed.");
        const { storageId } = await response.json() as { storageId: Id<"_storage"> };
        const photoId = await createPhoto({ ownerId, storageId, language });
        queueIdentification({ _id: photoId, url: null }, language, file);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photos could not be saved. Please try again.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function uploadVideoBlob(blob: Blob): Promise<Id<"_storage">> {
    const url = await generateUploadUrl({});
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
    if (!response.ok) throw new Error("Could not upload the video. Try again.");
    const result = await response.json() as { storageId: Id<"_storage"> };
    return result.storageId;
  }

  async function handleVideoSelection(file: File | null) {
    if (!file || !ownerId || videoBusy) return;
    changeTab("videos");
    setVideoError("");
    setVideoStatus("");
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) { setVideoError("Choose an MP4, WebM, or MOV video."); return; }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) { setVideoError("Choose a video under 20 MB."); return; }
    const selectedLanguage = language;
    setVideoBusy(true);
    try {
      const { frames } = await extractClipFrames(file);
      const form = new FormData();
      form.append("language", selectedLanguage);
      frames.forEach((frame, index) => form.append("frames", frame, `frame-${index}.jpg`));
      const response = await fetch("/api/describe-clip", { method: "POST", body: form });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Could not describe this clip.");
      if (!data || typeof data !== "object" || !("title" in data) || !("descriptions" in data) || !("words" in data) ||
          typeof data.title !== "string" || !Array.isArray(data.descriptions) || !Array.isArray(data.words)) throw new Error("Invalid description response.");
      const [storageId, posterStorageId] = await Promise.all([uploadVideoBlob(file), uploadVideoBlob(frames[0])]);
      await createClip({ ownerId, storageId, posterStorageId, language: selectedLanguage, ...(data as ClipAnalysis) });
      setVideoStatus("Video added to your memories.");
    } catch (cause) {
      setVideoError(cause instanceof Error ? cause.message : "Could not save this video. Try again.");
    } finally {
      setVideoBusy(false);
    }
  }

  const readyPhotos = photos.filter((photo) => photo.label !== undefined);
  const needsIdentification = photos.filter((photo) => photo.label === undefined && !pendingIds.has(photo._id));
  const groupedPhotos: { id: string; name: string; emoji?: string; photos: Photo[] }[] = categories.map((category) => ({
    id: category._id,
    name: category.name,
    emoji: category.emoji,
    photos: readyPhotos.filter((photo) => photo.categoryIds.includes(category._id)),
  })).filter((group) => group.photos.length > 0);
  const uncategorized = readyPhotos.filter((photo) => !photo.categoryIds.some((id) => categories.some((category) => category._id === id)));
  if (uncategorized.length > 0) groupedPhotos.push({ id: "uncategorized", name: "Uncategorized", photos: uncategorized });

  return (
    <div className="relative min-h-dvh bg-page text-fg">
      {activeCategoryId !== null && <div aria-hidden="true" onPointerDown={() => requestCloseCategory()} className={`category-backdrop fixed inset-0 z-[calc(var(--z-dialog)-1)] bg-scrim ${closingCategory ? "category-backdrop-exit" : ""} ${instantCategory || closingInstant ? "category-backdrop-instant" : ""}`} />}
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-8 pb-52 sm:px-6 sm:pb-28">
        <h1 className="sr-only">BCup</h1>
        {!ownerId && error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        <Tabs.Root value={activeTab} onValueChange={(value) => { if (isHomeTab(value)) changeTab(value); }}>
          <Tabs.List aria-label="Library" className="flex items-center justify-between gap-2 overflow-x-auto border-b border-line">
            <Tabs.Tab value="collections" className="shrink-0 whitespace-nowrap border-b-2 border-transparent px-2 py-3 text-sm font-medium text-fg-2 data-active:border-fg data-active:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-base">Collections</Tabs.Tab>
            <Tabs.Tab value="videos" className="shrink-0 whitespace-nowrap border-b-2 border-transparent px-2 py-3 text-sm font-medium text-fg-2 data-active:border-fg data-active:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-base">Video memories</Tabs.Tab>
            <Tabs.Tab value="practice" className="shrink-0 whitespace-nowrap border-b-2 border-transparent px-2 py-3 text-sm font-medium text-fg-2 data-active:border-fg data-active:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-base">Practice</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="collections" className="flex flex-col gap-6 pt-6">
            {(isPreparing || pendingIds.size > 0) && <p role="status" className="flex items-center gap-2 text-sm text-fg-2"><Spinner size={16} />{isPreparing ? "Preparing photos…" : "Identifying photos…"}</p>}
            {ownerId && error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            {dataReady && photos.length === 0 && !isPreparing && <div className="flex flex-col items-center gap-2 py-16 text-center"><Icon icon={Image} size={48} className="text-fg-2" /><h2 className="text-lg font-semibold">No collections yet</h2><p className="text-base text-fg-2">Add a photo using the controls below.</p></div>}
            <div className="mx-auto grid w-full max-w-overlay-lg grid-cols-1 gap-4">
              {groupedPhotos.map((group) => <CategoryCard key={group.id} id={group.id} name={group.name} emoji={group.emoji} photos={group.photos} activeId={activeCategoryId} closing={closingCategory} closingInstant={closingInstant} restoreFocus={restoreCategoryFocus} onOpen={openCategory} onRequestClose={requestCloseCategory} onClosed={finishCloseCategory} />)}
            </div>
            {needsIdentification.length > 0 && <section className="flex flex-col gap-2"><h2 className="text-lg font-semibold">Needs identification</h2>{needsIdentification.map((photo) => <Link key={photo._id} href={`/objects/${photo._id}`} className="flex items-center gap-3 rounded-panel p-2 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url ?? undefined} alt="" className="size-(--control-lg) shrink-0 rounded-field object-contain" /><span className="text-sm">Open photo to retry</span></Link>)}</section>}
          </Tabs.Panel>
          <Tabs.Panel value="videos" className="flex flex-col gap-6 pt-6">
            {videoBusy && <p role="status" className="flex items-center gap-2 text-sm text-fg-2"><Spinner size={16} />Reading the clip, writing sentences, and saving it…</p>}
            {videoError && <p role="alert" className="text-sm text-danger-text">{videoError}</p>}
            {videoStatus && <p role="status" className="text-sm text-fg-2">{videoStatus}</p>}
            {dataReady && clips.length === 0 && !videoBusy && <div className="flex flex-col items-center gap-2 py-16 text-center"><h2 className="text-lg font-semibold">No video memories yet</h2><p className="text-base text-fg-2">Upload a short video using the control below.</p></div>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{clips.map((clip) => <Link key={clip._id} href={`/clips/${clip._id}`} className="overflow-hidden rounded-panel border border-line bg-surface text-fg transition-[background-color] duration-(--dur-fast) hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clip.posterUrl ?? undefined} alt="" className="aspect-video w-full object-cover" />
              <div className="flex flex-col gap-1 p-4"><span className="font-semibold">{clip.title}</span><span className="text-sm text-fg-2">{clip.language} · {clip.descriptions.length} descriptions</span></div></Link>)}</div>
          </Tabs.Panel>
          <Tabs.Panel value="practice">{activeTab === "practice" && <PracticeQuiz ownerId={ownerId} language={language} />}</Tabs.Panel>
        </Tabs.Root>
      </main>
      <nav aria-label="Collection actions" className="collection-action-deck fixed inset-x-4 z-20 mx-auto flex w-auto max-w-5xl flex-col gap-2 rounded-sheet border border-line bg-raised p-3 shadow-menu sm:inset-x-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <LanguagePicker value={language} onChange={handleLanguageChange} />
          <Dropzone onFilesSelected={handlePhotoSelection} disabled={isPreparing || !ownerId} primary={activeTab === "collections"} className="min-w-0 flex-1 flex-nowrap" buttonClassName="min-w-0 flex-1" />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 sm:ml-auto">
          <VideoPicker onFileSelected={(file) => { void handleVideoSelection(file); }} disabled={videoBusy || !ownerId} pending={videoBusy} primary={activeTab === "videos"} label="Upload video" />
          <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/upgrade"; }}>View Plus</Button>
        </div>
      </nav>
    </div>
  );
}
