"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useOptionalAccount } from "@/components/account/account-provider";
import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
  readSignInEmail,
} from "@/lib/circle-session";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upgradeAccountClient } from "@/lib/account/client";

export function AccountTypeSettings() {
  const t = useT();
  const context = useOptionalAccount();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [circleLogin, setCircleLogin] = useState(() => readCircleLogin());

  // The sign-in method belongs beside the account type: a Google session and a
  // self-custody wallet behave differently, and only one of them has an email.
  useEffect(() => {
    function refresh() {
      setCircleLogin(readCircleLogin());
    }

    refresh();
    window.addEventListener(circleSessionEventName, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(circleSessionEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const identity = getCircleLoginIdentity(circleLogin);
  const signedInWith = circleLogin
    ? identity.email ?? identity.name ?? "Google"
    : null;
  const signInRow = signedInWith ? (
    <p className="mt-2 text-xs text-muted-foreground">
      {t("settings.signedInWith")}{" "}
      <span className="font-semibold text-foreground">{signedInWith}</span>
    </p>
  ) : null;

  if (!context?.account) {
    return <p className="text-sm text-muted-foreground">{t("settings.connectToSeeType")}</p>;
  }

  if (context.isBusiness) {
    return (
      <div>
        <p className="text-sm font-semibold">{t("settings.accountType")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("common.business")}</p>
        {signInRow}
        <p className="mt-3 text-xs text-muted-foreground">
          {t("settings.cannotRevert")}
        </p>
      </div>
    );
  }

  async function upgrade() {
    if (!context?.ownerWallet) return;
    setBusy(true);
    setError(null);
    try {
      await upgradeAccountClient(
        context.ownerWallet,
        // A Google / email sign-in starts the business's contact email.
        { businessName: name, confirmed: true, contactEmail: readSignInEmail() },
      );
      await context.refresh();
      router.push("/business");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upgrade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold">{t("settings.accountType")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("common.personal")}</p>
      {signInRow}
      {!open ? (
        <Button className="mt-4" onClick={() => setOpen(true)} variant="outline">
          {t("settings.upgradeToBusiness")}
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.upgradeBody")}
          </p>
          <Input
            onChange={(event) => setName(event.target.value)}
            placeholder={t("common.businessName")}
            value={name}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
            />
            {t("settings.upgradeConfirm")}
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button disabled={busy || !name.trim() || !confirmed} onClick={() => void upgrade()}>
            {t("settings.upgradeToBusiness")}
          </Button>
        </div>
      )}
    </div>
  );
}
