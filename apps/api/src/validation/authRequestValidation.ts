import { z } from "zod";
import type {
  LoginRequestBody,
  RequestPasswordResetRequestBody,
  ResetPasswordRequestBody,
  SignupRequestBody,
} from "@shared/contracts/auth";
import { ValidationError } from "../domain/applicationErrors";

// As with linkRequestValidation.ts, these schemas only check the shape of
// the request body. The real email-format/password-length rules live in
// domain/authValidation.ts and run afterward inside AuthService.

const signupRequestSchema = z.object({
  email: z.string({ required_error: "Email is required." }),
  password: z.string({ required_error: "Password is required." }),
  displayName: z.string().optional(),
});

const loginRequestSchema = z.object({
  email: z.string({ required_error: "Email is required." }),
  password: z.string({ required_error: "Password is required." }),
});

const requestPasswordResetSchema = z.object({
  email: z.string({ required_error: "Email is required." }),
});

const resetPasswordSchema = z.object({
  token: z.string({ required_error: "Reset token is required." }),
  newPassword: z.string({ required_error: "New password is required." }),
});

function parseWithSchema<T>(schema: z.ZodType<T>, rawRequestBody: unknown, label: string): T {
  const parseResult = schema.safeParse(rawRequestBody);

  if (!parseResult.success) {
    throw new ValidationError(
      `The request body is not a valid ${label} request.`,
      parseResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    );
  }

  return parseResult.data;
}

export function parseSignupRequestBody(rawRequestBody: unknown): SignupRequestBody {
  return parseWithSchema(signupRequestSchema, rawRequestBody, "signup");
}

export function parseLoginRequestBody(rawRequestBody: unknown): LoginRequestBody {
  return parseWithSchema(loginRequestSchema, rawRequestBody, "login");
}

export function parseRequestPasswordResetRequestBody(
  rawRequestBody: unknown,
): RequestPasswordResetRequestBody {
  return parseWithSchema(requestPasswordResetSchema, rawRequestBody, "password-reset-request");
}

export function parseResetPasswordRequestBody(rawRequestBody: unknown): ResetPasswordRequestBody {
  return parseWithSchema(resetPasswordSchema, rawRequestBody, "password-reset");
}
