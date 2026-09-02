import http from "node:http";
import { logger } from "./observability/logger";

/**
 * The analytics worker has no HTTP endpoints of its own — it only consumes
 * a queue. This server exists purely so the worker can be deployed as a
 * Render free-tier "Web Service" (Render's free Background Worker plan was
 * discontinued; a free Web Service just needs to bind $PORT and answer
 * something). It has no bearing on local development or docker-compose,
 * where PORT is never set for this process, so it never starts there.
 */
export function startHealthServerIfPortConfigured(): http.Server | null {
  const port = process.env.PORT;

  if (port === undefined) {
    return null;
  }

  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
  });

  server.listen(Number.parseInt(port, 10), () => {
    logger.info("Worker health server listening.", { port });
  });

  return server;
}
