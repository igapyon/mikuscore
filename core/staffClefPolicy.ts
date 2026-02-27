export const UPPER_STAFF_HOLD_MIN = 55;
export const LOWER_STAFF_HOLD_MAX = 64;
export const STAFF_SPLIT_C4 = 60;
export const STAFF_SPLIT_B3 = 59;

export type StaffNo = 1 | 2;
export type ClefSign = "G" | "F";

export const shouldUseGrandStaffByRange = (keys: number[]): boolean => {
  if (!keys.length) return false;
  const minKey = Math.min(...keys);
  const maxKey = Math.max(...keys);
  return minKey <= UPPER_STAFF_HOLD_MIN && maxKey >= LOWER_STAFF_HOLD_MAX;
};

export const chooseSingleClefByKeys = (keys: number[]): ClefSign => {
  if (!keys.length) return "G";
  const sorted = keys.slice().sort((a, b) => a - b);
  const minKey = sorted[0] ?? STAFF_SPLIT_C4;
  if (minKey >= UPPER_STAFF_HOLD_MIN) return "G";
  const median = sorted[Math.floor(sorted.length / 2)] ?? STAFF_SPLIT_C4;
  return median < STAFF_SPLIT_C4 ? "F" : "G";
};

export const pickStaffByPitchWithHysteresis = (
  midiKey: number,
  previousStaff: StaffNo | null
): StaffNo => {
  if (previousStaff === 1) {
    return midiKey >= UPPER_STAFF_HOLD_MIN ? 1 : 2;
  }
  if (previousStaff === 2) {
    return midiKey <= LOWER_STAFF_HOLD_MAX ? 2 : 1;
  }
  return midiKey >= STAFF_SPLIT_C4 ? 1 : 2;
};

export const pickStaffForClusterWithHysteresis = (
  minClusterKey: number,
  maxClusterKey: number,
  previousStaff: StaffNo | null
): StaffNo => {
  if (previousStaff === 1) {
    return maxClusterKey >= UPPER_STAFF_HOLD_MIN ? 1 : 2;
  }
  if (previousStaff === 2) {
    return minClusterKey <= LOWER_STAFF_HOLD_MAX ? 2 : 1;
  }
  return maxClusterKey >= STAFF_SPLIT_C4 ? 1 : 2;
};

