"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface UseBumpBarOptions {
  enabled?: boolean;
  ticketCount: number;
  onBumpTicket?: (ticketIndex: number) => void;
  onRecallLast?: () => void;
}

export function useBumpBar({
  enabled = true,
  ticketCount,
  onBumpTicket,
  onRecallLast
}: UseBumpBarOptions) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const onBumpRef = useRef(onBumpTicket);
  const onRecallRef = useRef(onRecallLast);
  const ticketCountRef = useRef(ticketCount);
  const selectedIndexRef = useRef(selectedIndex);

  useEffect(() => {
    onBumpRef.current = onBumpTicket;
  }, [onBumpTicket]);

  useEffect(() => {
    onRecallRef.current = onRecallLast;
  }, [onRecallLast]);

  useEffect(() => {
    ticketCountRef.current = ticketCount;
  }, [ticketCount]);

  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore input events when user is typing in form inputs
    const target = e.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    const key = e.key.toUpperCase();

    // 1. Numeric Key 1-8: Select ticket slot
    if (/^[1-8]$/.test(key)) {
      const idx = parseInt(key, 10) - 1;
      if (idx < ticketCountRef.current) {
        setSelectedIndex(idx);
      }
      return;
    }

    // 2. Enter / Space / 'B': Bump selected ticket or first ticket
    if (key === "ENTER" || key === " " || key === "B") {
      e.preventDefault();
      const targetIdx = selectedIndexRef.current !== null ? selectedIndexRef.current : 0;
      if (targetIdx < ticketCountRef.current && onBumpRef.current) {
        onBumpRef.current(targetIdx);
        setSelectedIndex(null);
      }
      return;
    }

    // 3. 'R': Recall last bumped ticket
    if (key === "R") {
      e.preventDefault();
      if (onRecallRef.current) {
        onRecallRef.current();
      }
      return;
    }

    // 4. Escape: Clear selection
    if (key === "ESCAPE") {
      setSelectedIndex(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [enabled, handleKeyDown]);

  return {
    selectedIndex,
    setSelectedIndex
  };
}
