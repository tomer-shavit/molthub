"use client";

import { useState, useEffect, useRef } from "react";
import { api, type BotInstance } from "@/lib/api";

const POLL_INTERVAL_MS = 15_000;

/**
 * Polls the bot instance API every 15 seconds to keep the bot detail
 * page data fresh (health, status, uptime, gateway info, etc.).
 */
export function useBotPolling(initialBot: BotInstance): BotInstance {
  const [bot, setBot] = useState<BotInstance>(initialBot);
  const idRef = useRef(initialBot.id);

  // Update if the initial bot changes (e.g. navigation)
  useEffect(() => {
    if (initialBot.id !== idRef.current) {
      idRef.current = initialBot.id;
      setBot(initialBot);
    }
  }, [initialBot]);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const updated = await api.getBotInstance(idRef.current);
        if (mounted) setBot(updated);
      } catch {
        // polling failure — keep stale data
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return bot;
}
