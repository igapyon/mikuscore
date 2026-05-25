/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type TieType = "start" | "stop";

export type TieState = {
  tieStart: boolean;
  tieStop: boolean;
  tiedStart: boolean;
  tiedStop: boolean;
};

const normalizeTieType = (raw: string | null | undefined): TieType | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "start" || normalized === "stop" ? normalized : null;
};

export const buildMusicXmlTieItemsXml = (state: Pick<TieState, "tieStart" | "tieStop">): string =>
  `${state.tieStop ? '<tie type="stop"/>' : ""}${state.tieStart ? '<tie type="start"/>' : ""}`;

export const buildMusicXmlTiedItemsXml = (state: Pick<TieState, "tiedStart" | "tiedStop">): string =>
  `${state.tiedStop ? '<tied type="stop"/>' : ""}${state.tiedStart ? '<tied type="start"/>' : ""}`;

export const extractMusicXmlTieState = (note: Element): TieState => {
  const state: TieState = {
    tieStart: false,
    tieStop: false,
    tiedStart: false,
    tiedStop: false,
  };
  for (const tie of Array.from(note.querySelectorAll(":scope > tie[type]"))) {
    const type = normalizeTieType(tie.getAttribute("type"));
    if (type === "start") state.tieStart = true;
    if (type === "stop") state.tieStop = true;
  }
  for (const tied of Array.from(note.querySelectorAll(":scope > notations > tied[type]"))) {
    const type = normalizeTieType(tied.getAttribute("type"));
    if (type === "start") state.tiedStart = true;
    if (type === "stop") state.tiedStop = true;
  }
  return state;
};
