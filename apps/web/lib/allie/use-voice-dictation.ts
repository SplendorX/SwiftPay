"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice notes for ALLIE, through the browser's own speech recognition
 * (Chrome, Edge, Safari). Nothing is recorded or uploaded by SwiftPay: the
 * words land in the composer as text, and the person reads them before
 * sending. That review step matters here, since a misheard amount is a
 * payment for the wrong amount.
 */

// Not in TypeScript's DOM lib everywhere; only what this hook touches.
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** The app's language, as the regional tag the recognizer expects. */
function recognitionLanguage() {
  const appLang = document.documentElement.lang || "en";
  const browserLang = navigator.language || "";
  return browserLang.toLowerCase().startsWith(appLang.toLowerCase())
    ? browserLang
    : appLang;
}

const errorMessages: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser to talk to ALLIE.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser to talk to ALLIE.",
  "audio-capture": "No microphone found. Plug one in or type instead.",
  "no-speech": "Didn't catch that. Tap the mic and try again.",
  network: "Voice needs an internet connection. Type instead for now.",
};

/** Stop listening after this long without new words. */
const silenceMs = 2_500;

export function useVoiceDictation({
  onTranscript,
}: {
  /** Called as words arrive, with everything heard since listening began. */
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimer = useRef<number | undefined>(undefined);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Checked after mount so server and client render the same markup.
  useEffect(() => {
    setSupported(Boolean(recognitionConstructor()));
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current !== undefined) {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = undefined;
    }
  }, []);

  const stop = useCallback(() => {
    clearSilenceTimer();
    recognitionRef.current?.stop();
  }, [clearSilenceTimer]);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = window.setTimeout(() => {
      recognitionRef.current?.stop();
    }, silenceMs);
  }, [clearSilenceTimer]);

  const start = useCallback(() => {
    const Recognition = recognitionConstructor();
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang = recognitionLanguage();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const words = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += words;
        else interim += words;
      }
      onTranscriptRef.current(`${finalText}${interim}`.replace(/\s+/g, " ").trim());
      armSilenceTimer();
    };

    recognition.onerror = (event) => {
      // "aborted" is our own stop on unmount, not something to report.
      if (event.error !== "aborted") {
        setError(errorMessages[event.error] ?? "Voice input stopped. Try again or type instead.");
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      recognitionRef.current = null;
      setListening(false);
    };

    setError(null);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      armSilenceTimer();
    } catch {
      recognitionRef.current = null;
      setError("Voice input could not start. Try again or type instead.");
    }
  }, [armSilenceTimer, clearSilenceTimer]);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(
    () => () => {
      clearSilenceTimer();
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [clearSilenceTimer],
  );

  return {
    clearError: useCallback(() => setError(null), []),
    error,
    listening,
    stop,
    supported,
    toggle,
  };
}
