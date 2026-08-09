import { useEffect, useRef, useState } from 'react';

// Subscribes to the backend's Server-Sent Events stream for live bandwidth /
// connection updates, keeping a rolling window of points for charts.
export default function useTrafficStream(maxPoints = 60) {
  const [points, setPoints] = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    const es = new EventSource('/api/stats/stream', { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (evt) => {
      try {
        const point = JSON.parse(evt.data);
        setPoints((prev) => {
          const next = [...prev, point];
          if (next.length > maxPoints) next.shift();
          return next;
        });
      } catch (_) {
        /* ignore malformed events */
      }
    };

    return () => es.close();
  }, [maxPoints]);

  return { points, connected };
}
