'use client';

import { UserStageProvider } from '@/lib/user-stage-context';

export function UserStageProviderWrapper({ children }: { children: React.ReactNode }) {
  return <UserStageProvider>{children}</UserStageProvider>;
}
