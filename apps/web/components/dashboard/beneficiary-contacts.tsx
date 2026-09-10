"use client";

import { Loader2, Search, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { type BeneficiaryRecord } from "@/lib/beneficiaries";
import { formatUsernameLabel } from "@/lib/profile";

export function BeneficiaryContacts({
  isLoading,
  onSelect,
  savedBeneficiaries,
  selectedWallet,
  shortenAddress,
}: {
  isLoading: boolean;
  onSelect: (beneficiary: BeneficiaryRecord) => void;
  savedBeneficiaries: BeneficiaryRecord[];
  selectedWallet?: string;
  shortenAddress: (value?: string) => string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return savedBeneficiaries;
    }

    return savedBeneficiaries.filter((beneficiary) => {
      const username = beneficiary.username?.toLowerCase() ?? "";
      return (
        beneficiary.name.toLowerCase().includes(needle) ||
        beneficiary.beneficiary_wallet.toLowerCase().includes(needle) ||
        username.includes(needle.replace(/^@/, ""))
      );
    });
  }, [query, savedBeneficiaries]);

  return (
    <section className="pay-contacts glass-panel min-w-0 self-start p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-eyebrow">Contacts</p>
          <h2 className="mt-1 font-heading text-lg font-semibold tracking-tight">
            Beneficiaries
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Saved names with username or wallet. Pick one to fill Pay.
          </p>
        </div>
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] border border-border bg-primary/8 text-primary">
          <Users className="h-4 w-4" />
        </div>
      </div>

      <label className="field-shell mb-3 flex h-10 items-center gap-2 px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Search contacts"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, @username, or wallet"
          value={query}
        />
      </label>

      {isLoading ? (
        <div className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading contacts…
        </div>
      ) : savedBeneficiaries.length === 0 ? (
        <div className="rounded-[1.1rem] border border-dashed border-border bg-muted/30 px-3 py-6 text-center">
          <UserRound className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No contacts yet</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Name a recipient in Pay and save them here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">
          No contacts match “{query.trim()}”.
        </p>
      ) : (
        <div className="pay-contacts-list">
          {filtered.map((beneficiary) => {
            const selected =
              selectedWallet?.toLowerCase() ===
              beneficiary.beneficiary_wallet.toLowerCase();
            const handle = beneficiary.username
              ? formatUsernameLabel(beneficiary.username)
              : shortenAddress(beneficiary.beneficiary_wallet);

            return (
              <button
                className="pay-contact-row"
                data-selected={selected ? "true" : "false"}
                key={`${beneficiary.owner_wallet}-${beneficiary.beneficiary_wallet}`}
                onClick={() => onSelect(beneficiary)}
                type="button"
              >
                <span className="pay-contact-avatar" aria-hidden="true">
                  {initials(beneficiary.name)}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {beneficiary.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {handle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
