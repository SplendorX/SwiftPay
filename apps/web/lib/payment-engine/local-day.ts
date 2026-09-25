/** True when `value` is an IANA time zone this runtime understands. */
export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds `timeZone` is ahead of UTC at `at`. */
function offsetMs(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(at)
      .map((part) => [part.type, Number(part.value)]),
  );
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallClock - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant the current calendar day began in `timeZone` — the most recent
 * local midnight. Falls back to UTC for an unknown zone.
 */
export function startOfLocalDay(timeZone: string, now = new Date()): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const local = new Date(now.getTime() + offsetMs(now, zone));
  const midnightWallClock = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  // Use the offset in force at midnight itself, which differs from now's on a
  // daylight-saving change day.
  const guess = new Date(midnightWallClock - offsetMs(now, zone));
  return new Date(midnightWallClock - offsetMs(guess, zone));
}

/**
 * The local wall-clock time in `timeZone` as ISO with its UTC offset, to the
 * minute: "2026-09-24T19:28+01:00". What ALLIE is told "now" is.
 */
export function localIsoMinute(timeZone: string, now = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const offset = offsetMs(now, zone);
  const local = new Date(now.getTime() + offset).toISOString().slice(0, 16);
  const minutes = Math.round(Math.abs(offset) / 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local}${offset < 0 ? "-" : "+"}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
