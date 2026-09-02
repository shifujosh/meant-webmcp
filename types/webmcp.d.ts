export {};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }

  interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
  }

  interface SpeechRecognitionEventLike {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string; confidence: number };
    }>;
  }

  interface Document {
    modelContext?: {
      registerTool(tool: {
        name: string;
        title?: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: Record<string, unknown>;
        execute: (
          input: Record<string, unknown>,
          options?: { signal: AbortSignal },
        ) => Promise<unknown> | unknown;
      }, options?: {
        signal?: AbortSignal;
      }): Promise<void> | void;
    };
  }
}
