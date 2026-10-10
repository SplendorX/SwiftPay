/**
 * The RecurePay empty-state artwork: a month calendar with one column of
 * payments ticked off, on SaphraONE's cream disc. Drawn as SVG so it stays
 * crisp at any size; the ticks draw in once (skipped with reduced motion).
 */
export function RecurepayIllustration({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 320 300">
      <defs>
        <clipPath id="recurepay-disc">
          <circle cx="178" cy="140" r="118" />
        </clipPath>
        <linearGradient id="recurepay-header" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#5b21b6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* The disc */}
      <circle cx="178" cy="140" fill="#fff4dc" r="118" stroke="#f5c451" strokeWidth="2" />

      {/* The calendar, cropped by the disc like a window */}
      <g clipPath="url(#recurepay-disc)">
        <rect fill="#f6c94c" height="240" rx="10" width="240" x="104" y="70" />
        <rect fill="url(#recurepay-header)" height="26" rx="8" width="240" x="104" y="70" />
        <rect fill="url(#recurepay-header)" height="12" width="240" x="104" y="84" />
        {[0, 1, 2].map((dot) => (
          <circle cx={122 + dot * 14} cy="83" fill="#ffffff" key={dot} r="3.6" />
        ))}
        {rows.map((row) =>
          cols.map((col) => {
            const x = 116 + col * 52;
            const y = 108 + row * 48;
            const paid = col === 1;
            return paid ? (
              <g key={`${row}-${col}`}>
                <rect fill="#4c1d95" height="38" rx="5" width="42" x={x} y={y} />
                <path
                  className="recurepay-tick"
                  d={`M${x + 11} ${y + 20} l7 7 l14 -15`}
                  stroke="#34d399"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                  style={{ animationDelay: `${300 + row * 180}ms` }}
                />
              </g>
            ) : (
              <rect fill="#fde49a" height="38" key={`${row}-${col}`} rx="5" width="42" x={x} y={y} />
            );
          }),
        )}
      </g>

      {/* Calendar badge */}
      <circle cx="98" cy="202" fill="#fff4dc" r="44" stroke="#f5c451" strokeWidth="2" />
      <rect fill="#5b21b6" height="30" rx="6" width="34" x="81" y="190" />
      <rect fill="#5b21b6" height="8" rx="3" width="34" x="81" y="186" />
      <rect fill="#fff4dc" height="3" rx="1.5" width="26" x="85" y="198" />
      <rect fill="#5b21b6" height="9" rx="2" width="4" x="88" y="181" />
      <rect fill="#5b21b6" height="9" rx="2" width="4" x="104" y="181" />

      {/* Repeat badge */}
      <circle cx="276" cy="52" fill="#5b21b6" r="22" />
      <path
        d="M266 52a10 10 0 0 1 17-7m3 7a10 10 0 0 1-17 7"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path d="M283 39v7h-7" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="M269 65v-7h7" stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}
