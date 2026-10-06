"use client";

import { useEffect, useState } from "react";

import { BeneficiaryContacts } from "@/components/dashboard/beneficiary-contacts";
import { Sheet, SheetContent, SheetDescription, SheetGrabber, SheetTitle } from "@/components/ui/sheet";
import {
  deleteBeneficiary,
  fetchBeneficiaries,
  updateBeneficiary,
  type BeneficiaryAuth,
  type BeneficiaryRecord,
} from "@/lib/beneficiaries";
import { bottomSheetClassName, useSheetSide } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

function shortenAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
}

/**
 * "Choose beneficiary": the saved contacts from Send, as a sheet. Loads the
 * list each time it opens, so contacts saved elsewhere show up.
 */
export function BeneficiaryPickerSheet({
  auth,
  onClose,
  onSelect,
  open,
}: {
  auth: BeneficiaryAuth | null;
  onClose: () => void;
  onSelect: (beneficiary: BeneficiaryRecord) => void;
  open: boolean;
}) {
  const side = useSheetSide();
  const [contacts, setContacts] = useState<BeneficiaryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const ownerWallet = auth?.ownerWallet;
  const circleSocialUuid = auth?.circleSocialUuid;

  useEffect(() => {
    if (!open || !ownerWallet) return;
    let cancelled = false;
    setIsLoading(true);
    fetchBeneficiaries({ circleSocialUuid, ownerWallet })
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [circleSocialUuid, open, ownerWallet]);

  const sameWallet = (first: string, second: string) => first.toLowerCase() === second.toLowerCase();

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent
        className={cn("gap-0 p-0", side === "bottom" ? bottomSheetClassName : "w-full sm:max-w-md")}
        showCloseButton={false}
        side={side}
      >
        {side === "bottom" ? <SheetGrabber /> : null}
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6">
          <SheetTitle className="text-center text-lg font-bold">Choose beneficiary</SheetTitle>
          <SheetDescription className="sr-only">Your saved people</SheetDescription>
          {!auth ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Connect a wallet to see your beneficiaries.</p>
          ) : (
            <BeneficiaryContacts
              isLoading={isLoading && contacts.length === 0}
              onDelete={async (beneficiary) => {
                await deleteBeneficiary(auth, beneficiary.beneficiary_wallet);
                setContacts((current) =>
                  current.filter((item) => !sameWallet(item.beneficiary_wallet, beneficiary.beneficiary_wallet)),
                );
              }}
              onSelect={(beneficiary) => {
                onSelect(beneficiary);
                onClose();
              }}
              onUpdate={async (beneficiary, edit) => {
                const saved = await updateBeneficiary(auth, {
                  beneficiaryWallet: beneficiary.beneficiary_wallet,
                  name: edit.name,
                  newBeneficiaryWallet: edit.wallet,
                });
                setContacts((current) =>
                  current
                    .map((item) =>
                      sameWallet(item.beneficiary_wallet, beneficiary.beneficiary_wallet)
                        ? { ...saved, username: edit.username }
                        : item,
                    )
                    .sort((first, second) => first.name.localeCompare(second.name)),
                );
              }}
              savedBeneficiaries={contacts}
              shortenAddress={shortenAddress}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
