import type { CreateBoardResponse } from "@taskly/shared";
import type { FastifyInstance } from "fastify";
import { setParticipantCookie } from "../boards/routes.ts";
import { HttpError } from "../http/errors.ts";
import { createDemo } from "./create.ts";

/** `POST /api/demo`: a fresh demo board for this visitor, who is joined to it at once. */
export function registerDemoRoutes(
  app: FastifyInstance,
  { maxLive, secureCookies }: { maxLive: number; secureCookies: boolean },
) {
  app.post(
    "/api/demo",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (_request, reply): Promise<CreateBoardResponse> => {
      // Demo boards live a day each: cap how many exist at once so a burst can't fill the database.
      const live = await app.db.board.count({ where: { expiresAt: { gt: new Date() } } });
      if (live >= maxLive) {
        throw new HttpError(503, "demo_full", "Muita gente testando agora. Tente de novo em alguns minutos.");
      }
      const { boardId, key, token } = await createDemo(app.db, app.store);
      setParticipantCookie(reply, boardId, token, secureCookies);
      reply.status(201);
      return { boardId, key };
    },
  );
}
