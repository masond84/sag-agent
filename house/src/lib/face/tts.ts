import { stripMarkdownForSpeech } from "@/lib/worker";

export async function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  const cleaned = stripMarkdownForSpeech(text);
  if (!cleaned) {
    return;
  }

  onStart?.();

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleaned }),
    });

    if (response.ok && response.headers.get("Content-Type")?.includes("audio")) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await playAudioUrl(url);
      URL.revokeObjectURL(url);
      onEnd?.();
      return;
    }
  } catch {
    // fall through to Web Speech API
  }

  await speakWithWebSpeech(cleaned);
  onEnd?.();
}

function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed"));
    void audio.play().catch(reject);
  });
}

function speakWithWebSpeech(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}
