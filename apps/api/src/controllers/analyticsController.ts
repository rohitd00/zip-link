import type { Request, Response } from "express";
import { getRequiredRouteParam, requireOwnerContext } from "../middleware/routeParams";
import type { AnalyticsService } from "../services/analyticsService";
import { parseAnalyticsQuery } from "../validation/analyticsRequestValidation";

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async getLinkAnalytics(request: Request, response: Response): Promise<void> {
    const ownerContext = requireOwnerContext(request);
    const shortCode = getRequiredRouteParam(request, "code");
    const query = parseAnalyticsQuery(request.query as Record<string, unknown>);

    const analyticsData = await this.analyticsService.getLinkAnalytics(
      ownerContext,
      shortCode,
      query,
      new Date(),
    );

    response.status(200).json({ data: analyticsData });
  }
}
