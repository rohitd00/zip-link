import type { Request, Response } from "express";
import { isPlausibleShortCodeShape } from "../domain/shortCodeShapeValidation";
import type { RedirectService } from "../services/redirectService";
import { renderLinkExpiredHtmlPage, renderLinkUnavailableHtmlPage } from "../views/publicErrorPage";

/**
 * Handles the public GET /:code route. This is the most latency-sensitive
 * handler in the project: it must resolve a link and respond without
 * performing any analytics parsing, enrichment, or aggregation work. See
 * Rule A-01 in project-rules.md.
 */
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  async handleRedirect(request: Request, response: Response): Promise<void> {
    const rawShortCode = request.params.code;
    const shortCode = typeof rawShortCode === "string" ? rawShortCode : "";

    if (!isPlausibleShortCodeShape(shortCode)) {
      this.sendNotFoundResponse(request, response);
      return;
    }

    const resolution = await this.redirectService.resolveShortCode(shortCode, new Date());

    if (resolution.outcome === "not_found") {
      this.sendNotFoundResponse(request, response);
      return;
    }

    if (resolution.outcome === "expired") {
      this.sendExpiredResponse(request, response);
      return;
    }

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
