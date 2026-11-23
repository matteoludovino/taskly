import * as Y from "yjs";
import { uuidv7, type Operation, type Priority } from "@taskly/shared";
import { FIELD } from "../collab/text.ts";

export const DEMO_TITLE = "Lançamento do app (demo)";
export const TEAMMATE = { name: "Bia (simulada)", color: "#db2777" } as const;
export const VISITOR = { name: "Visitante", color: "#2563eb" } as const;

interface CardSeed {
  title: string;
  priority?: Priority;
  /** Days from today. */
  due?: number;
  completed?: boolean;
  description?: { paragraphs: string[]; bullets?: string[] };
}

const COLUMNS: { title: string; cards: CardSeed[] }[] = [
  {
    title: "A fazer",
    cards: [
      { title: "Escrever as notas da versão", due: 3 },
      { title: "Revisar os textos da loja de apps", priority: "low" },
      {
        title: "Testar em um Android antigo",
        priority: "high",
        due: 1,
        description: {
          paragraphs: ["Aparelhos que a Bia separou para o teste:"],
          bullets: [
            "Moto G7 (Android 10)",
            "Galaxy A10 (Android 11)",
            "Conferir login, notificações e modo offline",
          ],
        },
      },
    ],
  },
  {
    title: "Fazendo",
    cards: [
      { title: "Ajustar o onboarding", priority: "high" },
      { title: "Corrigir o login com Google", priority: "high", due: -1 },
    ],
  },
  {
    title: "Feito",
    cards: [
      { title: "Desenhar o ícone novo", completed: true },
      { title: "Configurar o monitoramento", priority: "low", completed: true },
    ],
  },
];

const isoDay = (from: Date, days: number) =>
  new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** The operations that build the demo board, and the descriptions to write afterwards (by card id). */
export function demoBoard(today = new Date()): { ops: Operation[]; descriptions: Map<string, Uint8Array> } {
  const ops: Operation[] = [];
  const descriptions = new Map<string, Uint8Array>();
  for (const column of COLUMNS) {
    const columnId = uuidv7();
    ops.push({ type: "column.create", columnId, title: column.title });
    for (const seed of column.cards) {
      const cardId = uuidv7();
      ops.push({ type: "card.create", cardId, columnId, title: seed.title });
      if (seed.priority && seed.priority !== "med") {
        ops.push({ type: "card.update", cardId, change: { field: "priority", value: seed.priority } });
      }
      if (seed.due !== undefined) {
        ops.push({
          type: "card.update",
          cardId,
          change: { field: "dueDate", value: isoDay(today, seed.due) },
        });
      }
      if (seed.completed)
        ops.push({ type: "card.update", cardId, change: { field: "completed", value: true } });
      if (seed.description) descriptions.set(cardId, describe(seed.description));
    }
  }
  return { ops, descriptions };
}

/** A description in the editor's document shape (paragraphs, then a bullet list). */
function describe({ paragraphs, bullets = [] }: { paragraphs: string[]; bullets?: string[] }): Uint8Array {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment(FIELD);
  const paragraph = (text: string) => {
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    return p;
  };
  fragment.insert(0, paragraphs.map(paragraph));
  if (bullets.length) {
    const list = new Y.XmlElement("bulletList");
    list.insert(
      0,
      bullets.map((text) => {
        const item = new Y.XmlElement("listItem");
        item.insert(0, [paragraph(text)]);
        return item;
      }),
    );
    fragment.insert(fragment.length, [list]);
  }
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
