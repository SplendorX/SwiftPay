export function BrandMark({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg
      aria-label="SwiftPay"
      className={className}
      role="img"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>SwiftPay</title>
      <defs>
        <linearGradient
          id="swiftpay-mark-gradient"
          x1="34"
          x2="101"
          y1="95"
          y2="27"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2b075f" />
          <stop offset="0.48" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#a878ff" />
        </linearGradient>
      </defs>
      <circle
        cx="64"
        cy="64"
        r="59.5"
        fill="white"
        stroke="#cbb7ea"
        strokeWidth="1.8"
      />
      <g transform="translate(12.3 13) scale(0.66)">
        <path
          d="M43.2 48.7c-1.6-3.1-2.1-6.6-1.3-10.1 1.9-8.3 9.3-14.1 18.7-14.1h23.7L76.6 34H61.4c-4.8 0-8.5 2.8-9.3 6.9-.5 2.7.2 5.1 2 6.8l-6.1 9.4c-2-1.7-3.6-4.1-4.8-8.4Z"
          fill="url(#swiftpay-mark-gradient)"
        />
        <path
          d="M75.9 74h14.4c5.4 0 9.1-3.3 9.1-8.2 0-5.1-3.7-8.4-9.1-8.4h-10l6-9.7h4.9c11 0 18.7 7.3 18.7 18.1 0 10.5-7.8 17.7-19.2 17.7H69.3L75.9 74Z"
          fill="url(#swiftpay-mark-gradient)"
        />
        <path
          d="M75.9 17.8 49.4 57.4h17.4L52.2 100.7l39.3-51.6H74.8l15.7-31.3H75.9Z"
          fill="url(#swiftpay-mark-gradient)"
        />
        <path
          d="M82.7 25.8v12.4h12.5v-8.8l18.2 14.3-18.2 14.4v-8.9H79.3l4.2-11h11.7V25.8H82.7Z"
          fill="url(#swiftpay-mark-gradient)"
        />
      </g>
      <text
        x="64"
        y="93.5"
        fill="#160f24"
        fontFamily="var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="18.5"
        fontWeight="800"
        letterSpacing="0"
        dominantBaseline="middle"
        textAnchor="middle"
      >
        <tspan fill="#160f24">Swift</tspan>
        <tspan fill="#5b21b6">Pay</tspan>
      </text>
    </svg>
  );
}
