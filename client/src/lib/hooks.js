import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Load data on mount / when deps change.
 * const { data, loading, error, reload, setData } = useApi(() => api.get('/patients'), [page]);
 */
export function useApi(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const callId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === callId.current) setData(result);
    } catch (e) {
      if (id === callId.current) setError(e);
    } finally {
      if (id === callId.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);

  return { data, loading, error, reload, setData };
}

/** Debounce a fast-changing value (e.g. a search box) */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
