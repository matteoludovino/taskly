import {
  BOARD_ID,
  createBoardRequest,
  envelope,
  joinBoardRequest,
  type BoardSnapshot,
  type CreateBoardResponse,
  type OpResult,
  type ParticipantState,
} from "@taskly/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { HttpError, invalid, notFound } from "../http/errors.ts";
import { createBoard, findParticipant, joinBoard, me, type Membership } from "./access.ts";

const COOKIE = "taskly_participant";
const NINETY_DAYS = 90 * 24 * 60 * 60;

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalid();
  return parsed.data;
}

function boardIdOf(request: FastifyRequest): string {
  const { boardId } = request.params as { boardId: string };
  if (!BOARD_ID.test(boardId)) throw notFound();
  return boardId;
}

export function registerBoardRoutes(app: FastifyInstance, { secureCookies }: { secureCookies: boolean }) {
  const { db, store } = app;

  // One cookie per board, scoped to that board's API path: being in several boards just means several
  // cookies, and none of them is sent anywhere else.
  function setMembership(reply: FastifyReply, boardId: string, membership: Membership) {
    reply.setCookie(COOKIE, membership.token, {
      path: `/api/boards/${boardId}`,
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: NINETY_DAYS,
    });
  }

  async function participantOf(request: FastifyRequest, boardId: string): Promise<ParticipantState> {
    const participant = await findParticipant(db, boardId, request.cookies[COOKIE]);
    if (!participant) throw new HttpError(401, "not_joined", "Entre no quadro pelo link de convite.");
    return participant;
  }

  app.post(
    "/api/boards",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply): Promise<CreateBoardResponse> => {
      const input = parse(createBoardRequest, request.body);
      const { boardId, key, ...membership } = await createBoard(db, store, input);
      setMembership(reply, boardId, membership);
      reply.status(201);
      return { boardId, key };
    },
  );

  app.post(
    "/api/boards/:boardId/join",
    { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } },
    async (request, reply): Promise<{ participant: ParticipantState }> => {
      const boardId = boardIdOf(request);
      const membership = await joinBoard(db, store, boardId, parse(joinBoardRequest, request.body));
      if (!membership) throw new HttpError(403, "invalid_link", "Este link de convite não é válido.");
      setMembership(reply, boardId, membership);
      return { participant: membership.participant };
    },
  );

  app.get("/api/boards/:boardId", async (request): Promise<BoardSnapshot> => {
    const boardId = boardIdOf(request);
    const participant = await participantOf(request, boardId);
    const board = await store.get(boardId);
    if (!board) throw notFound();
    return { board, me: me(board, participant) };
  });

  app.post("/api/boards/:boardId/ops", async (request): Promise<OpResult> => {
    const boardId = boardIdOf(request);
    const participant = await participantOf(request, boardId);
    return store.apply(boardId, participant.id, parse(envelope, request.body));
  });
}
