"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileDetail } from "@/components/profiles/profile-detail";
import { api, type Profile, type Fleet, type UpdateProfilePayload } from "@/lib/api";

interface ProfileDetailWrapperProps {
  profile: Profile;
  fleets: Fleet[];
}

export function ProfileDetailWrapper({ profile, fleets }: ProfileDetailWrapperProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      await api.deleteProfile(profile.id);
      router.push("/profiles");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete profile");
    }
  };

  const handleUpdate = async (data: UpdateProfilePayload) => {
    try {
      await api.updateProfile(profile.id, data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <ProfileDetail
        profile={profile}
        fleets={fleets}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
