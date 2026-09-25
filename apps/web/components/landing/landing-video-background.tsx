"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * A dimmed, full-width background video for a landing section. Put it first
 * inside an element with the `landing-video-stage` class; it covers exactly
 * that element and never takes clicks.
 *
 * Phones get `mobileSrc` when given. The video is only added after load and
 * is skipped under Data Saver or reduced motion, so those visitors never
 * download it; the dimmed `poster` shows in its place (and while it loads).
 */
export function LandingVideoBackground({
  mobileSrc,
  poster,
  position = "center",
  src,
}: {
  mobileSrc?: string;
  poster: string;
  /** object-position for the crop, e.g. "60% center". */
  position?: string;
  src: string;
}) {
  const [playVideo, setPlayVideo] = useState(false);
  // The still frame sits under the video until it plays. The video is
  // translucent (dimmed), so leaving the still there would show through it
  // as a ghosted double image.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPlayVideo(!connection?.saveData && !reducedMotion);
  }, []);

  return (
    <div
      aria-hidden
      className="landing-video-bg"
      data-playing={playing ? "" : undefined}
      style={{ "--landing-video-poster": `url("${poster}")`, "--landing-video-position": position } as CSSProperties}
    >
      {playVideo ? (
        <video
          autoPlay
          className="landing-video"
          loop
          muted
          onPlaying={() => setPlaying(true)}
          playsInline
          preload="auto"
        >
          {mobileSrc ? <source media="(max-width: 767px)" src={mobileSrc} type="video/mp4" /> : null}
          <source src={src} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
