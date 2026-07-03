import { useEffect, useRef, useState } from "react";

export function useLocalDraft(key: string, initialValue = "") {
  const [value, setValue] = useState(initialValue);
  const skipNextWrite = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    skipNextWrite.current = true;
    setValue(localStorage.getItem(key) ?? initialValue);
  }, [initialValue, key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const next = value.trim() ? value : "";
    if (next) {
      localStorage.setItem(key, next);
    } else {
      localStorage.removeItem(key);
    }
  }, [key, value]);

  function clear() {
    setValue("");
    if (typeof window !== "undefined") localStorage.removeItem(key);
  }

  return [value, setValue, clear] as const;
}
