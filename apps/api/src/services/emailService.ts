import { logger } from "../observability/logger";

const RESEND_API_URL = "https://api.resend.com/emails";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends transactional email (welcome messages, password-reset links)
 * through Resend's plain HTTP API — a single POST request, so this avoids
 * pulling in Resend's own SDK for what is otherwise one `fetch` call.
 *
 * When no API key is configured — the default for local development —
 * this logs what would have been sent instead of failing. That is a
 * deliberate choice, not an oversight: nobody should need a Resend
 * account just to run `npm run dev:api` and sign up for a test account
 * locally, and a missing third-party credential should never be able to
 * break signup/login, only the "email arrives" part of the experience.
 */
export class EmailService {
  constructor(
    private readonly resendApiKey: string | null,
    private readonly fromAddress: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    if (this.resendApiKey === null) {
      logger.info("Email sending is not configured; logging instead of sending.", {
        to: message.to,
        subject: message.subject,
      });
      return;
    }

    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          html: message.html,
        }),
      });

      if (!response.ok) {
        logger.error("Email provider rejected an outgoing email.", {
          to: message.to,
          subject: message.subject,
          statusCode: response.status,
        });
        return;
      }

      logger.info("Sent an email.", { to: message.to, subject: message.subject });
    } catch (thrownError) {
      // A failed email send must never fail the request that triggered
      // it (signup still succeeds even if the welcome email doesn't go
      // out) — the same "this is an enhancement, not the core action"
      // principle already used for the analytics queue publish.
      logger.error("Failed to send an email.", {
        to: message.to,
        subject: message.subject,
        errorMessage: thrownError instanceof Error ? thrownError.message : "Unknown error",
      });
    }
  }

  async sendWelcomeEmail(toAddress: string, displayName: string | null): Promise<void> {
    const greetingName = displayName ?? "there";

    await this.send({
      to: toAddress,
      subject: "Welcome to ZipLink",
      html: `
        <p>Hi ${escapeHtml(greetingName)},</p>
        <p>Your ZipLink account is ready. You can now create short links and see their
        analytics from any device you're signed in on.</p>
        <p>— The ZipLink team</p>
      `,
    });
  }

  async sendPasswordResetEmail(toAddress: string, resetUrl: string): Promise<void> {
    await this.send({
      to: toAddress,
      subject: "Reset your ZipLink password",
      html: `
        <p>We received a request to reset your ZipLink password.</p>
        <p><a href="${escapeHtmlAttribute(resetUrl)}">Reset your password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore
        this email — your password will not be changed.</p>
      `,
    });
  }
}

// Minimal, deliberate escaping for the two places this project ever puts
// dynamic values into an HTML email: a display name in text content, and
// a URL in an href attribute. Not a general-purpose HTML sanitizer —
// there is no rich user content anywhere else in these templates.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
