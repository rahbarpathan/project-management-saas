export const POSITION_STEP = 1000;
export const MIN_POSITION_GAP = 0.0002;

export interface NeighborPositions {
  prevPosition?: number | null;
  nextPosition?: number | null;
}

export interface PositionCalculationResult {
  position: number;
  needsRebalance: boolean;
}

/**
 * Calculates a new fractional position given optional prev and next neighbor positions.
 * Values are rounded to 4 decimal places (matching PostgreSQL Decimal(10, 4)).
 */
export function calculateFractionalPosition(neighbors: NeighborPositions): PositionCalculationResult {
  const { prevPosition, nextPosition } = neighbors;

  // Case 1: Empty or isolated
  if (prevPosition == null && nextPosition == null) {
    return { position: POSITION_STEP, needsRebalance: false };
  }

  // Case 2: Placed at the top (before nextPosition)
  if (prevPosition == null && nextPosition != null) {
    const candidate = Number((nextPosition / 2).toFixed(4));
    if (candidate <= 0 || candidate >= nextPosition) {
      return { position: candidate, needsRebalance: true };
    }
    return { position: candidate, needsRebalance: false };
  }

  // Case 3: Placed at the bottom (after prevPosition)
  if (prevPosition != null && nextPosition == null) {
    const candidate = Number((prevPosition + POSITION_STEP).toFixed(4));
    return { position: candidate, needsRebalance: false };
  }

  // Case 4: Placed between prev and next
  const prev = prevPosition!;
  const next = nextPosition!;

  if (next <= prev) {
    // Malformed / inverted neighbors order
    return { position: prev, needsRebalance: true };
  }

  const gap = next - prev;
  if (gap < MIN_POSITION_GAP) {
    return { position: prev, needsRebalance: true };
  }

  const midpoint = Number(((prev + next) / 2).toFixed(4));
  if (midpoint <= prev || midpoint >= next) {
    // Decimal rounding collapsed into a neighbor
    return { position: midpoint, needsRebalance: true };
  }

  return { position: midpoint, needsRebalance: false };
}

/**
 * Rebalances an ordered list of task IDs by assigning spaced positions: 1000, 2000, 3000...
 */
export function generateRebalancedPositions(
  taskIds: string[],
  step: number = POSITION_STEP,
): Array<{ id: string; position: number }> {
  return taskIds.map((id, index) => ({
    id,
    position: (index + 1) * step,
  }));
}
