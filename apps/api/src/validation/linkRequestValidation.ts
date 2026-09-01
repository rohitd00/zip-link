import { z } from "zod";
import type { CreateLinkRequestBody } from "@shared/contracts/linkRequests";
import { ValidationError } from "../domain/applicationErrors";

// This schema only checks the *shape* of the incoming JSON body (correct
// types, not missing). The actual URL/alias/expiry business rules live in
// the domain layer and run afterward, so error messages there can be more
// specific than a generic shape-validation failure.
const createLinkRequestSchema = z.object({
  longUrl: z.string({ required_error: "The destination URL is required." }),
  customAlias: z.string().optional(),
  expiresAt: z.string().optional(),
  duplicateHandling: z.enum(["return_existing", "create_new"]).optional(),
});

export function parseCreateLinkRequestBody(rawRequestBody: unknown): CreateLinkRequestBody {
  const parseResult = createLinkRequestSchema.safeParse(rawRequestBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "The request body is not a valid link creation request.",
      parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "longUrl",
        message: issue.message,
      })),
    );
  }

  return parseResult.data;
}

export interface ParsedListLinksQuery {
  limit: number | null;
  cursor: string | null;
  searchText: string | null;
}

export function parseListLinksQuery(rawQuery: Record<string, unknown>): ParsedListLinksQuery {
  const limitParam = rawQuery.limit;
  const cursorParam = rawQuery.cursor;
  const queryParam = rawQuery.query;

  return {
    limit: typeof limitParam === "string" ? parseLimitParameter(limitParam) : null,
    cursor: typeof cursorParam === "string" && cursorParam.length > 0 ? cursorParam : null,
    searchText: typeof queryParam === "string" && queryParam.length > 0 ? queryParam : null,
  };
}

function parseLimitParameter(rawLimit: string): number {
  const parsedLimit = Number.parseInt(rawLimit, 10);

  if (Number.isNaN(parsedLimit)) {
    throw new ValidationError("The limit query parameter is not a valid number.", [
      { field: "limit", message: "Use a whole number between 1 and 100." },
    ]);
  }

  return parsedLimit;
}
