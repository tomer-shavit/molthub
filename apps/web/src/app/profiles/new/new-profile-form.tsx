"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileForm } from "@/components/profiles/profile-form";
import { api, type Fleet, type CreateProfilePayload, type UpdateProfilePayload } from "@/lib/api";

interface NewProfileFormProps {
  fleets: Fleet[];
}

export function NewProfileForm({ fleets }: NewProfileFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: CreateProfilePayload | UpdateProfilePayload) => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await api.createProfile(data as CreateProfilePayload);
      router.push(`/profiles/${profile.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ProfileForm
        fleets={fleets}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  );
}
