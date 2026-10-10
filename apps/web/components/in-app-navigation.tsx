"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const lastPathKey = "saphra.lastPath";
const previousPathKey = "saphra.previousPath";

/**
 * Remembers the page this tab is on, so a page can tell whether it was
 * reached from inside SaphraONE or opened fresh (say, from a phone camera).
 */
export function InAppNavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const storage = window.sessionStorage;
      const last = storage.getItem(lastPathKey);
      // A reload keeps where this page was entered from.
      if (last === pathname) return;
      if (last) storage.setItem(previousPathKey, last);
      else storage.removeItem(previousPathKey);
      storage.setItem(lastPathKey, pathname);
    } catch {}
  }, [pathname]);
  return null;
}

/**
 * The SaphraONE page this tab was on before `pathname`, or null when the tab
 * opened straight onto it. Works before or after the tracker has run.
 */
export function readPreviousInAppPath(pathname: string) {
  try {
    const storage = window.sessionStorage;
    const last = storage.getItem(lastPathKey);
    if (!last) return null;
    if (last !== pathname) return last;
    return storage.getItem(previousPathKey);
  } catch {
    return null;
  }
}
