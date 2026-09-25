// Server-only. Resolves an ALLIE action into something the chat UI can render.
import { isAddress } from "viem";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { officialArcExplorerUrl } from "@/lib/network";

import {
  formatAmountUnits,
  parseAmountUnits,
} from "@/lib/payment-engine/intent";
import { loadAgentWalletConfig } from "@/lib/agent-wallet/config";
import {
  getAgentWalletBalances,
  isAgentWalletConfigured,
} from "@/lib/agent-wallet/client";
import { loadContacts, matchContact } from "@/lib/payment-engine/contacts";
import { loadIntentsForWallet } from "@/lib/payment-engine/ledger";
import { createRecurringPublicClient } from "@/lib/recurring/circle-adapter";
import { arcTokens } from "@/lib/tokens";

import type { AllieAction } from "@/lib/allie/actions";
import { resolveInvoices, resolvePayroll } from "@/lib/allie/business";

export type AllieOutcomeRow = { label: string; value: string };

/**
 * What the chat renders. `payment` is handled by the chat route itself because
 * it carries an intent through the policy engine; everything else resolves here.
 */
export type AllieOutcome =
  | { kind: "message"; text: string }
  | {
      kind: "panel";
      title: string;
      summary?: string;
      rows: AllieOutcomeRow[];
      href?: string;
      cta?: string;
    }
  | {
      kind: "prepare";
      title: string;
      summary: string;
      rows: AllieOutcomeRow[];
      href: string;
      cta: string;
      /** Why ALLIE can't finish it herself. Always shown. */
      handoff: string;
    };

const savingsSummaryTable =
  process.env.SUPABASE_SAVINGS_POCKETS_TABLE ?? "savings_pockets";

function usd(units: bigint | string) {
  const value = typeof units === "bigint" ? units : BigInt(units || "0");
  return `${formatAmountUnits(value)} USDC`;
}

/**
 * An amount with the symbol it is actually denominated in, at two decimals.
 * `usd()` hard-codes USDC, which labels a EURC balance as dollars.
 */
function money(units: bigint | string, symbol: string) {
  const value = typeof units === "bigint" ? units : BigInt(units || "0");
  const [whole, fraction = ""] = formatAmountUnits(value).split(".");
  return `${whole}.${fraction.slice(0, 2).padEnd(2, "0")} ${symbol}`;
}

function isZero(units: bigint | string) {
  try {
    return BigInt(units || "0") === 0n;
  } catch {
    return true;
  }
}

/** With no start time given, a schedule from chat starts this far ahead. */
const defaultRecurringStartMinutes = 30;

/**
 * "2026-09-25T09:00:00+01:00" → "Sep 25, 09:00 (UTC+01:00)". Read straight
 * from the string, keeping the user's own offset: this renders on the server,
 * whose time zone is not the user's.
 */
function scheduleTime(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, , month, day, hour, minute, zone] = match;
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(month) - 1
  ];
  return `${monthName} ${Number(day)}, ${hour}:${minute} (${zone === "Z" ? "UTC" : `UTC${zone}`})`;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }

  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

// ─── Reads ───────────────────────────────────────────────────────────────────

async function readAgentBalances(ownerWallet: string) {
  const config = await loadAgentWalletConfig(ownerWallet);

  if (!config || !isAgentWalletConfigured()) {
    return null;
  }

  try {
    return {
      config,
      balances: await getAgentWalletBalances(config.walletId),
    };
  } catch {
    return { config, balances: null };
  }
}

/**
 * The signed-in wallet's own USDC/EURC, read straight off Arc.
 *
 * "What's my balance?" means every pocket the person thinks of as theirs, not
 * just the one ALLIE spends from. Returns null when the chain cannot be
 * reached, so a failed read is reported rather than shown as a zero.
 */
async function readPersonalBalances(ownerWallet: string) {
  try {
    const client = createRecurringPublicClient();
    const erc20BalanceOf = [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const;

    const [usdc, eurc] = await Promise.all([
      client.readContract({
        abi: erc20BalanceOf,
        address: arcTokens.USDC.address,
        args: [ownerWallet as `0x${string}`],
        functionName: "balanceOf",
      }),
      client.readContract({
        abi: erc20BalanceOf,
        address: arcTokens.EURC.address,
        args: [ownerWallet as `0x${string}`],
        functionName: "balanceOf",
      }),
    ]);

    return { USDC: usdc.toString(), EURC: eurc.toString() };
  } catch {
    return null;
  }
}

async function readSavings(ownerWallet: string) {
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from(savingsSummaryTable)
      .select("name,current_balance_units,currency,status")
      .eq("owner_wallet", ownerWallet.toLowerCase())
      .neq("status", "archived")
      .returns<
        {
          name: string;
          current_balance_units: string | null;
          currency: string | null;
          status: string;
        }[]
      >();

    if (error) {
      return null;
    }

    const pockets = data ?? [];
    const total = pockets.reduce((sum, row) => {
      try {
        return sum + BigInt(row.current_balance_units ?? "0");
      } catch {
        return sum;
      }
    }, 0n);

    return { pockets, total };
  } catch {
    return null;
  }
}

async function readRecentIntents(ownerWallet: string, limit: number) {
  const intents = await loadIntentsForWallet(ownerWallet, { limit: limit + 10 });

  return intents
    .filter((intent) => intent.metadata?.kind !== "allie-per-payment-fee")
    .slice(0, limit);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function resolveAllieAction(
  action: AllieAction,
  ownerWallet: string,
): Promise<AllieOutcome | null> {
  switch (action.type) {
    // Handled by the chat route — they carry a PaymentIntent through policy.
    case "PaymentIntent":
    case "BatchPay":
    case "AgentControl":
      return null;

    case "Clarify":
      return { kind: "message", text: action.question };

    // ── Balance ────────────────────────────────────────────────────────────
    case "QueryBalance": {
      // Both wallets, read in parallel — either may be unavailable on its own.
      const [agent, personal] = await Promise.all([
        readAgentBalances(ownerWallet),
        readPersonalBalances(ownerWallet),
      ]);

      if (!agent && !personal) {
        return {
          kind: "message",
          text: "I couldn't reach either of your wallets just now. Try again in a moment.",
        };
      }

      // One row per wallet in the main asset, so the card reads as two
      // holdings rather than four. EURC earns a row only when there is some —
      // a list of zeroes is noise, and labelling them "USDC" was wrong twice.
      const rows: AllieOutcomeRow[] = [];

      rows.push({
        label: "Your wallet",
        value: personal ? money(personal.USDC, "USDC") : "Unavailable",
      });

      if (agent) {
        rows.push({
          label: "Agent Wallet",
          value: agent.balances
            ? money(agent.balances.USDC, "USDC")
            : "Unavailable",
        });
      }

      if (personal && !isZero(personal.EURC)) {
        rows.push({
          label: "Your wallet · EURC",
          value: money(personal.EURC, "EURC"),
        });
      }

      if (agent?.balances && !isZero(agent.balances.EURC)) {
        rows.push({
          label: "Agent Wallet · EURC",
          value: money(agent.balances.EURC, "EURC"),
        });
      }

      // Combined only when both sides are real numbers — a total that quietly
      // omits an unreachable wallet is worse than no total.
      if (personal && agent?.balances) {
        rows.push({
          label: "Total",
          value: money(
            (BigInt(personal.USDC) + BigInt(agent.balances.USDC)).toString(),
            "USDC",
          ),
        });
      }

      return {
        kind: "panel",
        title: "Your balances",
        summary: agent
          ? undefined
          : "You don't have an Agent Wallet yet — set one up and I can pay on your behalf.",
        rows,
        cta: agent ? "Add funds" : "Set up Agent Wallet",
        href: "/settings#agent-wallet",
      };
    }

    // ── Activity ───────────────────────────────────────────────────────────
    case "ListTransactions": {
      const intents = await readRecentIntents(ownerWallet, action.limit ?? 5);

      if (intents.length === 0) {
        return {
          kind: "message",
          text: "I haven't sent anything from your Agent Wallet yet. Ask me to pay someone and it'll show up here.",
        };
      }

      const explorer = officialArcExplorerUrl();

      return {
        kind: "panel",
        title: "Recent ALLIE payments",
        summary: `Last ${intents.length} from your Agent Wallet.`,
        rows: intents.map((intent) => ({
          label: `${intent.metadata?.recipientLabel ?? intent.recipient} · ${intent.status}`,
          value: usd(intent.amountUnits),
        })),
        cta: explorer ? "Open Arcscan" : undefined,
        href: explorer || undefined,
      };
    }

    // ── Save ───────────────────────────────────────────────────────────────
    case "SaveStatus": {
      const savings = await readSavings(ownerWallet);

      if (!savings || savings.pockets.length === 0) {
        return {
          kind: "panel",
          title: "Swift+Save",
          summary: "No savings pockets yet.",
          rows: [{ label: "Total saved", value: usd(0n) }],
          cta: "Open Save",
          href: "/save",
        };
      }

      return {
        kind: "panel",
        title: "Swift+Save",
        summary: `${savings.pockets.length} active pocket${savings.pockets.length === 1 ? "" : "s"}.`,
        rows: [
          { label: "Total saved", value: usd(savings.total) },
          ...savings.pockets.slice(0, 4).map((pocket) => ({
            label: pocket.name,
            value: money(
            pocket.current_balance_units ?? "0",
            pocket.currency ?? "USDC",
          ),
          })),
        ],
        cta: "Open Save",
        href: "/save",
      };
    }

    case "Save":
      return {
        kind: "prepare",
        title:
          action.action === "deposit" ? "Move money into Save" : "Withdraw from Save",
        summary:
          action.action === "deposit"
            ? "Savings pockets hold your own funds — no yield, no lock unless you set one."
            : "Withdrawing returns the funds to your primary wallet.",
        rows: [
          { label: "Action", value: action.action === "deposit" ? "Deposit" : "Withdraw" },
          {
            label: "Amount",
            value: action.amountUsdc ? `${action.amountUsdc} USDC` : "You choose",
          },
          ...(action.pocket ? [{ label: "Pocket", value: action.pocket }] : []),
        ],
        href: `/save${query({
          amount: action.amountUsdc,
          intent: action.action,
          pocket: action.pocket,
        })}`,
        cta: action.action === "deposit" ? "Open Save to deposit" : "Open Save to withdraw",
        handoff:
          "Save moves funds from your primary wallet, so you sign it — I never hold those keys.",
      };

    // ── Earn ───────────────────────────────────────────────────────────────
    case "EarnStatus":
      return {
        kind: "panel",
        title: "Swift+Earn",
        summary: "Your Earn vault positions live on the Earn page.",
        rows: [{ label: "Vaults", value: "Circle Earn (Morpho) on Arc" }],
        cta: "Open Earn",
        href: "/earn",
      };

    case "Earn":
      return {
        kind: "prepare",
        title: action.action === "deposit" ? "Deposit into Earn" : "Withdraw from Earn",
        summary:
          "Earn deposits mint vault shares against your primary wallet's balance.",
        rows: [
          { label: "Action", value: action.action === "deposit" ? "Deposit" : "Withdraw" },
          {
            label: "Amount",
            value: action.amountUsdc ? `${action.amountUsdc} USDC` : "You choose",
          },
        ],
        href: `/earn${query({ amount: action.amountUsdc, intent: action.action })}`,
        cta: "Open Earn",
        handoff:
          "The vault takes funds from your primary wallet, so this one needs your signature.",
      };

    // ── Swap ───────────────────────────────────────────────────────────────
    case "Swap":
      return {
        kind: "prepare",
        title: `Swap ${action.fromAsset} to ${action.toAsset}`,
        summary: "I've set up the swap — check the quote before you sign it.",
        rows: [
          { label: "From", value: `${action.amountUsdc} ${action.fromAsset}` },
          { label: "To", value: action.toAsset },
        ],
        href: `/swap${query({
          amount: action.amountUsdc,
          from: action.fromAsset,
          to: action.toAsset,
        })}`,
        cta: "Review the quote",
        handoff:
          "Swaps route through your own wallet and need a live quote, so you confirm the rate.",
      };

    // ── Request ────────────────────────────────────────────────────────────
    case "RequestPayment":
      return {
        kind: "prepare",
        title: "Request a payment",
        summary: "I'll generate a link you can send to anyone.",
        rows: [
          {
            label: "Amount",
            value: action.amountUsdc ? `${action.amountUsdc} ${action.asset}` : "Any amount",
          },
          ...(action.from ? [{ label: "From", value: action.from }] : []),
          ...(action.note ? [{ label: "Note", value: action.note }] : []),
        ],
        href: `/pay${query({
          amount: action.amountUsdc,
          from: action.from,
          memo: action.note,
          token: action.asset,
        })}`,
        cta: "Create the request",
        handoff:
          "The request page builds the shareable link against your own username.",
      };

    // ── Recurring ──────────────────────────────────────────────────────────
    case "RecurringStatus": {
      const supabase = createSupabaseAdminClient();
      const table =
        process.env.SUPABASE_RECURRING_SCHEDULES_TABLE ?? "recurring_schedules";

      const { data } = await supabase
        .from(table)
        .select("beneficiary_label,beneficiary_wallet,amount,frequency,status,next_run_at")
        .eq("owner_wallet", ownerWallet.toLowerCase())
        .eq("status", "active")
        .order("next_run_at", { ascending: true })
        .limit(5)
        .returns<
          {
            beneficiary_label: string | null;
            beneficiary_wallet: string;
            amount: string;
            frequency: string;
            status: string;
            next_run_at: string;
          }[]
        >();

      const schedules = data ?? [];

      if (schedules.length === 0) {
        return {
          kind: "panel",
          title: "RecurePay",
          summary: "No active schedules.",
          rows: [],
          cta: "Set one up",
          href: "/recurepay",
        };
      }

      return {
        kind: "panel",
        title: "RecurePay",
        summary: `${schedules.length} active schedule${schedules.length === 1 ? "" : "s"}.`,
        rows: schedules.map((schedule) => ({
          label: `${schedule.beneficiary_label ?? schedule.beneficiary_wallet.slice(0, 10)} · ${schedule.frequency}`,
          value: `${schedule.amount} · next ${schedule.next_run_at.slice(0, 10)}`,
        })),
        cta: "Open RecurePay",
        href: "/recurepay",
      };
    }

    case "Recurring": {
      // RecurePay's form looks up usernames and addresses, not contacts: a
      // saved contact goes over as its wallet, anything else as a username.
      const contact = action.recipient.startsWith("@")
        ? null
        : matchContact(await loadContacts(ownerWallet), action.recipient);
      const payee = contact
        ? contact.wallet
        : isAddress(action.recipient) || action.recipient.startsWith("@")
          ? action.recipient
          : `@${action.recipient}`;

      return {
        kind: "prepare",
        title: "Set up a recurring payment",
        summary: "Everything's filled in — RecurePay just needs your authorization.",
        rows: [
          { label: "To", value: contact ? `${contact.name} (contact)` : payee },
          { label: "Amount", value: `${action.amountUsdc} ${action.asset}` },
          { label: "Every", value: action.frequency },
          {
            label: "Starts",
            value: action.startsAt ? scheduleTime(action.startsAt) : "In 30 minutes",
          },
          ...(action.maxRuns
            ? [{ label: "Payments", value: `${action.maxRuns}, then stops` }]
            : []),
          ...(action.endsAt ? [{ label: "Ends", value: scheduleTime(action.endsAt) }] : []),
          ...(!action.maxRuns && !action.endsAt
            ? [{ label: "Ends", value: "When you cancel" }]
            : []),
        ],
        href: `/recurepay${query({
          amount: action.amountUsdc,
          endsAt: action.endsAt,
          frequency: action.frequency,
          maxRuns: action.maxRuns,
          recipient: payee,
          // Relative, so opening the link later still starts in the future.
          startIn: action.startsAt ? undefined : defaultRecurringStartMinutes,
          startsAt: action.startsAt,
          token: action.asset,
        })}`,
        cta: "Review and authorize",
        handoff:
          "Autopay needs an on-chain authorization from your wallet before it can run unattended.",
      };
    }

    // ── Payroll ────────────────────────────────────────────────────────────
    case "PayrollStatus":
    case "Payroll":
      return resolvePayroll(action, ownerWallet);

    // ── Invoices ───────────────────────────────────────────────────────────
    case "InvoiceStatus":
    case "CreateInvoice":
    case "InvoiceAction":
      return resolveInvoices(action, ownerWallet);

    case "PayInvoice":
      return {
        kind: "prepare",
        title: "Pay an invoice",
        summary:
          action.ref === "last"
            ? "Opening your most recent invoice."
            : `Opening invoice ${action.ref}.`,
        rows: [{ label: "Reference", value: action.ref }],
        href: "/business/invoices",
        cta: "Open Invoices",
        handoff: "Invoice settlement runs through the Invoices hub.",
      };

    default: {
      const exhaustive: never = action;
      void exhaustive;
      return null;
    }
  }
}

export { parseAmountUnits };
