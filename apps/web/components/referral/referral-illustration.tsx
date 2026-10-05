/**
 * Invite & Earn's intro artwork: you and a friend, linked by an invite, with
 * SwiftPoints coming to both. Same cream disc as RecurePay's and BulkPay's;
 * the coins rise in once (skipped with reduced motion).
 */
export function ReferralIllustration({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 320 300">
      <defs>
        <linearGradient id="referral-gift" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b1478" />
          <stop offset="55%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* The disc */}
      <circle cx="160" cy="150" fill="#fff4dc" r="122" stroke="#f5c451" strokeWidth="2" />

      {/* The invite between two people */}
      <path d="M86 196 C 110 120, 210 120, 234 196" stroke="#c4b5fd" strokeDasharray="5 6" strokeLinecap="round" strokeWidth="3" />

      {/* You */}
      <circle cx="80" cy="214" fill="#ffffff" r="30" stroke="#5b21b6" strokeWidth="3" />
      <circle cx="80" cy="206" fill="#5b21b6" r="9" />
      <path d="M64 230 a16 12 0 0 1 32 0" fill="#5b21b6" />

      {/* Your friend */}
      <circle cx="240" cy="214" fill="#ffffff" r="30" stroke="#5b21b6" strokeWidth="3" />
      <circle cx="240" cy="206" fill="#5b21b6" r="9" />
      <path d="M224 230 a16 12 0 0 1 32 0" fill="#5b21b6" />

      {/* The gift */}
      <rect fill="url(#referral-gift)" height="62" rx="10" width="76" x="122" y="108" />
      <rect fill="#4c1d95" height="18" rx="6" width="88" x="116" y="96" />
      <rect fill="#f6c94c" height="80" width="12" x="154" y="96" />
      <path d="M160 96 c-10 -22 -34 -16 -26 -2 c4 6 16 4 26 2 Z" fill="#f6c94c" />
      <path d="M160 96 c10 -22 34 -16 26 -2 c-4 6 -16 4 -26 2 Z" fill="#f6c94c" />

      {/* SwiftPoints for both */}
      <g className="referral-coin" style={{ animationDelay: "250ms" }}>
        <circle cx="104" cy="160" fill="#f6c94c" r="17" stroke="#e0a82e" strokeWidth="2" />
        <text fill="#5b21b6" fontFamily="ui-sans-serif, system-ui" fontSize="11" fontWeight="800" textAnchor="middle" x="104" y="164">
          +100
        </text>
      </g>
      <g className="referral-coin" style={{ animationDelay: "450ms" }}>
        <circle cx="218" cy="160" fill="#f6c94c" r="15" stroke="#e0a82e" strokeWidth="2" />
        <text fill="#5b21b6" fontFamily="ui-sans-serif, system-ui" fontSize="11" fontWeight="800" textAnchor="middle" x="218" y="164">
          +20
        </text>
      </g>

      {/* Loose coins: SwiftPoints on their way */}
      <circle cx="254" cy="82" fill="#f6c94c" r="9" stroke="#e0a82e" strokeWidth="2" />
      <circle cx="270" cy="66" fill="#f6c94c" opacity="0.7" r="5.5" stroke="#e0a82e" strokeWidth="1.5" />
      <circle cx="72" cy="96" fill="#5b21b6" r="7" />
      <circle cx="60" cy="112" fill="#5b21b6" opacity="0.6" r="4" />
    </svg>
  );
}
