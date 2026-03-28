import GlobalLoadingOverlay from "@/components/GlobalLoadingOverlay";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type LoadingOptions = {
  message?: string;
  minDurationMs?: number;
};

type GlobalLoadingContextValue = {
  isVisible: boolean;
  message: string;
  startLoading: (message?: string) => void;
  stopLoading: () => void;
  pulseLoading: (message?: string, durationMs?: number) => Promise<void>;
  withLoading: <T>(task: Promise<T> | (() => Promise<T>), options?: LoadingOptions) => Promise<T>;
};

const DEFAULT_MESSAGE = "Feliz Dia das Maes";
const DEFAULT_DURATION_MS = 1200;

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const activeCountRef = useRef(0);
  const [isVisible, setIsVisible] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  const startLoading = useCallback((nextMessage?: string) => {
    activeCountRef.current += 1;
    setMessage(nextMessage || DEFAULT_MESSAGE);
    setIsVisible(true);
  }, []);

  const stopLoading = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current === 0) {
      setIsVisible(false);
      setMessage(DEFAULT_MESSAGE);
    }
  }, []);

  const pulseLoading = useCallback(
    async (nextMessage?: string, durationMs: number = DEFAULT_DURATION_MS) => {
      startLoading(nextMessage);
      await new Promise((resolve) => window.setTimeout(resolve, durationMs));
      stopLoading();
    },
    [startLoading, stopLoading]
  );

  const withLoading = useCallback(
    async <T,>(
      task: Promise<T> | (() => Promise<T>),
      options?: LoadingOptions
    ): Promise<T> => {
      const startedAt = Date.now();
      const minDurationMs = options?.minDurationMs ?? DEFAULT_DURATION_MS;

      startLoading(options?.message);

      try {
        const promise = typeof task === "function" ? task() : task;
        return await promise;
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < minDurationMs) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, minDurationMs - elapsed)
          );
        }
        stopLoading();
      }
    },
    [startLoading, stopLoading]
  );

  const value = useMemo(
    () => ({
      isVisible,
      message,
      startLoading,
      stopLoading,
      pulseLoading,
      withLoading,
    }),
    [isVisible, message, startLoading, stopLoading, pulseLoading, withLoading]
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      <GlobalLoadingOverlay visible={isVisible} message={message} />
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);

  if (!context) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }

  return context;
}
