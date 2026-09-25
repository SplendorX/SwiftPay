import { supportArticles, type SupportArticle } from "@/lib/support/knowledge";

/**
 * Matches a customer's question to the help library. Deterministic, free and
 * instant: token overlap weighted by where the word appears, with the page
 * the customer is on as a tie-breaker.
 */
export type SupportReply =
  | { kind: "greeting" }
  | { kind: "thanks" }
  | { kind: "human"; urgent: boolean }
  | { kind: "answer"; article: SupportArticle; related: SupportArticle[]; urgent: boolean }
  | { kind: "suggest"; articles: SupportArticle[] }
  | { kind: "unknown" };

const stopWords = new Set([
  "a", "an", "the", "i", "me", "my", "we", "our", "you", "your", "is", "are", "was", "be", "to",
  "of", "in", "on", "for", "and", "or", "it", "this", "that", "do", "does", "did", "can", "could",
  "how", "what", "why", "when", "where", "with", "have", "has", "not", "no", "please", "help",
  "swiftpay", "hi", "hey", "want", "need", "would", "like", "get", "about", "there", "so", "just",
  "am", "im", "i'm", "from", "at", "by", "if", "any", "some", "should", "will", "way",
]);

/** Crude stemming: enough to make "invoices", "invoicing", "invoiced" agree. */
function stem(word: string) {
  return word
    .replace(/(?:ing|ed|es|s)$/u, "")
    .replace(/ie$/u, "y");
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@ ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word))
    .map(stem);
}

type Indexed = {
  article: SupportArticle;
  title: Set<string>;
  keywords: Set<string>;
  phrases: string[];
  body: Set<string>;
};

const index: Indexed[] = supportArticles.map((article) => ({
  article,
  body: new Set(tokens(`${article.answer} ${(article.steps ?? []).join(" ")}`)),
  keywords: new Set(article.keywords.flatMap(tokens)),
  // Multi-word keywords ("wrong address") are strong when they appear whole.
  phrases: article.keywords.filter((keyword) => keyword.includes(" ")).map((keyword) => keyword.toLowerCase()),
  title: new Set(tokens(article.title)),
}));

const greetingPattern = /^\s*(?:hi|hello|hey|good (?:morning|afternoon|evening)|yo|hiya|sup)\b[\s!.,]*$/i;
const thanksPattern = /^\s*(?:thanks?|thank you|thx|ty|cheers|great|perfect|ok(?:ay)?|got it|that helped)\b[\s!.,]*$/i;
const humanPattern =
  /\b(?:human|person|agent|someone|real person|representative|rep|staff|support team|talk to (?:someone|support|a)|contact (?:support|you|someone)|speak to|call me|escalate|open a ticket|raise a ticket|complain|complaint)\b/i;
const urgentPattern =
  /\b(?:hack(?:ed)?|stolen|stole|compromised|unauthori[sz]ed|drained|scam(?:med)?|phish(?:ing|ed)?|lost (?:my )?(?:funds|money)|fraud|didn'?t (?:make|authori[sz]e) (?:this|that|it))\b/i;

export function isUrgentMessage(text: string) {
  return urgentPattern.test(text);
}

/** Lowercase, letters and digits only: for comparing whole phrases. */
function plain(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function score(entry: Indexed, words: string[], lowered: string, path: string | null) {
  let total = 0;
  // Asking the title's own question ("what is allie") is the strongest signal.
  const query = plain(lowered);
  const title = plain(entry.article.title);
  if (query.length >= 6 && (title.startsWith(query) || query.startsWith(title))) total += 4;
  for (const word of words) {
    if (entry.title.has(word)) total += 3;
    else if (entry.keywords.has(word)) total += 2.5;
    else if (entry.body.has(word)) total += 0.75;
  }
  for (const phrase of entry.phrases) {
    if (lowered.includes(phrase)) total += 4;
  }
  if (path && entry.article.paths?.some((prefix) => path.startsWith(prefix))) total += 1;
  // Long questions shouldn't win on volume alone.
  return total / Math.sqrt(Math.max(words.length, 1));
}

/** Top articles for a free-text query, best first. */
export function searchArticles(query: string, path: string | null = null, limit = 5) {
  const lowered = query.toLowerCase();
  const words = tokens(query);
  // "What is SwiftPay?" is all stop words, but it is exactly an article title.
  if (words.length === 0) {
    const exact = index.find((entry) => plain(entry.article.title) === plain(lowered));
    return exact ? [{ article: exact.article, score: 10 }] : [];
  }
  return index
    .map((entry) => ({ article: entry.article, score: score(entry, words, lowered, path) }))
    .filter((result) => result.score > 0.9)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Articles to show before anyone asks: the ones for this page first. */
export function suggestedArticles(path: string | null, limit = 4) {
  // Most specific page first: on /business/payroll, payroll beats /business.
  const specificity = (article: SupportArticle) =>
    Math.max(0, ...(article.paths ?? []).filter((prefix) => path?.startsWith(prefix)).map((prefix) => prefix.length));
  const forPage = path
    ? supportArticles
        .filter((article) => specificity(article) > 0)
        .sort((a, b) => specificity(b) - specificity(a))
    : [];
  const defaults = ["fees", "payment-pending", "send-money", "business-verification", "add-funds"]
    .map((id) => supportArticles.find((article) => article.id === id)!)
    .filter(Boolean);
  return [...new Map([...forPage, ...defaults].map((article) => [article.id, article])).values()].slice(0, limit);
}

/**
 * What the assistant should do with a message. A confident match answers;
 * a close call offers options; nothing relevant offers a person. Anything
 * that sounds like lost or stolen funds goes to a person whatever else fits.
 */
export function replyTo(message: string, path: string | null = null): SupportReply {
  const text = message.trim();
  const urgent = isUrgentMessage(text);

  if (greetingPattern.test(text)) return { kind: "greeting" };
  if (thanksPattern.test(text)) return { kind: "thanks" };

  const results = searchArticles(text, path);
  const best = results[0];
  const second = results[1];

  if (humanPattern.test(text) && (!best || best.score < 2.5)) return { kind: "human", urgent };

  if (!best) return urgent ? { kind: "human", urgent: true } : { kind: "unknown" };

  // Confident: strong on its own, and clearly ahead of the runner-up.
  if (best.score >= 2.2 && (!second || best.score >= second.score * 1.25)) {
    return {
      article: best.article,
      kind: "answer",
      related: results.slice(1, 3).map((result) => result.article),
      urgent: urgent || Boolean(best.article.urgent),
    };
  }

  return { articles: results.slice(0, 3).map((result) => result.article), kind: "suggest" };
}

/** A category for a ticket, from what the conversation was about. */
export function categoryFor(text: string) {
  return searchArticles(text)[0]?.article.category ?? "general";
}
