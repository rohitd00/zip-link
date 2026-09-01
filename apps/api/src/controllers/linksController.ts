import type { Request, Response } from "express";
import { getRequiredRouteParam, requireOwnerContext } from "../middleware/routeParams";
import type { LinkService } from "../services/linkService";
import {
  parseCreateLinkRequestBody,
  parseListLinksQuery,
} from "../validation/linkRequestValidation";

/**
 * Holds the HTTP-facing handlers for /api/links. Each handler only parses
 * the request, calls the service, and maps the result to a response; all
 * business rules live in LinkService, matching Rule C-03.
 */
export class LinksController {
  constructor(private readonly linkService: LinkService) {}

  async createLink(request: Request, response: Response): Promise<void> {
    const requestBody = parseCreateLinkRequestBody(request.body);
    const ownerContext = requireOwnerContext(request);

    const result = await this.linkService.createLink(ownerContext, requestBody, new Date());

    const httpStatus = result.wasExistingDuplicate ? 200 : 201;
    response.status(httpStatus).json({ data: result.data });
  }

  async listLinks(request: Request, response: Response): Promise<void> {
    const query = parseListLinksQuery(request.query as Record<string, unknown>);
    const ownerContext = requireOwnerContext(request);

    const result = await this.linkService.listOwnedLinks(ownerContext, query, new Date());

    response.status(200).json(result);
  }

  async getOwnedLink(request: Request, response: Response): Promise<void> {
    const ownerContext = requireOwnerContext(request);
    const shortCode = getRequiredRouteParam(request, "code");

    const { link, totalClicks } = await this.linkService.getOwnedLinkDetail(
      ownerContext,
      shortCode,
    );

    response.status(200).json({
      data: {
        shortCode: link.shortCode,
        longUrl: link.longUrl,
        createdAt: link.createdAt.toISOString(),
        expiresAt: link.expiresAt === null ? null : link.expiresAt.toISOString(),
        totalClicks,
      },
    });
  }

  async deleteLink(request: Request, response: Response): Promise<void> {
    const ownerContext = requireOwnerContext(request);
    const shortCode = getRequiredRouteParam(request, "code");

    await this.linkService.deleteOwnedLink(ownerContext, shortCode);

    response.status(204).send();
  }
}
