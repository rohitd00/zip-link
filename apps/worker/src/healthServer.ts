import http from "node:http";
import { logger } from "./observability/logger";

/**
 * The analytics worker has no HTTP endpoints of its own — it only consumes
 * a queue. This server exists purely so the worker can be deployed as a
 * Render free-tier "Web Service" (Render's free Background Worker plan was
 * discontinued; a free Web Service just needs to bind $PORT and answer
 * something).
 *
 * Deliberately gated on its own explicit opt-in flag
 * (ENABLE_WORKER_HTTP_HEALTH_SERVER), not on PORT being present, even
 * though PORT is the value actually bound once enabled: local development
 * and docker-compose share one root .env file across every process, and
 * that file's PORT=3000 is meant only for the API — reacting to PORT alone
 * here would make the worker try to bind the API's own port and crash.
 * Matches this project's existing pattern for deployment-only behavior
 * (Google OAuth, Resend, TRUST_PROXY_HOPS): off by default, explicit
 * opt-in only where it's actually needed.
 */
export function startHealthServerIfEnabled(): http.Server | null {
  const isEnabled = process.env.ENABLE_WORKER_HTTP_HEALTH_SERVER === "true";

  if (!isEnabled) {
    return null;
  }

  const port = process.env.PORT;

  if (port === undefined) {
    logger.error(
      "ENABLE_WORKER_HTTP_HEALTH_SERVER is true but PORT is not set; the health server will not start.",
    );
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
