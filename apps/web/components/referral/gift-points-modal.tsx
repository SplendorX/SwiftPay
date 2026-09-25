"use client";

import { Gift, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { giftSwiftPointsRequest } from "@/lib/referral/points-client";
import { emitSwiftPointsUpdated } from "@/lib/referral/use-swiftpoints";
import { useResolvedRecipient } from "@/lib/use-resolved-recipient";
import { RecipientSpinner, RecipientStatus } from "@/components/recipient-status";

const MINIMUM_GIFT = 10;

interface GiftPointsModalProps {
  availablePoints: number;
  circleSocialUuid?: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  userWallet: string;
}

export function GiftPointsModal({
  availablePoints,
  circleSocialUuid,
  onSuccess,
  trigger,
  userWallet,
}: GiftPointsModalProps) {
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState("50");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  // Accepts a wallet address or an @username, resolved the same way the send
  // flow resolves a payee.
  const resolved = useResolvedRecipient(recipient);
  const points = parseInt(amountStr, 10) || 0;
  const usdcValue = (points * 0.01).toFixed(2);
  const selfGift = Boolean(
    resolved.resolvedAddress &&
      resolved.resolvedAddress.toLowerCase() === userWallet.toLowerCase(),
  );

  const canSend =
    points >= MINIMUM_GIFT &&
    points <= availablePoints &&
    resolved.isValid &&
    !selfGift &&
    !loading;

  async function handleGift() {
    if (!canSend || !resolved.resolvedAddress) return;
    setLoading(true);
    try {
      await giftSwiftPointsRequest({
        circleSocialUuid,
        note: note.trim() || undefined,
        points,
        recipientWallet: resolved.resolvedAddress,
        walletAddress: userWallet,
      });

      toast.success(`Sent ${points} SwiftPoints`, {
        description: `${resolved.displayLabel} received them.`,
      });
      emitSwiftPointsUpdated();
      setOpen(false);
      setRecipient("");
      setNote("");
      onSuccess?.();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not send the gift.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <Gift className="h-4 w-4" />
            Gift points
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gift SwiftPoints</DialogTitle>
          <DialogDescription>
            Send points to another SwiftPay user by username or wallet. They
            can redeem them for USDC or unlock premium features.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Recipient</span>
            <div className="relative">
              <Input
                aria-describedby="gift-recipient-status"
                autoComplete="off"
                className="pr-9"
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="@username or 0x address"
                spellCheck={false}
                value={recipient}
              />
              <RecipientSpinner resolution={resolved} />
            </div>
            {selfGift && !resolved.isResolving ? (
              <span className="text-xs text-destructive" id="gift-recipient-status">
                You cannot gift points to yourself.
              </span>
            ) : (
              <RecipientStatus id="gift-recipient-status" resolution={resolved} />
            )}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">Points</span>
            <Input
              inputMode="numeric"
              onChange={(event) => setAmountStr(event.target.value)}
              value={amountStr}
            />
            <span className="text-xs text-muted-foreground">
              Worth ${usdcValue} · you have {availablePoints} available ·
              minimum {MINIMUM_GIFT}
            </span>
            {points > availablePoints ? (
              <span className="text-xs text-destructive">
                That is more than your balance.
              </span>
            ) : null}
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Thanks for the help"
              value={note}
            />
          </label>

          <Button
            className="h-11 w-full"
            disabled={!canSend}
            onClick={() => void handleGift()}
            type="button"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send {points > 0 ? points : ""} points
          </Button>

          <p className="text-xs text-muted-foreground">
            Gifts are final. Points move instantly and cannot be recalled.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
