"use client";

import { Loader2, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { useOptionalWorkspace } from "@/components/business/workspace-provider";
import { CircleInviteInbox } from "@/components/swift-circle/circle-invite-inbox";
import { CircleAvatar } from "@/components/swift-circle/circle-visuals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  circleSessionEventName,
  getCircleLoginIdentity,
  readCircleLogin,
} from "@/lib/circle-session";
import {
  createCircleClient,
  fetchCircles,
  respondToInvitationClient,
} from "@/lib/swift-circle/client";
import { formatUsd } from "@/lib/swift-circle/money";
import type {
  CircleInvitationRecord,
  CircleListItem,
  CirclePlatformLimits,
} from "@/lib/swift-circle/types";
import { usePlatformWallet } from "@/lib/use-platform-wallet";
import {
  fetchWalletSessionForAddress,
  signInWalletSession,
  walletSessionChangedEventName,
} from "@/lib/wallet-auth-client";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function SwiftCircleList() {
  const { address: wagmiAddress } = useAccount();
  const { address: platformAddress } = usePlatformWallet();
  const ownerWallet = useOptionalWorkspace()?.ownerWallet;
  const address = (ownerWallet ?? platformAddress ?? wagmiAddress)?.toLowerCase() ?? "";
  const { signMessageAsync, isPending: isSigning } = useSignMessage();

  const [circles, setCircles] = useState<CircleListItem[]>([]);
  const [inbox, setInbox] = useState<CircleInvitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [invites, setInvites] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [limits, setLimits] = useState<CirclePlatformLimits | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const social = getCircleLoginIdentity(readCircleLogin())?.socialUserUUID;

  const load = useCallback(async () => {
    if (!address) {
      setCircles([]);
      setInbox([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await fetchWalletSessionForAddress(address);
      const isAuthed = Boolean(session.authenticated) || Boolean(social);
      setAuthorized(isAuthed);
      if (!isAuthed) {
        setCircles([]);
        setInbox([]);
        return;
      }
      const result = await fetchCircles(address, social);
      setCircles(result.circles);
      setInbox(result.inbox);
      setLimits(result.limits);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [address, social]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) {
      setHighlightId(invite);
      window.requestAnimationFrame(() => {
        document.getElementById(`circle-invite-${invite}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
  }, [inbox]);

  useEffect(() => {
    function refresh() {
      void load();
    }
    window.addEventListener(walletSessionChangedEventName, refresh);
    window.addEventListener(circleSessionEventName, refresh);
    return () => {
      window.removeEventListener(walletSessionChangedEventName, refresh);
      window.removeEventListener(circleSessionEventName, refresh);
    };
  }, [load]);

  async function authorize() {
    if (!address) return;
    setError(null);
    try {
      await signInWalletSession({
        ownerWallet: address,
        signMessage: async (message) => signMessageAsync({ message }),
      });
      setAuthorized(true);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onCreate() {
    if (!address) return;
    setCreating(true);
    setError(null);
    try {
      const inviteUsernames = invites
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      await createCircleClient(
        address,
        { name, description, inviteUsernames },
        social,
      );
      setName("");
      setDescription("");
      setInvites("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function respond(id: string, action: "accept" | "decline") {
    if (!address) return;
    setBusyId(id);
    try {
      await respondToInvitationClient(id, address, action, social);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (!address) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Connect a wallet to open SwiftCircle.
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!authorized ? (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Authorize this wallet to load your Circles and invitations.
          </p>
          <Button className="mt-3" disabled={isSigning} onClick={() => void authorize()}>
            {isSigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Authorize wallet
          </Button>
        </div>
      ) : null}

      {authorized ? (
        <section className="section-panel">
          <div className="relative z-[1]">
          <p className="section-eyebrow">Inbox</p>
          <h2 className="section-title">Invitations</h2>
          <p className="section-copy">
            Accept or decline Circle invites here, from a notification, or from the dashboard inbox.
          </p>
          <div className="mt-3">
            <CircleInviteInbox
              busyId={busyId}
              emptyLabel="No pending invitations."
              highlightId={highlightId}
              invitations={inbox}
              onAccept={(id) => void respond(id, "accept")}
              onDecline={(id) => void respond(id, "decline")}
            />
          </div>
          </div>
        </section>
      ) : null}

      <section className="section-panel">
        <p className="section-eyebrow">Create</p>
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="section-title mt-0">Start a Circle</h2>
        </div>
        <p className="section-copy">
          Private by default. Invite members by SwiftPay username.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            onChange={(event) => setName(event.target.value)}
            placeholder="Circle name"
            value={name}
          />
          <Input
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional description"
            value={description}
          />
          <Input
            className="sm:col-span-2"
            onChange={(event) => setInvites(event.target.value)}
            placeholder="Invite @alice @bob"
            value={invites}
          />
        </div>
        <Button
          className="mt-4"
          disabled={creating || !name.trim() || !authorized}
          onClick={() => void onCreate()}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create Circle
        </Button>
      </section>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Circles…
        </div>
      ) : circles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">No Circles yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {inbox.length > 0
              ? "Accept an invitation above, or create a Circle to get started."
              : "Create a private group to pay, save, and coordinate together."}
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {circles.map((circle) => (
            <Link
              className="sc-list-row"
              href={`/swiftCircle/${circle.id}`}
              key={circle.id}
            >
              <CircleAvatar
                label={circle.name}
                size={48}
                src={circle.image_url}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-heading text-base font-semibold">
                    {circle.name}
                  </h3>
                  <Badge variant="secondary">{circle.role}</Badge>
                  {circle.financial_frozen ? (
                    <Badge variant="destructive">Frozen</Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {circle.member_count} people
                  {circle.pending_requests
                    ? ` · ${circle.pending_requests} requests`
                    : " · Open chat"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-sm font-semibold">
                  {formatUsd(circle.save_balance)}
                </p>
                <p className="text-[11px] text-muted-foreground">Circle Save</p>
                {circle.unread_count ? (
                  <span className="sc-unread mt-1 inline-flex">
                    {circle.unread_count}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
