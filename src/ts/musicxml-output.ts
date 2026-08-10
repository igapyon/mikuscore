/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseMusicXmlDocument, serializeMusicXmlDocument } from "./musicxml-io";

export type MksMetadataOutputSettings = {
  keepMeta: boolean;
  keepSrc: boolean;
  keepDbg: boolean;
};

const shouldRemoveMksField = (
  fieldName: string,
  settings: MksMetadataOutputSettings
): boolean => {
  const lowered = fieldName.trim().toLowerCase();
  if (!lowered.startsWith("mks:")) return false;
  if (lowered.startsWith("mks:meta:")) return !settings.keepMeta;
  if (lowered.startsWith("mks:src:")) return !settings.keepSrc;
  if (lowered.startsWith("mks:dbg:")) return !settings.keepDbg;
  return false;
};

export const stripMetadataFromMusicXml = (
  xml: string,
  settings: MksMetadataOutputSettings
): string => {
  if (settings.keepMeta && settings.keepSrc && settings.keepDbg) return xml;
  const doc = parseMusicXmlDocument(xml);
  if (!doc) return xml;

  const fields = Array.from(
    doc.querySelectorAll(
      'part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:"]'
    )
  );
  for (const field of fields) {
    const name = field.getAttribute("name") ?? "";
    if (shouldRemoveMksField(name, settings)) field.remove();
  }

  for (const miscellaneous of Array.from(
    doc.querySelectorAll("part > measure > attributes > miscellaneous")
  )) {
    if (!miscellaneous.querySelector("miscellaneous-field")) miscellaneous.remove();
  }
  for (const attributes of Array.from(doc.querySelectorAll("part > measure > attributes"))) {
    if (attributes.children.length === 0) attributes.remove();
  }
  return serializeMusicXmlDocument(doc);
};

export const summarizeImportedDiagWarnings = (xml: string): string => {
  const doc = parseMusicXmlDocument(xml);
  if (!doc) return "";

  let overfullReflowCount = 0;
  let parserWarningCount = 0;
  const fields = Array.from(doc.querySelectorAll('miscellaneous-field[name^="mks:diag:"]'));
  for (const field of fields) {
    const name = (field.getAttribute("name") ?? "").trim().toLowerCase();
    if (name === "mks:diag:count") continue;
    const payload = field.textContent?.trim() ?? "";
    const codeMatch = payload.match(/(?:^|;)code=([^;]+)/);
    const code = (codeMatch?.[1] ?? "").trim().toUpperCase();
    if (code === "OVERFULL_REFLOWED") overfullReflowCount += 1;
    if (code === "ABC_IMPORT_WARNING") parserWarningCount += 1;
  }

  const summaries: string[] = [];
  if (overfullReflowCount > 0) {
    summaries.push(`ABC overfull auto-reflow: ${overfullReflowCount}`);
  }
  if (parserWarningCount > 0) {
    summaries.push(`ABC parser warnings: ${parserWarningCount}`);
  }
  return summaries.join(" / ");
};
