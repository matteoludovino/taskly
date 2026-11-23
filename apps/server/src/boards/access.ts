import {
  uuidv7,
  type BoardState,
  type CreateBoardRequest,
  type JoinBoardRequest,
  type ParticipantState,
} from "@taskly/shared";
import { hashSecret, matchesHash, newBoardId, newSecret } from "../auth/secrets.ts";
import type { Db } from "../db.ts";
import type { BoardStore } from "./store.ts";

export const DEFAULT_COLUMNS = ["A fazer", "Fazendo", "Feito"];

export interface Membership {
  participant: ParticipantState;
  /** Goes into the participant's cookie; only its hash is stored. */
  token: string;
}

export async function addParticipant(
  store: BoardStore,
  boardId: string,
  { name, color }: { name: string; color: string },
  { simulated = false } = {},
): Promise<Membership> {
  const participant = { id: uuidv7(), name, color };
  const token = newSecret();
  const payload = {
    participantId: participant.id,
    name,
    color,
    ...(simulated ? { simulated: true as const } : {}),
  };
  // Joining is an event too ("Ana entrou no quadro"), written with the participant row.
  await store.record(boardId, { type: "participant.joined", payload }, participant.id, (db) => [
    db.participant.create({ data: { ...participant, simulated, boardId, tokenHash: hashSecret(token) } }),
  ]);
  return { participant: simulated ? { ...participant, simulated: true } : participant, token };
}

export async function createBoard(
  db: Db,
  store: BoardStore,
  input: CreateBoardRequest,
): Promise<Membership & { boardId: string; key: string }> {
  const boardId = newBoardId();
  const key = newSecret();
  await db.board.create({ data: { id: boardId, keyHash: hashSecret(key), title: input.title } });
  const membership = await addParticipant(store, boardId, input);
  for (const title of DEFAULT_COLUMNS) {
    await store.apply(boardId, membership.participant.id, {
      clientOpId: uuidv7(),
      op: { type: "column.create", columnId: uuidv7(), title },
    });
  }
  return { ...membership, boardId, key };
}

/** Null when the board doesn't exist or the key is wrong (the caller can't tell which). */
export async function joinBoard(
  db: Db,
  store: BoardStore,
  boardId: string,
  input: JoinBoardRequest,
): Promise<Membership | null> {
  const board = await db.board.findUnique({ where: { id: boardId }, select: { keyHash: true } });
  if (!board || !matchesHash(input.key, board.keyHash)) return null;
  return addParticipant(store, boardId, input);
}

export async function findParticipant(
  db: Db,
  boardId: string,
  token: string | undefined,
): Promise<ParticipantState | null> {
  if (!token) return null;
  const row = await db.participant.findUnique({
    where: { tokenHash: hashSecret(token) },
    select: { id: true, name: true, color: true, boardId: true },
  });
  if (!row || row.boardId !== boardId) return null;
  return { id: row.id, name: row.name, color: row.color };
}

export function me(board: BoardState, participant: ParticipantState): ParticipantState {
  return board.participants[participant.id] ?? participant;
}
