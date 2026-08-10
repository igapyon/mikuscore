/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScoreCore } from "../../core/ScoreCore";
import type { CoreCommand, DispatchResult } from "../../core/interfaces";
import { getDurationValue, getVoiceText, parseXml, reindexNodeIds } from "../../core/xmlUtils";

export type MusicXmlStateSummary = {
  kind: "musicxml_state_summary";
  title: string | null;
  part_count: number;
  measure_count: number;
  measure_numbers: string[];
  voices: string[];
};

export type MusicXmlMeasureNoteSelector = {
  part_id: string | null;
  measure_number: string;
  measure_note_index: number;
  voice: string | null;
  voice_note_index: number | null;
};

export type MusicXmlMeasureInspection = {
  kind: "musicxml_measure_inspection";
  measure_number: string;
  measures: Array<{
    part_id: string | null;
    note_count: number;
    notes: Array<{
      node_id: string | null;
      selector: MusicXmlMeasureNoteSelector;
      voice: string | null;
      duration: number | null;
      is_rest: boolean;
      pitch: { step: string; alter: number | null; octave: number } | null;
    }>;
  }>;
};

export type MusicXmlCommandOutcome = {
  kind: "musicxml_command_validation" | "musicxml_command_apply";
  ok: boolean;
  dirty_changed: boolean;
  changed_node_ids: string[];
  affected_measure_numbers: string[];
  warnings: DispatchResult["warnings"];
  diagnostics: DispatchResult["diagnostics"];
};

export type MusicXmlCommandApplication = MusicXmlCommandOutcome & {
  xml: string;
};

export type MusicXmlStateDiff = {
  kind: "musicxml_state_diff";
  changed: boolean;
  changed_fields: string[];
  changed_measure_numbers: string[];
  changed_measures: Array<{
    part_id: string | null;
    measure_number: string;
    before_note_count: number;
    after_note_count: number;
  }>;
  before: MusicXmlStateDiffSummary;
  after: MusicXmlStateDiffSummary;
};

type IndexedMeasureNote = {
  nodeId: string;
  selector: Omit<MusicXmlMeasureNoteSelector, "voice_note_index"> & {
    voice_note_index: number;
  };
};

type MusicXmlStateDiffSummary = {
  title: string | null;
  part_count: number;
  measure_count: number;
  note_count: number;
  measure_numbers: string[];
};

const buildIndexedMeasureNotes = (xmlText: string): IndexedMeasureNote[] => {
  const doc = parseXml(xmlText);
  const nodeToId = new WeakMap<Node, string>();
  const idToNode = new Map<string, Element>();
  let sequence = 0;
  reindexNodeIds(doc, nodeToId, idToNode, () => {
    sequence += 1;
    return `n${sequence}`;
  });

  const indexedNotes: IndexedMeasureNote[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const part = measure.parentElement;
    const partId = part?.getAttribute("id")?.trim() ?? null;
    const measureNumber = measure.getAttribute("number")?.trim() ?? "";
    const voiceNoteCounts = new Map<string, number>();
    for (const [noteIndex, note] of Array.from(measure.querySelectorAll(":scope > note")).entries()) {
      const nodeId = nodeToId.get(note);
      if (!nodeId) continue;
      const voice = getVoiceText(note);
      const voiceKey = voice ?? "__none__";
      const nextVoiceNoteIndex = (voiceNoteCounts.get(voiceKey) ?? 0) + 1;
      voiceNoteCounts.set(voiceKey, nextVoiceNoteIndex);
      indexedNotes.push({
        nodeId,
        selector: {
          part_id: partId,
          measure_number: measureNumber,
          measure_note_index: noteIndex + 1,
          voice,
          voice_note_index: nextVoiceNoteIndex,
        },
      });
    }
  }
  return indexedNotes;
};

export const summarizeMusicXmlState = (xmlText: string): MusicXmlStateSummary => {
  const doc = parseXml(xmlText);
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"));
  const measureNumbers = Array.from(
    new Set(
      measures
        .map((measure) => measure.getAttribute("number")?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
  );
  const voices = Array.from(
    new Set(
      Array.from(doc.querySelectorAll("score-partwise > part > measure > note > voice"))
        .map((voice) => voice.textContent?.trim() ?? "")
        .filter((value) => value.length > 0)
    )
  );
  return {
    kind: "musicxml_state_summary",
    title:
      doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
      doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
      null,
    part_count: parts.length,
    measure_count: measures.length,
    measure_numbers: measureNumbers,
    voices,
  };
};

const commandOutcome = (
  kind: MusicXmlCommandOutcome["kind"],
  result: DispatchResult
): MusicXmlCommandOutcome => ({
  kind,
  ok: result.ok,
  dirty_changed: result.dirtyChanged,
  changed_node_ids: result.changedNodeIds,
  affected_measure_numbers: result.affectedMeasureNumbers,
  warnings: result.warnings,
  diagnostics: result.diagnostics,
});

export const validateMusicXmlCommand = (
  xmlText: string,
  command: CoreCommand
): MusicXmlCommandOutcome => {
  const core = new ScoreCore();
  core.load(xmlText);
  return commandOutcome("musicxml_command_validation", core.dispatch(command));
};

export const applyMusicXmlCommand = (
  xmlText: string,
  command: CoreCommand
): MusicXmlCommandApplication => {
  const core = new ScoreCore();
  core.load(xmlText);
  const outcome = commandOutcome("musicxml_command_apply", core.dispatch(command));
  if (!outcome.ok) {
    return { ...outcome, xml: xmlText };
  }
  const saved = core.save();
  if (!saved.ok) {
    return {
      ...outcome,
      ok: false,
      diagnostics: saved.diagnostics,
      xml: xmlText,
    };
  }
  return { ...outcome, xml: saved.xml };
};

export const inspectMusicXmlMeasure = (
  xmlText: string,
  measureNumber: string
): MusicXmlMeasureInspection => {
  const indexedNotes = buildIndexedMeasureNotes(xmlText);
  const doc = parseXml(xmlText);
  const matchingMeasures = Array.from(doc.querySelectorAll("score-partwise > part > measure"))
    .filter((measure) => (measure.getAttribute("number")?.trim() ?? "") === measureNumber);

  return {
    kind: "musicxml_measure_inspection",
    measure_number: measureNumber,
    measures: matchingMeasures.map((measure) => {
      const part = measure.parentElement;
      const partId = part?.getAttribute("id")?.trim() ?? null;
      const notes = Array.from(measure.querySelectorAll(":scope > note")).map((note, noteIndex) => {
        const indexed = indexedNotes.find((item) =>
          item.selector.part_id === partId &&
          item.selector.measure_number === measureNumber &&
          item.selector.measure_note_index === noteIndex + 1
        );
        const voice = getVoiceText(note);
        const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? null;
        const octaveText = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? null;
        const alterText = note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? null;
        const alter = alterText === null ? null : Number(alterText);
        return {
          node_id: indexed?.nodeId ?? null,
          selector: indexed?.selector ?? {
            part_id: partId,
            measure_number: measureNumber,
            measure_note_index: noteIndex + 1,
            voice,
            voice_note_index: null,
          },
          voice,
          duration: getDurationValue(note),
          is_rest: note.querySelector(":scope > rest") !== null,
          pitch: step && octaveText
            ? {
              step,
              alter: Number.isFinite(alter) ? alter : null,
              octave: Number(octaveText),
            }
            : null,
        };
      });
      return {
        part_id: partId,
        note_count: notes.length,
        notes,
      };
    }),
  };
};

const buildMusicXmlStateSummaryObject = (doc: Document): MusicXmlStateDiffSummary => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"));
  const notes = Array.from(doc.querySelectorAll("score-partwise > part > measure > note"));
  return {
    title:
      doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
      doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
      null,
    part_count: parts.length,
    measure_count: measures.length,
    note_count: notes.length,
    measure_numbers: Array.from(
      new Set(
        measures
          .map((measure) => measure.getAttribute("number")?.trim() ?? "")
          .filter((value) => value.length > 0)
      )
    ),
  };
};

const buildMeasureDiffSignatures = (doc: Document) => {
  return Array.from(doc.querySelectorAll("score-partwise > part > measure")).map((measure) => {
    const partId = measure.parentElement?.getAttribute("id")?.trim() ?? null;
    const measureNumber = measure.getAttribute("number")?.trim() ?? "";
    const noteSummary = Array.from(measure.querySelectorAll(":scope > note")).map((note) => {
      const voice = getVoiceText(note);
      const duration = getDurationValue(note);
      const isRest = note.querySelector(":scope > rest") !== null;
      const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? null;
      const octave = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? null;
      const alter = note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? null;
      return {
        voice,
        duration,
        is_rest: isRest,
        pitch: isRest || !step || !octave
          ? null
          : {
            step,
            alter: alter == null ? null : Number(alter),
            octave: Number(octave),
          },
      };
    });
    return {
      part_id: partId,
      measure_number: measureNumber,
      note_count: noteSummary.length,
      signature: JSON.stringify(noteSummary),
    };
  });
};

export const diffMusicXmlState = (
  beforeXml: string,
  afterXml: string
): MusicXmlStateDiff => {
  const beforeDoc = parseXml(beforeXml);
  const afterDoc = parseXml(afterXml);
  const beforeSummary = buildMusicXmlStateSummaryObject(beforeDoc);
  const afterSummary = buildMusicXmlStateSummaryObject(afterDoc);
  const beforeMeasures = buildMeasureDiffSignatures(beforeDoc);
  const afterMeasures = buildMeasureDiffSignatures(afterDoc);

  const changedFields = Object.keys(beforeSummary).filter((key) => {
    return JSON.stringify(beforeSummary[key as keyof typeof beforeSummary]) !==
      JSON.stringify(afterSummary[key as keyof typeof afterSummary]);
  });

  const beforeMeasureMap = new Map(beforeMeasures.map((item) => [`${item.part_id ?? ""}:${item.measure_number}`, item]));
  const afterMeasureMap = new Map(afterMeasures.map((item) => [`${item.part_id ?? ""}:${item.measure_number}`, item]));
  const changedMeasureKeys = Array.from(new Set([...beforeMeasureMap.keys(), ...afterMeasureMap.keys()])).filter((key) => {
    const beforeItem = beforeMeasureMap.get(key);
    const afterItem = afterMeasureMap.get(key);
    if (!beforeItem || !afterItem) return true;
    return beforeItem.signature !== afterItem.signature;
  });

  return {
    kind: "musicxml_state_diff",
    changed: changedFields.length > 0 || changedMeasureKeys.length > 0,
    changed_fields: changedFields,
    changed_measure_numbers: changedMeasureKeys
      .map((key) => afterMeasureMap.get(key) ?? beforeMeasureMap.get(key))
      .filter((item): item is NonNullable<typeof item> => item != null)
      .map((item) => item.measure_number),
    changed_measures: changedMeasureKeys.map((key) => {
      const beforeItem = beforeMeasureMap.get(key);
      const afterItem = afterMeasureMap.get(key);
      return {
        part_id: afterItem?.part_id ?? beforeItem?.part_id ?? null,
        measure_number: afterItem?.measure_number ?? beforeItem?.measure_number ?? "",
        before_note_count: beforeItem?.note_count ?? 0,
        after_note_count: afterItem?.note_count ?? 0,
      };
    }),
    before: beforeSummary,
    after: afterSummary,
  };
};
