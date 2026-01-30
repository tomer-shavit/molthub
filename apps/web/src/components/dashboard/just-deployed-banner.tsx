"use client";

import { useState, useEffect } from "react";
import { Info } from "lucide-react";

interface JustDeployedBannerProps {
  createdAt: string;
}

const JUST_DEPLOYED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function JustDeployedBanner({ createdAt }: JustDeployedBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    if (elapsed < JUST_DEPLOYED_THRESHOLD_MS) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), JUST_DEPLOYED_THRESHOLD_MS - elapsed);
      return () => clearTimeout(timer);
    }
  }, [createdAt]);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-6">
      <div className="relative flex-shrink-0">
        <Info className="w-5 h-5 text-blue-600" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      </div>
      <p className="text-sm text-blue-800">
        Your bot was just deployed. It may take a moment to become fully healthy and start responding to messages.
      </p>
    </div>
  );
}
