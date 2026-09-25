import type {
  AllieAction,
  AllieInvoiceAction,
  AllieInvoiceFilter,
  AllieMemberType,
  AlliePayrollFrequency,
} from "@/lib/allie/actions";

/**
 * Tier 1 for the Business products — Payroll and the invoices a business
 * issues. Same contract as the rest of Tier 1: a confident read, or nothing.
 *
 * Returns the action; `null` when the message isn't about payroll or
 * invoices; `false` when it clearly is but Tier 1 can't read all of it (a
 * yearly salary, a due date it doesn't know) — that must escalate rather than
 * fall through to a payment pattern.
 */
export type BusinessRead = AllieAction | null | false;

// ── Shared pieces ───────────────────────────────────────────────────────────

// "$5,000", "1200 usdc", "5k", "2.5k eurc". Group 1 number, 2 "k", 3 asset.
const amountSource = String.raw`(?:^|[\s(])\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k)?\s*(usdc|eurc|usd|dollars?|euros?)?(?=$|[\s,.;:!?)])`;
const moneyPattern = new RegExp(amountSource, "gi");

type Money = { amount: number; asset?: "USDC" | "EURC"; index: number; end: number };

function readMoney(text: string): Money[] {
  const found: Money[] = [];
  for (const match of text.matchAll(moneyPattern)) {
    const amount = Number.parseFloat(match[1].replace(/,/g, "")) * (match[2] ? 1000 : 1);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const unit = match[3]?.toLowerCase();
    found.push({
      amount: Math.round(amount * 100) / 100,
      asset: unit ? (unit.startsWith("eur") ? "EURC" : "USDC") : undefined,
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return found;
}

const usernamePattern = /(?:^|[\s(,])(@[a-zA-Z0-9_.-]{2,32})\b/;
const walletPattern = /\b(0x[a-fA-F0-9]{40})\b/;
const emailPattern = /\b([\w.+-]+@[\w-]+(?:\.[\w-]+)+)\b/;

/** Words that end a name: "invoice Acme Corp for 500" → "Acme Corp". */
const nameStop = new Set([
  "a", "an", "the", "my", "our", "your", "their", "his", "her", "this", "that",
  "for", "to", "due", "of", "at", "with", "by", "and", "net", "on", "in", "as",
  "from", "about", "paid", "earning", "making", "salary", "per", "each", "every",
  "monthly", "weekly", "biweekly", "fortnightly", "usdc", "eurc", "usd", "invoice",
  "payroll", "team", "please", "now", "today", "tomorrow", "who", "is", "was",
  "me", "us", "them", "him", "it", "new", "customer", "client", "company",
  "employee", "contractor", "freelancer", "staff", "member", "months", "month",
  "weeks", "week", "days", "day", "a", "reminder", "yet", "invoices",
]);

/**
 * Up to four words from `start`, stopping at a connective or a number:
 * "Globex Corporation for 2,500" → "Globex Corporation".
 */
function readName(text: string, start: number) {
  const words: string[] = [];
  const tokens = text.slice(start).trim().split(/\s+/);
  for (const raw of tokens) {
    const word = raw.replace(/^[("']+/, "");
    const bare = word.replace(/[,.;:!?)"']+$/, "");
    if (!bare || !/^[A-Za-z][\w&'.-]*$/.test(bare) || nameStop.has(bare.toLowerCase())) break;
    words.push(bare);
    if (words.length === 4 || bare !== word) break; // punctuation ends it
  }
  return words.length > 0 ? words.join(" ") : undefined;
}

// ── Payroll ─────────────────────────────────────────────────────────────────

const teamNoun = String.raw`(?:team|staff|employees|workers|contractors|freelancers|salaries|wages|people|crew|everyone(?:\s+on\s+payroll)?)`;
const genericGroupWords = new Set([
  "my", "our", "the", "whole", "entire", "all", "full", "every", "payroll",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "this", "next", "last",
  "month", "monthly", "weekly", "everyone", "staff", "team", "employees",
  "contractors", "freelancers", "salaries", "wages",
]);

const payrollRunPatterns = [
  // "run payroll", "start this month's payroll", "kick off payroll for design"
  /\b(?:run|start|process|do|execute|kick\s+off|launch|begin|create|prepare|trigger|initiate)\s+(?:(?:the|a|an|this|next|my|our|today'?s|this\s+month'?s|new)\s+)*payroll(?:\s+run)?\b/i,
  // "new payroll run", "payroll run for september"
  /\b(?:new\s+payroll(?:\s+run)?|payroll\s+run\s+(?:for|now))\b/i,
  // "pay the team", "pay all our contractors", "pay the engineering team"
  new RegExp(String.raw`\bpay\s+(?:(?:the|my|our|all|everyone|whole|entire)\s+)*(?:([a-z][\w-]*)\s+)?${teamNoun}\b`, "i"),
  // "send out salaries", "release this month's wages", "disburse salaries"
  /\b(?:send|process|release|disburse|pay\s+out|run)\s+(?:out\s+)?(?:(?:the|this\s+month'?s|our|my|all)\s+)*(?:salaries|wages|paychecks|salary\s+payments)\b/i,
];

// "run payroll for the design team", "payroll for engineering"
const payrollGroupPattern =
  /\bpayroll(?:\s+run)?\s+for\s+(?:the\s+)?([a-z][\w-]*)(?:\s+(?:team|group|department|dept))?\b/i;
// "pay the engineering team" — the word before the team noun.
const payGroupPattern = new RegExp(
  String.raw`\bpay\s+(?:(?:the|my|our|all)\s+)*([a-z][\w-]*)\s+(?:team|group|department|dept|squad)\b`,
  "i",
);

const payrollApprovePattern =
  /\b(?:approve|sign\s+off(?:\s+on)?|authori[sz]e|green[-\s]?light|okay|ok)\s+(?:[\w']+\s+){0,4}?(?:payroll|pay\s*run|salary\s+run|salaries|wages)\b/i;

const payrollRetryPattern =
  /\b(?:retry|re-?run|re-?send|re-?try|redo|fix|re-?process)\b[^.?!]*\b(?:fail(?:ed|ing)?|payroll|salar(?:y|ies)|payouts?|wages)\b/i;
const failedPayoutPattern = /\bfail(?:ed|ing)?\s+(?:payroll|salar(?:y|ies)|payouts?|wages)\b/i;

const payrollSchedulePattern =
  /\b(?:payroll\s+(?:schedules?|calendar|dates?|days?)|schedule\s+(?:(?:the|my|our)\s+)?payroll|automate\s+(?:(?:the|my|our)\s+)?payroll|(?:set\s+up|create|make)\s+(?:an?\s+)?(?:weekly|biweekly|bi-weekly|fortnightly|monthly|recurring|automatic|auto)\s+payroll|(?:pause|resume|change|edit|move|update)\s+(?:(?:the|my|our)\s+)?payroll\s+(?:schedule|date|day)|payroll\s+on\s+autopilot|recurring\s+payroll)\b|\bpayroll\b.*\b(?:automatic(?:ally)?|auto-?run|on\s+(?:its\s+own|a\s+schedule)|on\s+the\s+(?:last|first|\d{1,2}(?:st|nd|rd|th)?)\b)|\bautomatic(?:ally)?\b.*\bpayroll\b/i;

const payrollGroupsPattern =
  /\b(?:payroll\s+groups?|(?:create|make|add|new|set\s+up)\s+(?:an?\s+)?(?:new\s+)?(?:payroll\s+)?group|departments?\s+(?:on|in|for)\s+payroll|group\s+(?:my|our|the)\s+(?:team|staff|employees))\b/i;

const payrollTeamPatterns = [
  /\bwho(?:'s|\s+is|\s+are)?\s+on\s+(?:(?:the|my|our)\s+)?payroll\b/i,
  /\bhow\s+many\s+(?:employees|staff|contractors|freelancers|people|team\s+members|workers)\b/i,
  /\b(?:list|show|see|view|display)\s+(?:me\s+)?(?:all\s+)?(?:(?:my|our|the)\s+)?(?:employees|staff|contractors|freelancers|team\s+members|workers|payroll\s+team|team)\b/i,
  /\b(?:payroll\s+team|my\s+team|our\s+team|headcount|team\s+roster|staff\s+list)\b/i,
  // "a rundown of everyone on the payroll" (paying them matched as a run first)
  /\b(?:everyone|everybody|all\s+(?:the\s+)?people|anyone)\s+on\s+(?:(?:the|our|my)\s+)?payroll\b/i,
];

const payrollStatusPatterns = [
  /\bwhen(?:'s|\s+is|\s+will\s+be)\s+(?:(?:the|our|my)\s+)?(?:next\s+)?(?:payroll|payday|pay\s*day|salary\s+day)\b/i,
  /\bwhen\s+(?:do|will|does|are)\s+(?:we|i|the\s+team|(?:the\s+|our\s+)?(?:staff|employees|contractors))\s+(?:get\s+)?(?:pay|paid|be\s+paid)\b/i,
  /\b(?:did|has|have)\s+(?:(?:the|last|this\s+month'?s|our|my)\s+)*(?:payroll|salaries|wages)\s+(?:go(?:ne)?\s+through|run|ran|complete|completed|succeed|succeeded|finish|finished|fail|failed|process|processed|land|landed|clear|cleared|been\s+paid)/i,
  /\b(?:last|next|upcoming|pending|previous|recent|latest)\s+payroll(?:s|\s+runs?)?\b/i,
  /\bpayroll\s+(?:status|history|summary|overview|report|update|runs?)\b/i,
  /\bhow\s+much\s+(?:is|was|did|will|do|does)\s+(?:(?:the|our|my|we)\s+)?(?:last\s+|next\s+|this\s+month'?s\s+)?(?:payroll|salar(?:y|ies)|wages|spend\s+on\s+(?:payroll|salaries))/i,
  /\b(?:payroll|salar(?:y|ies))\s+(?:awaiting|waiting|pending|needing|needs)\s+(?:my\s+)?approval\b/i,
  /\bwhy\s+did\s+(?:the\s+)?payroll\s+fail\b/i,
  /\bpayroll\b/i,
];

// "add jane doe to payroll", "hire @mike as a contractor", "onboard a new employee"
const addMemberTrigger =
  /\b(?:add|onboard|hire|enrol+|register|put|include)\b/i;
const addMemberContext =
  /\b(?:payroll|employee|contractor|freelancer|consultant|team\s+member|staff(?:\s+member)?|to\s+(?:the\s+|my\s+|our\s+)?team)\b/i;
const addMemberName =
  /\b(?:add|onboard|hire|enrol+|register|put|include)\s+(?:(?:a|an|new|our|my|the|another)\s+)*(?:(?:employee|staff(?:\s+member)?|team\s+member|contractor|freelancer|consultant|worker|hire)\s*,?\s+)?(?:(?:named|called)\s+)?/i;

function readMemberType(text: string): AllieMemberType | undefined {
  if (/\b(?:contractors?|freelancers?|consultants?)\b/i.test(text)) return "CONTRACTOR";
  if (/\b(?:employees?|staff|full[-\s]?time|part[-\s]?time)\b/i.test(text)) return "EMPLOYEE";
  return undefined;
}

function readPayFrequency(text: string): AlliePayrollFrequency | null | undefined {
  if (/\b(?:biweekly|bi-weekly|fortnightly|every\s+(?:two|2|other)\s+weeks?|every\s+fortnight)\b/i.test(text)) {
    return "biweekly";
  }
  if (/\b(?:weekly|a\s+week|per\s+week|each\s+week|every\s+week|\/\s*(?:wk|week))\b/i.test(text)) {
    return "weekly";
  }
  if (/\b(?:monthly|a\s+month|per\s+month|each\s+month|every\s+month|\/\s*(?:mo|month))\b/i.test(text)) {
    return "monthly";
  }
  // Daily and hourly rates depend on hours worked — escalate, don't guess.
  if (/\b(?:daily|a\s+day|per\s+day|hourly|an\s+hour|per\s+hour|\/\s*(?:hr|hour|day))\b/i.test(text)) {
    return null;
  }
  return undefined;
}

/** "60k a year": payroll has no yearly cycle, so it's paid monthly. */
const yearlyPattern = /\b(?:yearly|annually|a\s+year|per\s+year|per\s+annum|p\.a\.?|annual(?:\s+salary)?|\/\s*(?:yr|year))\b/i;

function readAddMember(text: string): BusinessRead {
  if (!addMemberTrigger.test(text) || !addMemberContext.test(text)) return null;
  // "add money to the team pot", "add 50 to savings" aren't hires.
  if (/\b(?:group|schedule|savings?|pocket|vault|pot|funds?|budget|balance|money)\b/i.test(text)) return null;

  const yearly = yearlyPattern.test(text);
  const frequency = yearly ? "monthly" : readPayFrequency(text);
  if (frequency === null) return false;

  const money = readMoney(text.replace(walletPattern, " "));
  if (money.length > 1) return false;
  if (yearly && money[0]) money[0].amount = Math.round((money[0].amount / 12) * 100) / 100;

  const recipient = usernamePattern.exec(text)?.[1] ?? walletPattern.exec(text)?.[1];
  const lead = addMemberName.exec(text);
  // A name can sit alongside a wallet ("put Chidi on payroll … to 0x…");
  // a leading @username or 0x is not a name and reads as nothing.
  let name = lead ? readName(text, lead.index + lead[0].length) : undefined;
  // "a designer called Tom": the words before "called" are the role.
  let calledRole: string | undefined;
  const called = name ? /^(.+?)\s+(?:called|named)\s+(.+)$/i.exec(name) : null;
  if (called) {
    calledRole = called[1].toLowerCase();
    name = called[2];
  }
  // "as a designer" — a role, unless it's just the member type again.
  const roleMatch =
    /\bas\s+(?:an?\s+|our\s+|the\s+)?(?:new\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*)?)(?=\s+(?:for|at|on|paid|earning|making|with|to|and)\b|[,.;]|$)/i.exec(
      text,
    );
  const role =
    roleMatch && !/^(?:employee|contractor|freelancer|consultant|staff|team\s+member|member)$/i.test(roleMatch[1])
      ? roleMatch[1].toLowerCase()
      : calledRole;

  return {
    type: "Payroll",
    action: "add",
    ...(name ? { name } : {}),
    ...(recipient ? { recipient } : {}),
    ...(money[0] ? { amountUsdc: money[0].amount } : {}),
    ...(frequency ? { frequency } : {}),
    ...(role ? { role } : {}),
    ...(readMemberType(text) ? { memberType: readMemberType(text) } : {}),
  };
}

function readPayrollGroup(text: string) {
  const match = payrollGroupPattern.exec(text) ?? payGroupPattern.exec(text);
  const word = match?.[1]?.toLowerCase();
  return word && !genericGroupWords.has(word) ? word : undefined;
}

export function classifyPayroll(text: string): BusinessRead {
  // Most specific first: adding a person, approving, retrying, schedules and
  // groups all mention payroll, and must not read as a run or a status check.
  const add = readAddMember(text);
  if (add !== null) return add;

  if (payrollApprovePattern.test(text)) return { type: "Payroll", action: "approve" };

  if (payrollRetryPattern.test(text) && (failedPayoutPattern.test(text) || /\bfail/i.test(text))) {
    return { type: "Payroll", action: "retry" };
  }

  if (payrollSchedulePattern.test(text)) return { type: "Payroll", action: "schedules" };
  if (payrollGroupsPattern.test(text)) return { type: "Payroll", action: "groups" };

  if (payrollRunPatterns.some((pattern) => pattern.test(text))) {
    // "pay the team 500 each" names amounts — that's a batch for Tier 2.
    if (readMoney(text).length > 0) return false;
    const group = readPayrollGroup(text);
    return { type: "Payroll", action: "run", ...(group ? { group } : {}) };
  }

  if (payrollTeamPatterns.some((pattern) => pattern.test(text))) {
    const memberType = readMemberType(text);
    return { type: "Payroll", action: "team", ...(memberType ? { memberType } : {}) };
  }

  // Failures and approvals asked about, not acted on, are a status question.
  if (payrollStatusPatterns.some((pattern) => pattern.test(text))) {
    return { type: "PayrollStatus" };
  }

  return null;
}

// ── Invoices ────────────────────────────────────────────────────────────────

// "INV-0004", "inv 12", "invoice #12", "invoice number 12"
// A number always has a digit in it — "invoices" is not INV-OICES.
const invoiceRefPattern = /\b(INV[-\s#]*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{0,23})\b|\binvoice\s*(?:#|no\.?|number)\s*([A-Z0-9-]{1,24})\b|\binvoice\s+(\d{1,8})\b/i;
const lastInvoicePattern =
  /\b(?:last|latest|most\s+recent|newest|recent)\s+(?:draft\s+|unpaid\s+|sent\s+)?invoice\b|\binvoice\s+i\s+(?:just\s+)?(?:made|created|sent|drafted)\b/i;

function readInvoiceRef(text: string) {
  const match = invoiceRefPattern.exec(text);
  if (!match) return undefined;
  const raw = (match[1] ?? match[2] ?? match[3]).toUpperCase().replace(/\s+/g, "");
  return raw.startsWith("INV") ? raw.replace(/^INV[-#]*/, "INV-") : raw;
}

const invoiceNoun = String.raw`(?:(?:the|my|our|that|this|an?|their|his|her)\s+)*(?:(?:last|latest|recent|newest|draft|unpaid|overdue|pending|outstanding|open|sent|old)\s+)*invoice\b`;

const invoiceActionPatterns: [AllieInvoiceAction, RegExp][] = [
  [
    "remind",
    new RegExp(
      String.raw`\b(?:remind|nudge|chase(?:\s+up)?|ping|follow\s+up(?:\s+(?:on|with))?|send\s+(?:an?\s+)?(?:payment\s+|friendly\s+)?reminders?)\b`,
      "i",
    ),
  ],
  [
    "cancel",
    new RegExp(String.raw`\b(?:cancel|void|withdraw|delete|scrap|kill|revoke)\s+(?:${invoiceNoun}|INV\b)`, "i"),
  ],
  [
    "send",
    new RegExp(
      String.raw`\b(?:send|resend|re-send|email|share|issue|deliver|forward)\s+(?:out\s+)?(?:${invoiceNoun}\b(?!\s+(?:to|for|of)\s)|INV\b)`,
      "i",
    ),
  ],
  [
    "view",
    new RegExp(
      String.raw`\b(?:show|open|view|see|pull\s+up|display|find|look\s+up|check)\s+(?:me\s+)?(?:${invoiceNoun}|INV\b)`,
      "i",
    ),
  ],
];

// Words that, alongside "remind", make it about an invoice and not a chore.
const invoiceContextPattern = /\b(?:invoices?|INV[-\s#]*\d+|unpaid|overdue|outstanding|owes?|owed|pay\s+(?:us|me)|payment\s+(?:due|reminder))\b/i;

function readInvoiceAction(text: string): BusinessRead {
  // A bare reference — "INV-0004", "invoice 12?" — asks to see it.
  if (/^\s*(?:invoice\s*(?:#|no\.?|number)?\s*\d{1,8}|INV[-\s#]*[A-Z0-9-]+)\s*[?.!]?\s*$/i.test(text)) {
    return { type: "InvoiceAction", action: "view", ref: readInvoiceRef(text) ?? text.trim() };
  }

  // "send the invoice to acme", "send out the draft invoice for @bolt" —
  // their existing invoice, not a new one.
  const sendTheirs =
    /\b(?:send|resend|re-send|email|share|forward)\s+(?:out\s+)?(?:the|that|this|my|our)\s+(?:draft\s+)?invoice\s+(?:to|for)\s+/i.exec(text);
  if (sendTheirs && readMoney(text).length === 0) {
    const after = text.slice(sendTheirs.index + sendTheirs[0].length);
    const customer =
      usernamePattern.exec(` ${after}`)?.[1] ?? emailPattern.exec(after)?.[1] ?? readName(after, 0);
    if (customer) return { type: "InvoiceAction", action: "send", ref: customer };
  }

  for (const [action, pattern] of invoiceActionPatterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (action === "remind" && !invoiceContextPattern.test(text)) continue;

    const ref = readInvoiceRef(text);
    if (ref) return { type: "InvoiceAction", action, ref };
    if (lastInvoicePattern.test(text)) return { type: "InvoiceAction", action, ref: "last" };

    // "remind acme about their invoice", "chase @bolt for payment"
    const after = text.slice(match.index + match[0].length);
    const customer =
      usernamePattern.exec(after)?.[1] ??
      emailPattern.exec(after)?.[1] ??
      readName(after.replace(/^\s*(?:with|on|to|for)\s+/i, ""), 0);
    if (customer) return { type: "InvoiceAction", action, ref: customer };

    // "send my draft invoice", "cancel that invoice" — the most recent one.
    if (/\b(?:that|this|the|my|our|draft)\s+invoice\b/i.test(text)) {
      return { type: "InvoiceAction", action, ref: "last" };
    }
    return false;
  }
  return null;
}

// "has acme paid", "did @bolt pay" — but not "have been paid", "did you pay".
const paidQuestionSource = String.raw`\b(?:has|did|have)\s+(?!(?:been|they|you|we|i|all|any|these|those|it|already|not)\b)(@?[a-z][\w.&'-]*(?:\s+[A-Z][\w&'-]*)?)\s+(?:paid|pay|settled?)\b`;
const paidQuestionPattern = new RegExp(paidQuestionSource, "i");

const invoiceStatusPatterns = [
  /\binvoices\b/i,
  /\binvoice\s+(?:status|summary|overview|report|list|history)\b/i,
  /\b(?:unpaid|overdue|outstanding|open|pending|paid|draft|late|past[-\s]due)\s+invoice\b/i,
  /\bwho\s+(?:still\s+)?(?:owes|hasn'?t\s+paid|has\s+not\s+paid|is\s+late|haven'?t\s+paid)\b/i,
  /\bhow\s+much\s+(?:money\s+)?(?:am\s+i|are\s+we|is\s+(?:still\s+)?)\s*(?:still\s+)?(?:owed|outstanding|due\s+to\s+(?:me|us))\b/i,
  /\b(?:accounts?\s+receivable|receivables|money\s+owed\s+to\s+(?:me|us))\b/i,
  new RegExp(String.raw`${paidQuestionSource}.*\binvoice\b`, "i"),
  /\b(?:is|has|have|was)\s+(?:INV[-\s#]*\d\S*|invoice\s+#?\d+)\s+(?:been\s+)?(?:paid|overdue|settled|sent|viewed|opened)\b/i,
  /\b(?:haven'?t|hasn'?t)\s+(?:been\s+)?(?:gone\s+out|sent)\b.*|\bgone\s+out\s+yet\b/i,
];

function readInvoiceFilter(text: string): AllieInvoiceFilter | undefined {
  if (/\b(?:overdue|late|past[-\s]due|behind)\b/i.test(text)) return "overdue";
  if (/\b(?:drafts?|unsent|not\s+(?:been\s+)?sent|(?:haven'?t|hasn'?t|have\s+not|has\s+not|not)\s+(?:been\s+)?(?:gone\s+out|sent))\b/i.test(text)) {
    return "draft";
  }
  if (/\b(?:unpaid|outstanding|open|pending|owe[sd]?|receivables?|awaiting|not\s+(?:yet\s+)?paid|hasn'?t\s+paid|haven'?t\s+paid)\b/i.test(text)) {
    return "open";
  }
  if (/\b(?:paid|settled|collect(?:ed)?|receive[d]?|earned|brought\s+in)\b/i.test(text)) return "paid";
  if (/\b(?:all|every|history|list)\b/i.test(text)) return "all";
  return undefined;
}

const customerStop = new Set([
  "last", "this", "next", "the", "my", "our", "all", "me", "us", "customers",
  "clients", "month", "week", "year", "today", "yesterday", "quarter",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december", "each",
]);

function readInvoiceCustomer(text: string) {
  const username = usernamePattern.exec(text)?.[1];
  if (username) return username;
  const email = emailPattern.exec(text)?.[1];
  if (email) return email;
  const paid = paidQuestionPattern.exec(text);
  if (paid && !customerStop.has(paid[1].toLowerCase())) return paid[1];
  const named = /\binvoices?\s+(?:for|from|to|with|by|sent\s+to|billed\s+to)\s+/i.exec(text);
  if (!named) return undefined;
  const name = readName(text, named.index + named[0].length);
  return name && !customerStop.has(name.split(" ")[0].toLowerCase()) ? name : undefined;
}

function readInvoiceStatus(text: string): BusinessRead {
  if (!invoiceStatusPatterns.some((pattern) => pattern.test(text))) return null;
  // "is INV-0004 paid" is about one invoice.
  const ref = readInvoiceRef(text);
  if (ref) return { type: "InvoiceAction", action: "view", ref };

  // "has acme paid?" wants their whole picture, paid or not.
  const filter = paidQuestionPattern.test(text)
    ? "all"
    : readInvoiceFilter(text);
  const customer = readInvoiceCustomer(text);
  return {
    type: "InvoiceStatus",
    ...(filter ? { filter } : {}),
    ...(customer ? { customer } : {}),
  };
}

// "create an invoice", "invoice acme 500", "I need to invoice my client",
// "bill acme 500 via invoice"
const createInvoicePatterns = [
  /\b(?:create|make|draft|raise|issue|generate|prepare|write|send|start|set\s+up|put\s+together|do|cut|build)\s+(?:up\s+)?(?:(?:a|an|the|new|another|quick)\s+)*invoice\b/i,
  /(?:^|\b(?:to|please|can\s+you|could\s+you|i\s+want\s+to|i\s+need\s+to|need\s+to|let'?s|help\s+me)\s+)invoice\s+(?!(?:status|summary|number|no\.?|#|INV\b|\d+\s*[?.!]?\s*$))/i,
  /\bnew\s+invoice\b/i,
  /\bbill\s+.+\b(?:via|with|using|by)\s+(?:an?\s+)?invoice\b/i,
];

const wordNumbers: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  ten: 10, fourteen: 14, thirty: 30,
};

type Due = { dueDate?: string; dueInDays?: number } | null;

/** The due date, stripped from the text. `null` = a due date Tier 1 can't read. */
function readDue(text: string): { due: Due; rest: string } {
  const patterns: [RegExp, (match: RegExpExecArray) => Due][] = [
    [
      /\b(?:due|payable)\s+(?:in|within)\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|ten|fourteen|thirty)\s+(days?|weeks?|months?)\b/i,
      (match) => {
        const count = /^\d/.test(match[1]) ? Number(match[1]) : wordNumbers[match[1].toLowerCase()];
        const unit = match[2].toLowerCase();
        return { dueInDays: unit.startsWith("week") ? count * 7 : unit.startsWith("month") ? count * 30 : count };
      },
    ],
    [/\b(?:due\s+)?net[\s-]?(\d{1,3})\b/i, (match) => ({ dueInDays: Number(match[1]) })],
    [/\bdue\s+(?:on\s+|by\s+)?(\d{4}-\d{2}-\d{2})\b/i, (match) => ({ dueDate: match[1] })],
    [/\b(?:due\s+)?(?:on\s+)?receipt\b|\bdue\s+(?:today|now|immediately)\b/i, () => ({ dueInDays: 0 })],
    [/\bdue\s+tomorrow\b/i, () => ({ dueInDays: 1 })],
    [/\bdue\s+(?:in\s+a\s+week|next\s+week)\b/i, () => ({ dueInDays: 7 })],
    // Any other "due …" is a date Tier 1 would have to guess at.
    [/\b(?:due|payable)\s+(?:on|by|before|in|at|end|next|this|\w+day|\d)/i, () => null],
  ];

  for (const [pattern, read] of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return { due: read(match), rest: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}` };
    }
  }
  return { due: {}, rest: text };
}

function readCreateInvoice(text: string, note: string | undefined): BusinessRead {
  if (!createInvoicePatterns.some((pattern) => pattern.test(text))) return null;

  const { due, rest } = readDue(text);
  if (due === null) return false;

  const money = readMoney(rest);
  // "3 hours at 50" or two separate items — line items are Tier 2's job.
  if (money.length > 1) return false;
  const amount = money[0];

  const assetWord = /\b(eurc|euros?)\b/i.test(rest) ? "EURC" : "USDC";

  // Customer: an explicit handle or email wins; else the name after
  // "invoice"/"to"/"bill", or a "for <name>" that comes before the amount.
  let customer =
    usernamePattern.exec(rest)?.[1] ?? emailPattern.exec(rest)?.[1];
  if (!customer) {
    const lead = /\b(?:invoice|invoicing|bill|billing|to)\s+(?!(?:a|an|the|my|our)\b)/gi;
    for (const match of rest.matchAll(lead)) {
      const start = (match.index ?? 0) + match[0].length;
      if (amount && start > amount.index && !/^to\b/i.test(match[0])) continue;
      const name = readName(rest, start);
      if (name && !/^(?:me|us|pay)$/i.test(name)) {
        customer = name;
        break;
      }
    }
  }
  if (!customer && amount) {
    const before = rest.slice(0, amount.index);
    const forName = /\bfor\s+(?!(?:a|an|the|my|our)\b)([A-Za-z][\w&'.-]*)/i.exec(before);
    if (forName) customer = readName(before, forName.index + 4);
  }

  // What it's for: a "for …" after the amount (or anywhere, if not the customer).
  const tail = amount ? rest.slice(amount.end) : rest;
  const forWhat = /\bfor\s+(.+?)(?=\s+(?:to|due|net|by|and\s+send)\b|[,;]|$)/i.exec(tail);
  let description = forWhat?.[1].trim();
  if (description && customer && description.toLowerCase() === customer.toLowerCase()) {
    description = undefined;
  }
  if (description && /^\$?\d/.test(description)) description = undefined;

  return {
    type: "CreateInvoice",
    asset: amount?.asset ?? assetWord,
    ...(customer ? { customer } : {}),
    ...(amount ? { amountUsdc: amount.amount } : {}),
    ...(description ? { description: description.replace(/[.!]+$/, "") } : {}),
    ...(due?.dueDate ? { dueDate: due.dueDate } : {}),
    ...(due?.dueInDays !== undefined ? { dueInDays: due.dueInDays } : {}),
    ...(note ? { note } : {}),
  };
}

export function classifyInvoices(text: string, note?: string): BusinessRead {
  // Acting on one invoice beats creating one: "send the last invoice" is not
  // "send an invoice". Creating beats a status read: "make an invoice".
  const action = readInvoiceAction(text);
  if (action !== null) return action;

  const create = readCreateInvoice(text, note);
  if (create !== null) return create;

  return readInvoiceStatus(text);
}

/** Payroll and invoices, in one call for the main classifier. */
export function classifyBusiness(text: string, note?: string): BusinessRead {
  // "split 30 among my team" is a payment, whatever words it uses.
  if (/\bsplit\b/i.test(text)) return null;
  const invoice = classifyInvoices(text, note);
  if (invoice !== null) return invoice;
  return classifyPayroll(text);
}
