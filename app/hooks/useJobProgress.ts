import { useEffect, useRef, useState, useCallback } from "react";

interface JobProgress {
  jobId: string;
  status: string;
  completedItems: number;
  totalItems: number;
  failedItems: number;
  errorMessage?: string | null;
}

interface UseJobProgressOptions {
  onComplete?: () => void;
  onError?: () => void;
}

export function useJobProgress(
  jobIds: string[],
  options?: UseJobProgressOptions,
) {
  const [progressMap, setProgressMap] = useState<Record<string, JobProgress>>(
    {},
  );
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const maxRetries = 5;

  const connect = useCallback(() => {
    if (jobIds.length === 0) return;

    const params = new URLSearchParams();
    jobIds.forEach((id) => params.append("jobId", id));
    const url = `/api/translation-status?${params.toString()}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;
    };

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data) as JobProgress;
      setProgressMap((prev) => ({ ...prev, [data.jobId]: data }));
    });

    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data) as JobProgress;
      setProgressMap((prev) => ({ ...prev, [data.jobId]: data }));
      options?.onComplete?.();
    });

    es.addEventListener("error_event", (e) => {
      const data = JSON.parse(e.data) as JobProgress;
      setProgressMap((prev) => ({ ...prev, [data.jobId]: data }));
      options?.onError?.();
    });

    es.onerror = () => {
      es.close();
      setIsConnected(false);
      if (retriesRef.current < maxRetries) {
        retriesRef.current++;
        setTimeout(connect, 2000);
      }
    };
  }, [jobIds.join(","), options?.onComplete, options?.onError]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [connect]);

  return { progressMap, isConnected };
}
