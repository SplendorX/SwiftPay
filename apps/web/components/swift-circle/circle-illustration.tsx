/**
 * Circle's intro artwork: friends around one shared pot, linked into a ring.
 * The same cream disc as RecurePay's, BulkPay's and Invite & Earn's; the
 * people pop in once (skipped with reduced motion).
 */
export function CircleIllustration({ className }: { className?: string }) {
  const people = [
    { cx: 160, cy: 52, delay: 150 },
    { cx: 252, cy: 118, delay: 300 },
    { cx: 218, cy: 226, delay: 450 },
    { cx: 102, cy: 226, delay: 600 },
    { cx: 68, cy: 118, delay: 750 },
  ];
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 320 300">
      <defs>
        <linearGradient id="circle-pot" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b1478" />
          <stop offset="55%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* The disc */}
      <circle cx="160" cy="150" fill="#fff4dc" r="122" stroke="#f5c451" strokeWidth="2" />

      {/* The ring that links everyone */}
      <circle cx="160" cy="146" r="92" stroke="#c4b5fd" strokeDasharray="5 7" strokeLinecap="round" strokeWidth="3" />

      {/* The shared pot */}
      <circle cx="160" cy="146" fill="url(#circle-pot)" r="40" />
      <circle cx="160" cy="146" fill="#f6c94c" r="20" stroke="#e0a82e" strokeWidth="2" />
      <path
        d="M160 134v24m-6-18.5c0-2.4 2.6-4 6-4s6 1.6 6 4-2.6 3.6-6 4.2-6 1.8-6 4.2 2.6 4.1 6 4.1 6-1.7 6-4.1"
        stroke="#5b21b6"
        strokeLinecap="round"
        strokeWidth="2.6"
      />

      {/* The people */}
      {people.map((person) => (
        <g className="circle-person" key={`${person.cx}-${person.cy}`} style={{ animationDelay: `${person.delay}ms` }}>
          <circle cx={person.cx} cy={person.cy} fill="#ffffff" r="24" stroke="#5b21b6" strokeWidth="3" />
          <circle cx={person.cx} cy={person.cy - 6} fill="#5b21b6" r="7" />
          <path d={`M${person.cx - 12} ${person.cy + 13} a12 9 0 0 1 24 0`} fill="#5b21b6" />
        </g>
      ))}

      {/* A chat bubble: Circles talk as well as pay */}
      <path d="M258 40 h40 a10 10 0 0 1 10 10 v18 a10 10 0 0 1 -10 10 h-24 l-10 9 v-9 h-6 a10 10 0 0 1 -10 -10 v-18 a10 10 0 0 1 10 -10 z" fill="#5b21b6" />
      <circle cx="268" cy="59" fill="#ffffff" r="3" />
      <circle cx="278" cy="59" fill="#ffffff" r="3" />
      <circle cx="288" cy="59" fill="#ffffff" r="3" />
    </svg>
  );
}
