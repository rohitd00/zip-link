import { generateToken, hashToken } from "../domain/sessionTokens";
import type { SessionRepository } from "../repositories/sessionRepository";

const SESSION_LIFETIME_MILLISECONDS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface CreatedSession {
  rawToken: string;
  expiresAt: Date;
}

/**
 * The database-facing half of session management — generating and
 * persisting a new session, or destroying one on logout. Setting/clearing
 * the actual cookie is the controller's job (it needs `response`, which
 * this service deliberately has no access to, keeping it about data, not
 * HTTP).
 */
export class SessionService {
  constructor(private readonly sessionRepository: SessionRepository) {}

  async createSessionForUser(userId: string): Promise<CreatedSession> {
    const { rawToken, tokenHash } = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MILLISECONDS);

    await this.sessionRepository.createSession(tokenHash, userId, expiresAt);

    return { rawToken, expiresAt };
  }

  async destroySessionByRawToken(rawToken: string): Promise<void> {
    await this.sessionRepository.deleteSessionByTokenHash(hashToken(rawToken));
  }
}
