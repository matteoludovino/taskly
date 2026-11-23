import * as Y from "yjs";
import { cardsIn, sortedColumns, uuidv7, type BoardState, type Focus, type Operation } from "@taskly/shared";
import type { FastifyBaseLogger } from "fastify";
import type { BoardStore } from "../boards/store.ts";
import type { DocHub } from "../collab/hub.ts";
import { LocalDocClient } from "../collab/local-client.ts";
import { FIELD } from "../collab/text.ts";
import type { Rooms } from "../realtime/rooms.ts";

export interface TeammateOptions {
  /** Pause between actions, in ms (a random value in this range). */
  pauseMs: [number, number];
  /** Time between keystrokes when typing. */
  keystrokeMs: [number, number];
  /** How long a card shows "dragging" before it moves. */
  dragMs: number;
  /** Chance that an action is writing in a description rather than moving a card. */
  typeChance: number;
}

const NOTES = [
  "Lembrar de testar com a internet lenta.",
  "Combinei com o suporte de olhar isso amanhã cedo.",
  "Deixei as capturas de tela na pasta do projeto.",
  "Se travar de novo, anotar o modelo do aparelho.",
  "Vale avisar o time quando sair a versão.",
];

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(Math.random() * items.length)];

/**
 * The simulated teammate of one demo board: while someone is looking, every few seconds she moves a card
 * along (showing "dragging" first) or writes a line in a description, through the same paths a person's
 * changes take. She leaves alone the cards people are busy with.
 */
class Teammate {
  private running = true;
  private focus: Focus | null = null;
  private readonly member;

  constructor(
    private readonly boardId: string,
    private readonly me: { id: string; name: string; color: string },
    private readonly deps: {
      store: BoardStore;
      docs: DocHub;
      rooms: Rooms;
      announce: () => void;
      log: FastifyBaseLogger;
    },
    private readonly options: TeammateOptions,
  ) {
    // She shows up in presence like anyone (a member that receives nothing).
    const currentFocus = () => this.focus;
    this.member = {
      boardId,
      participantId: me.id,
      virtual: true as const,
      get focus() {
        return currentFocus();
      },
      sendRaw() {},
    };
    deps.rooms.join(this.member);
    deps.announce();
    void this.loop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.deps.rooms.leave(this.member);
    this.deps.announce();
  }

  private setFocus(focus: Focus | null) {
    this.focus = focus;
    this.deps.announce();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async loop() {
    while (this.running) {
      await this.sleep(between(this.options.pauseMs));
      if (!this.running) return;
      try {
        const board = await this.deps.store.get(this.boardId);
        if (!board) return this.stop();
        if (Math.random() < this.options.typeChance) await this.write(board);
        else await this.move(board);
      } catch (error) {
        this.deps.log.warn({ err: error, boardId: this.boardId }, "simulated teammate stumbled");
        this.setFocus(null);
      }
    }
  }

  /** Cards nobody (else) is editing or dragging right now. */
  private free(board: BoardState) {
    const busy = new Set(
      this.deps.rooms
        .activity(this.boardId)
        .filter((a) => a.participantId !== this.me.id)
        .map((a) => a.cardId),
    );
    return Object.values(board.cards).filter((card) => !busy.has(card.id));
  }

  /** Moves a card one column along (ticking it off when it reaches the last); reopens one if all are done. */
  private async move(board: BoardState) {
    const columns = sortedColumns(board);
    const last = columns.at(-1);
    if (!last || columns.length < 2) return;
    const free = this.free(board);
    const open = free.filter((card) => card.columnId !== last.id);
    const card = pick(open) ?? pick(free);
    if (!card) return;
    const here = columns.findIndex((c) => c.id === card.columnId);
    const to = card.columnId === last.id ? columns[0]! : columns[here + 1]!;

    this.setFocus({ cardId: card.id, mode: "dragging" });
    await this.sleep(this.options.dragMs);
    if (!this.running) return this.setFocus(null);
    const ops: Operation[] = [
      {
        type: "card.move",
        cardId: card.id,
        toColumnId: to.id,
        afterId: cardsIn(board, to.id).at(-1)?.id ?? null,
        beforeId: null,
      },
    ];
    if (to.id === last.id && !card.completed)
      ops.push({ type: "card.update", cardId: card.id, change: { field: "completed", value: true } });
    if (to.id === columns[0]!.id && card.completed)
      ops.push({ type: "card.update", cardId: card.id, change: { field: "completed", value: false } });
    for (const op of ops) await this.deps.store.apply(this.boardId, this.me.id, { clientOpId: uuidv7(), op });
    this.setFocus(null);
  }

  /** Opens a card's description and types a line at the end, one key at a time, cursor and all. */
  private async write(board: BoardState) {
    const card = pick(this.free(board).filter((c) => !c.completed));
    if (!card) return;
    this.setFocus({ cardId: card.id, mode: "editing" });
    const client = new LocalDocClient(this.deps.docs, this.boardId, this.me.id, card.id, {
      name: this.me.name,
      color: this.me.color,
    });
    try {
      if (!(await client.open())) return;
      const fragment = client.doc.getXmlFragment(FIELD);
      const paragraph = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      paragraph.insert(0, [text]);
      fragment.insert(fragment.length, [paragraph]);
      const note = pick(NOTES)!;
      for (let i = 0; i < note.length && this.running; i++) {
        text.insert(i, note[i]!);
        const position = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, i + 1));
        client.awareness.setLocalStateField("cursor", { anchor: position, head: position });
        await this.sleep(between(this.options.keystrokeMs));
      }
      await this.sleep(800);
    } finally {
      await client.close();
      this.setFocus(null);
    }
  }
}

/** Starts a board's teammate when its first person connects, stops it when the last one leaves. */
export class TeammateDirector {
  private readonly teammates = new Map<string, Teammate>();

  constructor(
    private readonly deps: {
      store: BoardStore;
      docs: DocHub;
      rooms: Rooms;
      announce: (boardId: string) => void;
      log: FastifyBaseLogger;
    },
    private readonly options: TeammateOptions,
  ) {}

  /** Call whenever someone joins or leaves a board. */
  async update(boardId: string): Promise<void> {
    const people = this.deps.rooms.humans(boardId);
    const running = this.teammates.get(boardId);
    if (people === 0) {
      running?.stop();
      this.teammates.delete(boardId);
      return;
    }
    if (running) return;
    const board = await this.deps.store.get(boardId);
    const me = board && Object.values(board.participants).find((p) => p.simulated);
    if (!me || this.teammates.has(boardId) || this.deps.rooms.humans(boardId) === 0) return;
    this.teammates.set(
      boardId,
      new Teammate(boardId, me, { ...this.deps, announce: () => this.deps.announce(boardId) }, this.options),
    );
  }

  stopAll(): void {
    this.teammates.forEach((teammate) => teammate.stop());
    this.teammates.clear();
  }
}
