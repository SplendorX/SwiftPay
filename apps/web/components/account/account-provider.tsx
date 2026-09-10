"use client";

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
import { fetchAccountState } from "@/lib/account/client";
import type { AccountRecord, BusinessAccountProfile } from "@/lib/account/types";

type AccountContextValue = {
  account: AccountRecord | null;
  isBusiness: boolean;
  loading: boolean;
  ownerWallet: string | null;
  profile: BusinessAccountProfile | null;
  refresh: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { circleSocialUuid, ownerWallet } = useBusinessActor();
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [profile, setProfile] = useState<BusinessAccountProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!ownerWallet) {
      setAccount(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await fetchAccountState(ownerWallet, circleSocialUuid);
      setAccount(state.account);
      setProfile(state.profile);
    } catch {
      setAccount(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [circleSocialUuid, ownerWallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      account,
      isBusiness: account?.account_type === "BUSINESS",
      loading,
      ownerWallet,
      profile,
      refresh,
    }),
    [account, loading, ownerWallet, profile, refresh],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccountContext() {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error("useAccountContext must be used inside AccountProvider.");
  }
  return value;
}

export function useOptionalAccount() {
  return useContext(AccountContext);
}
