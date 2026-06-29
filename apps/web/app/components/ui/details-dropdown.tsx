"use client";

import { useEffect, useRef, type DetailsHTMLAttributes } from "react";

type DetailsDropdownProps = DetailsHTMLAttributes<HTMLDetailsElement>;

export function DetailsDropdown({ children, ...props }: DetailsDropdownProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function closeOnOutsidePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open) return;
      if (event.target instanceof Node && details.contains(event.target)) return;
      details.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const details = detailsRef.current;
      if (!details?.open) return;
      details.open = false;
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} {...props}>
      {children}
    </details>
  );
}
