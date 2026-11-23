import * as Y from "yjs";

/** The name of the shared fragment the editor binds to (the same on every client). */
export const FIELD = "description";

function textOf(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert: unknown }[])
      .map((d) => (typeof d.insert === "string" ? d.insert : ""))
      .join("");
  }
  if (node instanceof Y.XmlElement) return blocks(node).join("\n");
  return "";
}

function blocks(parent: Y.XmlFragment | Y.XmlElement): string[] {
  const children = parent.toArray();
  // A block holding inline text (a paragraph) is one line; a block holding blocks (a list) is several.
  if (children.every((c) => c instanceof Y.XmlText)) return [children.map(textOf).join("")];
  return children.flatMap((c) => (c instanceof Y.XmlElement ? blocks(c) : [textOf(c)]));
}

/** The plain text of a description document: one line per paragraph or list item. */
export function plainText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment(FIELD);
  if (fragment.length === 0) return "";
  return blocks(fragment).join("\n").trim();
}
