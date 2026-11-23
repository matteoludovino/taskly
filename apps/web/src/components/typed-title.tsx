"use client";

import { useEffect, useState } from "react";

const TEXT = "Taskly.";

/**
 * The title typed out letter by letter with a blinking cursor, as on the original Taskly. Screen readers
 * get the plain name; with reduced motion the whole word shows at once (CSS swaps the two).
 */
export function TypedTitle() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const type = (count: number) => {
      setShown(count);
      if (count < TEXT.length) timer = setTimeout(() => type(count + 1), 170);
    };
    timer = setTimeout(() => type(1), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <h1 aria-label="Taskly" className="typed-title text-4xl font-semibold tracking-tight sm:text-5xl">
      <span aria-hidden className="typed-title__typing">
        {TEXT.slice(0, shown)}
      </span>
      <span aria-hidden className="typed-title__static">
        {TEXT}
      </span>
      <span aria-hidden className="typed-title__cursor" />
    </h1>
  );
}
