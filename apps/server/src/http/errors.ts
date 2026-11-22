import type { ApiError } from "@taskly/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { BoardNotFound } from "../boards/store.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "board_not_found", "Quadro não encontrado.");
export const invalid = () => new HttpError(400, "invalid", "Dados inválidos.");

export function send(reply: FastifyReply, error: HttpError) {
  const body: ApiError = { error: { code: error.code, message: error.message } };
  return reply.status(error.status).send(body);
}

/** One shape for every error, and nothing internal leaks out of a 500. */
export function installErrors(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return send(reply, error);
    if (error instanceof BoardNotFound) return send(reply, notFound());
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429)
      return send(reply, new HttpError(429, "rate_limited", "Muitas tentativas. Espere um pouco."));
    if (status && status >= 400 && status < 500)
      return send(reply, new HttpError(status, "invalid", "Requisição inválida."));
    request.log.error({ err: error }, "unhandled error");
    return send(reply, new HttpError(500, "internal", "Algo deu errado do nosso lado. Tente de novo."));
  });
  app.setNotFoundHandler((_request, reply) =>
    send(reply, new HttpError(404, "not_found", "Não encontrado.")),
  );
}
