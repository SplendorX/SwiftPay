"use client";

import React, { useRef, useState, type ButtonHTMLAttributes } from "react";

export interface CursorAnimatedButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

/**
 * Interactive button that animates dynamically on cursor hover and movement:
 * - Real-time cursor coordinates tracking
 * - 3D dynamic tilt & magnetic perspective pull
 * - Radial gradient shine following cursor position
 * - Smooth spring physics on mouse enter / leave
 */
export function CursorAnimatedButton({
  children,
  className = "",
  disabled,
  variant = "primary",
  onMouseMove,
  onMouseLeave,
  onMouseEnter,
  ...props
}: CursorAnimatedButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCoords({ x, y });

    // Calculate normalized tilt (-1 to 1) from center
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const tiltX = (y - centerY) / centerY; // tilt up/down
    const tiltY = (centerX - x) / centerX; // tilt left/right
    setTilt({ x: tiltX * 8, y: tiltY * 8 });

    onMouseMove?.(e);
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLButtonElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCoords({ x, y });
    onMouseEnter?.(e);
  }

  function handleMouseLeave(e: React.MouseEvent<HTMLButtonElement>) {
    setCoords(null);
    setTilt({ x: 0, y: 0 });
    onMouseLeave?.(e);
  }

  return (
    <button
      ref={buttonRef}
      className={`relative overflow-hidden transition-all duration-200 ease-out will-change-transform ${className}`}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{
        transform: coords && !disabled
          ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(1.03, 1.03, 1.03)`
          : "perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
      }}
      {...props}
    >
      {/* Dynamic cursor-following light shine */}
      {coords && !disabled && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-90 transition-opacity duration-300"
          style={{
            background:
              variant === "primary"
                ? `radial-gradient(130px circle at ${coords.x}px ${coords.y}px, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0.1) 45%, transparent 80%)`
                : `radial-gradient(130px circle at ${coords.x}px ${coords.y}px, rgba(245, 158, 11, 0.35), rgba(245, 158, 11, 0.1) 45%, transparent 80%)`,
          }}
        />
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
}
