import type { Request, Response } from "express";
import { isPlausibleShortCodeShape } from "../domain/shortCodeShapeValidation";
import { logger } from "../observability/logger";
import type { ClickEventPublisher } from "../queue/clickEventPublisher";
import type { RedirectService } from "../services/redirectService";
import { renderLinkExpiredHtmlPage, renderLinkUnavailableHtmlPage } from "../views/publicErrorPage";

/**
 * Handles the public GET /:code route. This is the most latency-sensitive
 * handler in the project: it must resolve a link and respond without
 * performing any analytics parsing, enrichment, or aggregation work. See
 * Rule A-01 in project-rules.md. It is allowed to build a small job
 * payload and hand it to the queue publisher — nothing more.
 */
export class RedirectController {
  constructor(
    private readonly redirectService: RedirectService,
    private readonly clickEventPublisher: ClickEventPublisher,
  ) {}

  async handleRedirect(request: Request, response: Response): Promise<void> {
    const rawShortCode = request.params.code;
    const shortCode = typeof rawShortCode === "string" ? rawShortCode : "";

    if (!isPlausibleShortCodeShape(shortCode)) {
      this.sendNotFoundResponse(request, response);
      return;
    }

    const resolution = await this.redirectService.resolveShortCode(shortCode, new Date());

    // This one log line is how the product metric "cache hit ratio" (see
    // product-requirements-document.md Section 11) is measured: count
    // requests by cacheResult and divide.
    logger.info("Resolved a redirect request.", {
      shortCode,
      outcome: resolution.outcome,
      cacheResult: resolution.cacheResult,
    });

    if (resolution.outcome === "not_found") {
      this.sendNotFoundResponse(request, response);
      return;
    }

    if (resolution.outcome === "expired") {
      this.sendExpiredResponse(request, response);
      return;
    }

    const publishOutcome = await this.clickEventPublisher.publish({
      linkId: resolution.linkId,
      shortCode,
      occurredAt: new Date(),
      referrer: request.headers.referer ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      // By default (TRUST_PROXY_HOPS=0) request.ip is the direct socket
      // address, not an attacker-controllable header — see app.ts's
      // `app.set("trust proxy", ...)` comment for why that matters, per
      // Rule S-02. A deployment behind a real reverse proxy sets
      // TRUST_PROXY_HOPS to the actual number of hops so this correctly
      // becomes the real visitor's address instead of the proxy's own.
      clientIpAddress: request.ip ?? null,
    });

    logger.info("Attempted to publish a click-analytics event.", {
      shortCode,
      publishOutcome,
    });

    response.redirect(resolution.redirectStatusCode, resolution.destinationUrl);
  }

  private sendNotFoundResponse(request: Request, response: Response): void {
    if (clientPrefersJson(request)) {
      response.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "This link is unavailable.",
          requestId: request.requestId,
        },
      });
      return;
    }

    response.status(404).type("html").send(renderLinkUnavailableHtmlPage());
  }

  private sendExpiredResponse(request: Request, response: Response): void {
    if (clientPrefersJson(request)) {
      response.status(410).json({
        error: {
          code: "LINK_EXPIRED",
          message: "This link has expired.",
          requestId: request.requestId,
        },
      });
      return;
    }

    response.status(410).type("html").send(renderLinkExpiredHtmlPage());
  }
}

function clientPrefersJson(request: Request): boolean {
  const acceptHeader = request.headers.accept ?? "";
  return acceptHeader.includes("application/json");
}
