"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useBusinessActor } from "@/components/business/use-business-actor";
import {
  fetchOnboardingState,
  switchWorkspaceClient,
} from "@/lib/business/client";
import type {
  WorkspaceInvitationRecord,
  WorkspaceSummary,
} from "@/lib/business/types";
import type { OnboardingProfile } from "@/lib/business/service";
import { applyAppLocale } from "@/lib/locales";
import { ensureProfile } from "@/lib/profile";

const storageKey = "swiftpay.activeWorkspaceId";

type WorkspaceContextValue = {
  actorReady: boolean;
  circleSocialUuid?: string;
  invitations: WorkspaceInvitationRecord[];
  loading: boolean;
  ownerWallet: string | null;
  profile: OnboardingProfile | null;
  refresh: () => Promise<void>;
  setWorkspace: (workspaceId: string) => Promise<void>;
  workspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationRecord[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ownerWallet) {
      setProfile(null);
      setWorkspaces([]);
      setInvitations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await ensureProfile({
        authProvider: circleSocialUuid ? "google" : "external",
        circleSocialUuid,
        walletAddress: ownerWallet,
      }).catch(() => undefined);

      const state = await fetchOnboardingState(ownerWallet, circleSocialUuid);
      setProfile(state.profile);
      setWorkspaces(state.workspaces);
      setInvitations(state.invitations);

      if (state.profile?.locale) {
        applyAppLocale(state.profile.locale);
      }

      const stored =
        typeof window === "undefined" ? null : localStorage.getItem(storageKey);
      const nextId =
        (stored && state.workspaces.some((item) => item.id === stored)
          ? stored
          : null) ??
        state.profile?.default_workspace_id ??
        state.workspaces[0]?.id ??
        null;
      setWorkspaceId(nextId);
    } catch {
      setProfile(null);
      setWorkspaces([]);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }, [circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setWorkspace = useCallback(
    async (nextId: string) => {
      if (!ownerWallet) return;
      const next = await switchWorkspaceClient(
        ownerWallet,
        nextId,
        circleSocialUuid,
      );
      localStorage.setItem(storageKey, next.workspace.id);
      setWorkspaceId(next.workspace.id);
      setWorkspaces((current) => {
        if (current.some((item) => item.id === next.workspace.id)) {
          return current.map((item) =>
            item.id === next.workspace.id ? next.workspace : item,
          );
        }
        return [...current, next.workspace];
      });
    },
    [circleSocialUuid, ownerWallet],
  );

  const workspace =
    workspaces.find((item) => item.id === workspaceId) ?? workspaces[0] ?? null;

  const value = useMemo(
    () => ({
      actorReady: Boolean(ownerWallet),
      circleSocialUuid,
      invitations,
      loading,
      ownerWallet,
      profile,
      refresh,
      setWorkspace,
      workspace,
      workspaces,
    }),
    [
      circleSocialUuid,
      invitations,
      loading,
      ownerWallet,
      profile,
      refresh,
      setWorkspace,
      workspace,
      workspaces,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return value;
}

export function useOptionalWorkspace() {
  return useContext(WorkspaceContext);
}

export function OnboardingRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useOptionalWorkspace();

  useEffect(() => {
    if (!context || context.loading || !context.ownerWallet) return;
    if (pathname.startsWith("/onboarding")) return;
    if (context.profile && !context.profile.account_type_selected) {
      router.replace("/onboarding");
    }
  }, [context, pathname, router]);

  return null;
}
