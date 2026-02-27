export type BeamGroupState = "begin" | "continue" | "end";
export type BeamExplicitMode = "begin" | "mid";

export type BeamAssignment = {
  state: BeamGroupState;
  levels: number;
};

type ComputeBeamAssignmentOptions = {
  splitAtBeatBoundaryWhenImplicit?: boolean;
};

type BeamEventInfo = {
  timed: boolean;
  chord: boolean;
  grace: boolean;
  durationDiv: number;
  levels: number;
  explicitMode?: BeamExplicitMode;
};

const isBeamableTimedEvent = (info: BeamEventInfo | undefined): boolean => {
  if (!info || !info.timed || info.grace) return false;
  return info.levels > 0;
};

export const computeBeamAssignments = <T>(
  events: T[],
  beatDiv: number,
  resolveInfo: (event: T) => BeamEventInfo,
  options: ComputeBeamAssignmentOptions = {}
): Map<number, BeamAssignment> => {
  const assignmentByIndex = new Map<number, BeamAssignment>();
  const infos = events.map((event) => resolveInfo(event));

  const flushGroup = (indices: number[]): void => {
    const chordIndices = indices.filter((idx) => {
      const info = infos[idx];
      return info && info.chord && !info.grace;
    });
    if (chordIndices.length < 2) return;
    for (let gi = 0; gi < chordIndices.length; gi += 1) {
      const idx = chordIndices[gi];
      const info = infos[idx];
      if (!info || info.levels <= 0) continue;
      const state: BeamGroupState = gi === 0 ? "begin" : (gi === chordIndices.length - 1 ? "end" : "continue");
      assignmentByIndex.set(idx, { state, levels: info.levels });
    }
  };

  const hasExplicitBeamMode = infos.some(
    (info) => info.timed && (info.explicitMode === "begin" || info.explicitMode === "mid")
  );
  if (!hasExplicitBeamMode) {
    let currentGroup: number[] = [];
    let cursorDiv = 0;
    const resolvedBeatDiv = Math.max(1, Math.round(beatDiv));
    const splitAtBeatBoundaryWhenImplicit = options.splitAtBeatBoundaryWhenImplicit === true;
    for (let i = 0; i < infos.length; i += 1) {
      const info = infos[i];
      if (splitAtBeatBoundaryWhenImplicit && info.timed) {
        const startsAtBeatBoundary = cursorDiv > 0 && cursorDiv % resolvedBeatDiv === 0;
        if (startsAtBeatBoundary) {
          flushGroup(currentGroup);
          currentGroup = [];
        }
      }
      if (!info.chord || !isBeamableTimedEvent(info)) {
        flushGroup(currentGroup);
        currentGroup = [];
        if (info.timed) cursorDiv += Math.max(0, info.durationDiv);
        continue;
      }
      currentGroup.push(i);
      if (info.timed) cursorDiv += Math.max(0, info.durationDiv);
    }
    flushGroup(currentGroup);
    return assignmentByIndex;
  }

  let activeGroup: number[] = [];
  let cursorDiv = 0;
  const resolvedBeatDiv = Math.max(1, Math.round(beatDiv));
  for (let i = 0; i < infos.length; i += 1) {
    const info = infos[i];
    if (!info.timed) {
      flushGroup(activeGroup);
      activeGroup = [];
      continue;
    }
    const startsAtBeatBoundary = cursorDiv > 0 && cursorDiv % resolvedBeatDiv === 0;
    if (startsAtBeatBoundary) {
      flushGroup(activeGroup);
      activeGroup = [];
    }
    if (!isBeamableTimedEvent(info)) {
      flushGroup(activeGroup);
      activeGroup = [];
      continue;
    }
    if (info.explicitMode === "begin") {
      flushGroup(activeGroup);
      activeGroup = [i];
      cursorDiv += Math.max(0, info.durationDiv);
      continue;
    }
    if (info.explicitMode === "mid") {
      if (!activeGroup.length) {
        const prev = i > 0 ? infos[i - 1] : undefined;
        activeGroup = isBeamableTimedEvent(prev) ? [i - 1, i] : [i];
      } else {
        activeGroup.push(i);
      }
      cursorDiv += Math.max(0, info.durationDiv);
      continue;
    }
    if (activeGroup.length) activeGroup.push(i);
    else activeGroup = [i];
    cursorDiv += Math.max(0, info.durationDiv);
  }
  flushGroup(activeGroup);
  return assignmentByIndex;
};
