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

type SidebarContextValue = {
  collapsed: boolean;
  retracted: boolean;
  toggleCollapsed: () => void;
  toggleRetracted: () => void;
};

const collapsedKey = "swiftpay.sidebar.collapsed";
const retractedKey = "swiftpay.sidebar.retracted";

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [retracted, setRetracted] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapsedKey) === "1");
      setRetracted(localStorage.getItem(retractedKey) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(collapsedKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleRetracted = useCallback(() => {
    setRetracted((current) => {
      const next = !current;
      try {
        localStorage.setItem(retractedKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      collapsed,
      retracted,
      toggleCollapsed,
      toggleRetracted,
    }),
    [collapsed, retracted, toggleCollapsed, toggleRetracted],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }

  return context;
}