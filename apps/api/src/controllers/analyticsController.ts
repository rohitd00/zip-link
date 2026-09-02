import type { Request, Response } from "express";
import { buildAnalyticsCsv } from "../domain/analyticsCsvExport";
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

  /**
   * Same authorization, validation, and underlying query as
   * getLinkAnalytics above -- this only changes the response's
   * serialization format, not what data is fetched or who can fetch it.
   */
  async exportLinkAnalyticsCsv(request: Request, response: Response): Promise<void> {
    const ownerContext = requireOwnerContext(request);
    const shortCode = getRequiredRouteParam(request, "code");
    const query = parseAnalyticsQuery(request.query as Record<string, unknown>);

    const analyticsData = await this.analyticsService.getLinkAnalytics(
      ownerContext,
      shortCode,
      query,
      new Date(),
    );

    const csv = buildAnalyticsCsv(analyticsData);

    response
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="ziplink-${shortCode}-analytics.csv"`)
      .send(csv);
  }
}
