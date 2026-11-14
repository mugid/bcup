"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ArrowLeft, Checkmark, Microphone, Retry, Stop } from "@/components/lime/icon";
import { Button } from "@/components/lime/ui/button";
import { Chip } from "@/components/lime/ui/chip";
import { Field, FieldLabel } from "@/components/lime/ui/field";
import { Input } from "@/components/lime/ui/input";
import { LanguagePicker } from "@/components/lime/ui/language-picker";
import { categoryEmoji } from "@/lib/category-emoji";
import { isLanguage, type Language } from "@/lib/languages";
import { normalizeAnswer, shuffleItems } from "@/lib/quiz";

type Photo = NonNullable<ReturnType<typeof useQuery<typeof api.photos.list>>>[number];
type Answer = { text: string; correct: boolean };
type Stage = "setup" | "practice" | "results";
const UNCATEGORIZED = "uncategorized";
const MAX_RECORDING_MS = 5_000;
const PAUSE_TO_CHECK_MS = 700;

export default function QuizPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("Spanish");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("setup");
  const [cards, setCards] = useState<Photo[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [recording, setRecording] = useState(false);
  const [requestingMic, setRequestingMic] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestingMicRef = useRef(false);
  const mountedRef = useRef(true);
  const silenceWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLimitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const photosResult = useQuery(api.photos.list, ownerId ? { ownerId } : "skip");
  const categoriesResult = useQuery(api.categories.list, ownerId ? { ownerId } : "skip");
  const photos = photosResult ?? [];
  const categories = categoriesResult ?? [];

  useEffect(() => {
    try {
      const savedOwner = localStorage.getItem("bcup-owner-id");
      if (!savedOwner) throw new Error("Add photos before starting a quiz.");
      setOwnerId(savedOwner);
      const savedLanguage = localStorage.getItem("bcup-language");
      if (isLanguage(savedLanguage)) setLanguage(savedLanguage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Browser storage is required for quizzes.");
    }
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    if (silenceWatchRef.current) clearInterval(silenceWatchRef.current);
    if (recordingLimitRef.current) clearTimeout(recordingLimitRef.current);
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (recorderRef.current.state === "recording") recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const available = photos.filter((photo) => photo.language === language && typeof photo.label === "string" && photo.label.trim() && photo.url);
  const eligible = selectedCategories.length === 0 ? available : available.filter((photo) =>
    selectedCategories.some((id) => id === UNCATEGORIZED ? photo.categoryIds.length === 0 : photo.categoryIds.includes(id as Id<"categories">)));
  const chosenCount = Math.min(count ?? 5, eligible.length);
  const current = cards[index];
  const currentAnswer = current ? answers[current._id] : undefined;
  const microphoneStatus = requestingMic ? "Connecting microphone…"
    : recording ? "Microphone on. Listening…"
    : checking ? "Microphone off. Checking answer…"
    : currentAnswer?.correct ? "Answer correct. Microphone off."
    : currentAnswer ? "Microphone off. Tap to try again."
    : "Microphone off. Tap to speak.";
  const correct = cards.filter((card) => answers[card._id]?.correct);
  const revise = cards.filter((card) => !answers[card._id]?.correct);

  function toggleCategory(id: string) {
    setSelectedCategories((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function startQuiz() {
    if (eligible.length === 0) return;
    setCards(shuffleItems(eligible).slice(0, chosenCount));
    setAnswers({});
    setIndex(0);
    setError("");
    setStage("practice");
  }

  async function startRecording() {
    if (!current || recording || checking || requestingMicRef.current) return;
    requestingMicRef.current = true;
    setRequestingMic(true);
    setError("");
    if (!window.isSecureContext) {
      setError("Microphone access requires HTTPS or localhost.");
      requestingMicRef.current = false;
      setRequestingMic(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Try a browser with microphone support.");
      requestingMicRef.current = false;
      setRequestingMic(false);
      return;
    }
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume().catch(() => {});
    } catch {
      // Recording still works with the shorter time limit without audio analysis.
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const cardId = current._id;
      const expected = current.label ?? "";
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        recorder.onstop = null;
        clearRecordingWatch();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setChecking(false);
        setError("Recording failed. Tap the microphone to try again.");
      };
      recorder.onstop = () => {
        clearRecordingWatch();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          setChecking(false);
          setError("No audio was recorded. Tap the microphone to try again.");
          return;
        }
        void checkAnswer(blob, cardId, expected);
      };
      recorder.start();
      setRecording(true);
      recordingLimitRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
      try {
        const context = audioContextRef.current;
        if (!context) throw new Error("Audio analysis is unavailable.");
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let heardSpeech = false;
        let lastSpeechAt = 0;
        silenceWatchRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          const level = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
          const now = performance.now();
          if (level > 0.012) { heardSpeech = true; lastSpeechAt = now; }
          if (heardSpeech && now - lastSpeechAt > PAUSE_TO_CHECK_MS) stopRecording();
        }, 50);
      } catch {
        // The recording limit still submits the answer when audio analysis is unavailable.
      }
    } catch (cause) {
      clearRecordingWatch();
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setChecking(false);
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "Microphone permission is blocked. Allow access and try again."
        : cause instanceof DOMException && cause.name === "NotFoundError"
          ? "No microphone was found on this device."
          : "Could not start the microphone. Check its permission and try again.");
    } finally {
      requestingMicRef.current = false;
      setRequestingMic(false);
    }
  }

  function clearRecordingWatch() {
    if (silenceWatchRef.current) clearInterval(silenceWatchRef.current);
    if (recordingLimitRef.current) clearTimeout(recordingLimitRef.current);
    silenceWatchRef.current = null;
    recordingLimitRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      clearRecordingWatch();
      setChecking(true);
      try {
        recorderRef.current.stop();
      } catch {
        recorderRef.current.onstop = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        setChecking(false);
        setError("Recording stopped unexpectedly. Tap the microphone to try again.");
      }
    }
  }

  async function checkAnswer(audio: Blob, cardId: string, expected: string) {
    try {
      const form = new FormData();
      form.append("audio", audio, audio.type.includes("mp4") ? "answer.m4a" : "answer.webm");
      form.append("language", language);
      const response = await fetch("/api/quiz/transcribe", { method: "POST", body: form });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not check your answer.");
      const text = result && typeof result === "object" && "text" in result && typeof result.text === "string" ? result.text : "";
      if (!text) throw new Error("No word was heard. Try speaking closer to the microphone.");
      setAnswers((previous) => ({ ...previous, [cardId]: { text, correct: normalizeAnswer(text) === normalizeAnswer(expected) } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check your answer.");
    } finally {
      setChecking(false);
    }
  }

  function moveNext() {
    setError("");
    if (index + 1 === cards.length) setStage("results");
    else setIndex(index + 1);
  }

  function shuffleRemaining() {
    setCards((previous) => {
      const remaining = shuffleItems(previous.slice(index));
      if (remaining.length < 2) return previous;
      if (remaining[0]._id === previous[index]._id) {
        const swapIndex = 1 + Math.floor(Math.random() * (remaining.length - 1));
        [remaining[0], remaining[swapIndex]] = [remaining[swapIndex], remaining[0]];
      }
      return [...previous.slice(0, index), ...remaining];
    });
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl bg-page px-4 pb-8 pt-4 text-fg sm:px-6 sm:pt-8">
      <header className="flex h-14 items-center gap-3">
        <Link href="/" aria-label="Back to photos" className="flex size-(--control-lg) items-center justify-center rounded-control text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" width={20} height={20} /></Link>
        <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Practice words</h1>
      </header>

      {stage === "setup" && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-8 pt-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Choose a language</h2>
            <div className="flex items-center gap-3"><LanguagePicker value={language} onChange={(next) => { setLanguage(next); setSelectedCategories([]); }} /><span className="text-base">{language}</span></div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Choose collections</h2>
            <p className="text-base text-fg-2">Choose one or more, or use all collections.</p>
            <div className="flex flex-wrap gap-2">
              <Chip selected={selectedCategories.length === 0} onClick={() => setSelectedCategories([])}>All collections</Chip>
              {categories.map((category) => <Chip key={category._id} selected={selectedCategories.includes(category._id)} onClick={() => toggleCategory(category._id)}>{categoryEmoji(category.name, category.emoji)} {category.name}</Chip>)}
              <Chip selected={selectedCategories.includes(UNCATEGORIZED)} onClick={() => toggleCategory(UNCATEGORIZED)}>Uncategorized</Chip>
            </div>
          </section>
          <Field>
            <FieldLabel htmlFor="quiz-count">Number of words</FieldLabel>
            <Input id="quiz-count" type="number" min={1} max={Math.max(1, eligible.length)} value={eligible.length ? chosenCount : ""} onChange={(event) => setCount(Number(event.target.value))} />
            <p className="text-sm text-fg-2">{eligible.length} {eligible.length === 1 ? "word" : "words"} available</p>
          </Field>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <Button size="lg" disabled={!ownerId || photosResult === undefined || categoriesResult === undefined || chosenCount < 1 || !Number.isInteger(chosenCount)} onClick={startQuiz}>Start quiz</Button>
          {ownerId && photosResult !== undefined && eligible.length === 0 && <p className="text-base text-fg-2">No identified words match these choices. Add or identify photos to start practicing.</p>}
          <p className="text-base text-fg-2">Recorded answers are sent for speech recognition after you pause or stop recording.</p>
        </div>
      )}

      {stage === "practice" && current && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 pt-8">
          <div className="flex items-center justify-between gap-3"><p className="text-base text-fg-2">Word {index + 1} of {cards.length}</p><Button variant="ghost" size="sm" disabled={recording || requestingMic || checking || Boolean(currentAnswer) || cards.length - index < 2} onClick={shuffleRemaining}>Shuffle words</Button></div>
          <div className="mx-auto flex aspect-square w-full max-w-64 items-center justify-center rounded-panel border border-line bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url ?? undefined} alt="Object to name" className="h-full w-full object-contain" />
          </div>
          <p className="text-center text-base text-fg-2">Say the word in {language}.</p>
          {currentAnswer && <div role="status" className={currentAnswer.correct ? "rounded-panel bg-success-tint p-4 text-success-text" : "rounded-panel bg-warn-tint p-4 text-warn-text"}>
            <p className="font-semibold">{currentAnswer.correct ? "Correct" : "Revise this word"}</p>
            <p>You said: {currentAnswer.text}</p><p>Answer: {current.label}</p>
          </div>}
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          <div className="flex justify-center"><Button size="icon-round" variant={recording ? "solid" : currentAnswer?.correct || checking ? "secondary" : "primary"} pending={requestingMic || checking} disabled={currentAnswer?.correct || requestingMic || checking} aria-label={recording ? "Stop recording" : checking ? "Checking answer" : currentAnswer?.correct ? "Answer correct" : currentAnswer ? "Try recording again" : "Turn on microphone"} onClick={recording ? stopRecording : () => void startRecording()}>{recording ? <Stop aria-hidden="true" /> : currentAnswer?.correct ? <Checkmark aria-hidden="true" /> : currentAnswer ? <Retry aria-hidden="true" /> : <Microphone aria-hidden="true" />}</Button></div>
          <p role="status" className="text-center text-base text-fg-2">{microphoneStatus}</p>
          <Button variant="outline" size="lg" disabled={recording || requestingMic || checking} onClick={moveNext}>{currentAnswer ? index + 1 === cards.length ? "See results" : "Next word" : index + 1 === cards.length ? "Skip and see results" : "Skip word"}</Button>
        </div>
      )}

      {stage === "results" && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-8 pt-8">
          <div><h2 className="text-2xl font-semibold">Quiz results</h2><p className="mt-2 text-base text-fg-2">{correct.length} of {cards.length} correct in {language}</p></div>
          <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Correct answers</h2>{correct.length ? <ul className="flex flex-col gap-2">{correct.map((card) => <li key={card._id} className="flex items-center gap-3 rounded-panel bg-surface p-3"><span className="min-w-0 flex-1 font-medium">{card.label}</span><span className="text-sm text-success-text">Correct</span></li>)}</ul> : <p className="text-base text-fg-2">No correct answers yet.</p>}</section>
          <section className="flex flex-col gap-3"><h2 className="text-lg font-semibold">Words to revise</h2>{revise.length ? <ul className="flex flex-col gap-2">{revise.map((card) => <li key={card._id} className="flex items-center gap-3 rounded-panel bg-surface p-3"><span className="min-w-0 flex-1"><span className="block font-medium">{card.label}</span><span className="text-sm text-fg-2">{answers[card._id] ? `You said: ${answers[card._id].text}` : "Skipped"}</span></span><Link href={`/objects/${card._id}`} className="rounded-control px-3 py-2 text-sm font-medium text-fg underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Review word</Link></li>)}</ul> : <p className="text-base text-fg-2">You got every word right.</p>}</section>
          <Button size="lg" onClick={() => setStage("setup")}>Start another quiz</Button>
        </div>
      )}
    </main>
  );
}
