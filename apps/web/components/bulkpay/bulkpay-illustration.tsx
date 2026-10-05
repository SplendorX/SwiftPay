/**
 * BulkPay's intro artwork: one payment fanning out to many people, on
 * SwiftPay's cream disc (the same family as RecurePay's). SVG so it stays
 * crisp; the ticks draw in once (skipped with reduced motion).
 */
export function BulkpayIllustration({ className }: { className?: string }) {
  const people = [
    { cx: 256, cy: 74, delay: 300 },
    { cx: 276, cy: 140, delay: 480 },
    { cx: 256, cy: 206, delay: 660 },
    { cx: 206, cy: 250, delay: 840 },
  ];
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 320 300">
      <defs>
        <linearGradient id="bulkpay-card" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b1478" />
          <stop offset="55%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* The disc */}
      <circle cx="170" cy="150" fill="#fff4dc" r="122" stroke="#f5c451" strokeWidth="2" />

      {/* Paths from the payment to each person */}
      {people.map((person) => (
        <path
          d={`M120 150 C 170 150, ${person.cx - 50} ${person.cy}, ${person.cx - 22} ${person.cy}`}
          key={`${person.cx}-${person.cy}`}
          stroke="#c4b5fd"
          strokeDasharray="5 6"
          strokeLinecap="round"
          strokeWidth="3"
        />
      ))}

      {/* The payment card */}
      <rect fill="url(#bulkpay-card)" height="96" rx="16" width="112" x="34" y="102" />
      <circle cx="68" cy="134" fill="#f6c94c" r="16" />
      <path d="M68 124v20m-5-15.5c0-2 2-3.5 5-3.5s5 1.5 5 3.5-2 3-5 3.5-5 1.5-5 3.5 2 3.5 5 3.5 5-1.5 5-3.5" stroke="#5b21b6" strokeLinecap="round" strokeWidth="2.6" />
      <rect fill="#ffffff" height="8" opacity="0.9" rx="4" width="44" x="90" y="128" />
      <rect fill="#ffffff" height="6" opacity="0.5" rx="3" width="30" x="90" y="142" />
      <rect fill="#ffffff" height="10" opacity="0.25" rx="5" width="80" x="50" y="172" />

      {/* The people, each ticked off as paid */}
      {people.map((person) => (
        <g key={`p-${person.cx}-${person.cy}`}>
          <circle cx={person.cx} cy={person.cy} fill="#ffffff" r="24" stroke="#5b21b6" strokeWidth="3" />
          <circle cx={person.cx} cy={person.cy - 6} fill="#5b21b6" r="7" />
          <path d={`M${person.cx - 12} ${person.cy + 13} a12 9 0 0 1 24 0`} fill="#5b21b6" />
          <circle cx={person.cx + 17} cy={person.cy - 17} fill="#34d399" r="9" />
          <path
            className="bulkpay-tick"
            d={`M${person.cx + 12.5} ${person.cy - 17} l3 3 l6 -6.5`}
            stroke="#ffffff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.6"
            style={{ animationDelay: `${person.delay}ms` }}
          />
        </g>
      ))}

      {/* Count badge */}
      <circle cx="74" cy="62" fill="#5b21b6" r="24" />
      <text fill="#ffffff" fontFamily="ui-sans-serif, system-ui" fontSize="15" fontWeight="800" textAnchor="middle" x="74" y="67">
        500
      </text>
    </svg>
  );
}
