import { describe, it, expect } from 'vitest';
import {
  calculateFractionalPosition,
  generateRebalancedPositions,
  POSITION_STEP,
  MIN_POSITION_GAP,
} from './position';

describe('Fractional Positioning & Rebalancing', () => {
  describe('calculateFractionalPosition', () => {
    it('returns default initial position when no neighbors exist', () => {
      const result = calculateFractionalPosition({});
      expect(result.position).toBe(POSITION_STEP);
      expect(result.needsRebalance).toBe(false);
      expect(MIN_POSITION_GAP).toBe(0.0002);
    });

    it('positions before the next task when inserted at head', () => {
      const result = calculateFractionalPosition({ nextPosition: 1000 });
      expect(result.position).toBe(500);
      expect(result.needsRebalance).toBe(false);
    });

    it('positions after the previous task when appended at tail', () => {
      const result = calculateFractionalPosition({ prevPosition: 2000 });
      expect(result.position).toBe(3000);
      expect(result.needsRebalance).toBe(false);
    });

    it('calculates the exact midpoint between two distant neighbors', () => {
      const result = calculateFractionalPosition({ prevPosition: 1000, nextPosition: 2000 });
      expect(result.position).toBe(1500);
      expect(result.needsRebalance).toBe(false);
    });

    it('handles floating point midpoints rounded to 4 decimals', () => {
      const result = calculateFractionalPosition({ prevPosition: 1000.5, nextPosition: 1001.0 });
      expect(result.position).toBe(1000.75);
      expect(result.needsRebalance).toBe(false);
    });

    it('detects when the gap is smaller than MIN_POSITION_GAP', () => {
      const result = calculateFractionalPosition({
        prevPosition: 1000.0001,
        nextPosition: 1000.0002, // gap = 0.0001 < 0.0002
      });
      expect(result.needsRebalance).toBe(true);
    });

    it('flags rebalance if midpoint collapses into neighbor due to 4-decimal precision', () => {
      const result = calculateFractionalPosition({
        prevPosition: 1.0001,
        nextPosition: 1.0002,
      });
      expect(result.needsRebalance).toBe(true);
    });

    it('flags rebalance if nextPosition at head is too close to zero', () => {
      const result = calculateFractionalPosition({ nextPosition: 0.00005 });
      expect(result.needsRebalance).toBe(true);
    });

    it('flags rebalance if neighbors are out of order (next <= prev)', () => {
      const result = calculateFractionalPosition({ prevPosition: 2000, nextPosition: 1000 });
      expect(result.needsRebalance).toBe(true);
    });
  });

  describe('generateRebalancedPositions', () => {
    it('generates spaced positions for a list of task IDs', () => {
      const taskIds = ['task-1', 'task-2', 'task-3', 'task-4'];
      const rebalanced = generateRebalancedPositions(taskIds);

      expect(rebalanced).toEqual([
        { id: 'task-1', position: 1000 },
        { id: 'task-2', position: 2000 },
        { id: 'task-3', position: 3000 },
        { id: 'task-4', position: 4000 },
      ]);
    });

    it('handles an empty array', () => {
      const rebalanced = generateRebalancedPositions([]);
      expect(rebalanced).toEqual([]);
    });

    it('allows custom step sizes', () => {
      const taskIds = ['a', 'b'];
      const rebalanced = generateRebalancedPositions(taskIds, 500);
      expect(rebalanced).toEqual([
        { id: 'a', position: 500 },
        { id: 'b', position: 1000 },
      ]);
    });
  });
});
