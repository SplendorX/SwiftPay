/**
 * Target-aware savings amount capping.
 * Pure functions — unit-tested. No floating point money math.
 */

export type CapSaveResult = {
  /** Amount that may be deposited */
  cappedUnits: bigint;
  /** True when this deposit will hit or surpass the target */
  reachesTarget: boolean;
  /** True when save was reduced because stop_at_target is on */
  wasCapped: boolean;
  /** Remaining room to target before this deposit (0 if no target / continue) */
  roomUnits: bigint | null;
};

/**
 * Cap a planned deposit against an optional hard target.
 *
 * Rules:
 * - No target → full amount
 * - continue beyond target (stopAtTarget=false) → full amount; may mark reachesTarget
 * - stopAtTarget=true and already at/above target → 0
 * - stopAtTarget=true and room < planned → save only room
 */
export function capSaveAmountForTarget(input: {
  plannedSaveUnits: bigint;
  currentBalanceUnits: bigint;
  targetAmountUnits: bigint | null;
  stopAtTarget: boolean;
}): CapSaveResult {
  const planned =
    input.plannedSaveUnits < 0n ? 0n : input.plannedSaveUnits;

  if (planned === 0n) {
    return {
      cappedUnits: 0n,
      reachesTarget: false,
      wasCapped: false,
      roomUnits: null,
    };
  }

  if (
    input.targetAmountUnits === null ||
    input.targetAmountUnits <= 0n
  ) {
    return {
      cappedUnits: planned,
      reachesTarget: false,
      wasCapped: false,
      roomUnits: null,
    };
  }

  const target = input.targetAmountUnits;
  const current =
    input.currentBalanceUnits < 0n ? 0n : input.currentBalanceUnits;
  const room = target > current ? target - current : 0n;
  const next = current + planned;
  const reachesTarget = next >= target;

  if (!input.stopAtTarget) {
    return {
      cappedUnits: planned,
      reachesTarget,
      wasCapped: false,
      roomUnits: room,
    };
  }

  // Hard stop at target
  if (room === 0n) {
    return {
      cappedUnits: 0n,
      reachesTarget: true,
      wasCapped: planned > 0n,
      roomUnits: 0n,
    };
  }

  if (planned <= room) {
    return {
      cappedUnits: planned,
      reachesTarget: planned === room,
      wasCapped: false,
      roomUnits: room,
    };
  }

  return {
    cappedUnits: room,
    reachesTarget: true,
    wasCapped: true,
    roomUnits: room,
  };
}

export function isTargetReached(
  currentBalanceUnits: bigint,
  targetAmountUnits: bigint | null,
): boolean {
  if (targetAmountUnits === null || targetAmountUnits <= 0n) return false;
  return currentBalanceUnits >= targetAmountUnits;
}
