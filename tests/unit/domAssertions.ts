import { expect } from "vitest";

export const expectXmlStructurallyEqual = (a: string, b: string): void => {
  const pa = new DOMParser().parseFromString(a, "application/xml");
  const pb = new DOMParser().parseFromString(b, "application/xml");
  const ca = canonicalNode(pa.documentElement);
  const cb = canonicalNode(pb.documentElement);
  expect(ca).toBe(cb);
};

const canonicalNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent?.trim() ?? "";
    return t ? `#text(${t})` : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const attrs = Array.from(el.attributes)
    .map((a) => `${a.name}=${a.value}`)
    .sort()
    .join(";");
  const children = Array.from(el.childNodes)
    .map(canonicalNode)
    .filter((x) => x.length > 0)
    .join(",");
  return `<${el.tagName}${attrs ? " " + attrs : ""}>${children}</${el.tagName}>`;
};
