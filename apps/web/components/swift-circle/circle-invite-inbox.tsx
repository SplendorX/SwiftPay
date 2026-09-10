"use client";

import { Loader2, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  getCircleLoginIdentity,
  readCircleLogin,
} from "@/lib/circle-session";
import {
  fetchCircles,
  respondToInvitationClient,
} from "@/lib/swift-circle/client";
import type { CircleInvitationRecord } from "@/lib/swift-circle/types";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import { fetchWalletSessionForAddress } from "@/lib/wallet-auth-client";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function CircleInviteInbox({
  invitations,
  busyId,
  highlightId,
  onAccept,
  onDecline,
  emptyLabel = "No pending invitations.",
}: {
  invitations: CircleInvitationRecord[];
  busyId?: string | null;
  highlightId?: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  emptyLabel?: string;
}) {
  if (invitations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  return (
    <div className="grid gap-3">
      {invitations.map((item) => {
        const highlighted = highlightId === item.id;
        return (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3",
              highlighted
                ? "border-primary bg-primary/5"
                : "border-border",
            )}
            id={`circle-invite-${item.id}`}
            key={item.id}
          >
            <div>
              <p className="font-medium">{item.circle_name ?? "SwiftCircle"}</p>
              <p className="text-xs text-muted-foreground">
                {item.inviter_username
                  ? `Invited by @${item.inviter_username}`
                  : "Circle invitation"}
                {" · expires "}
                {new Date(item.expires_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busyId === item.id}
                onClick={() => onAccept(item.id)}
                size="sm"
              >
                {busyId === item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Accept
              </Button>
              <Button
                disabled={busyId === item.id}
                onClick={() => onDecline(item.id)}
                size="sm"
                variant="outline"
              >
                Decline
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Dashboard / inbox strip so invitees do not have to hunt for SwiftCircle. */
export function DashboardCircleInvites() {
  const { address: wagmiAddress } = useAccount();
  const { address: platformAddress } = usePlatformWallet();
  const ownerWallet = useOptionalWorkspace()?.ownerWallet;
  const address = (ownerWallet ?? platformAddress ?? wagmiAddress)?.toLowerCase() ?? "";
  const social = getCircleLoginIdentity(readCircleLogin())?.socialUserUUID;
  const [invitations, setInvitations] = useState<CircleInvitationRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setInvitations([]);
      return;
    }
    try {
      const session = await fetchWalletSessionForAddress(address);
      if (!session.authenticated && !social) return;
      const result = await fetchCircles(address, social);
      setInvitations(result.inbox);
    } catch {
      setInvitations([]);
    }
  }, [address, social]);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(id: string, action: "accept" | "decline") {
    if (!address) return;
    setBusyId(id);
    try {
      await respondToInvitationClient(id, address, action, social);
      toast.success(action === "accept" ? "You joined the Circle." : "Invitation declined.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  if (!address || invitations.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4" />
        <h2 className="font-heading text-base font-semibold">SwiftCircle invitations</h2>
      </div>
      <CircleInviteInbox
        busyId={busyId}
        invitations={invitations}
        onAccept={(id) => void respond(id, "accept")}
        onDecline={(id) => void respond(id, "decline")}
      />
    </section>
  );
}
