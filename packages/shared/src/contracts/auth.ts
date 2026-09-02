// The publicly-safe shape of a signed-in user — never includes
// passwordHash or googleId, which are internal-only.
export interface AuthenticatedUserDto {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: string;
}

// GET /api/auth/me returns this whether or not anyone is signed in, so the
// dashboard can tell the two apart without treating "no session" as an
// error. googleSignInEnabled tells the frontend whether to show the
// "Continue with Google" button — the server only has Google credentials
// configured in some deployments (see GoogleOAuthService).
export interface CurrentUserResponseData {
  user: AuthenticatedUserDto | null;
  googleSignInEnabled: boolean;
}

// POST /api/auth/signup
export interface SignupRequestBody {
  email: string;
  password: string;
  displayName?: string;
}

// POST /api/auth/login
export interface LoginRequestBody {
  email: string;
  password: string;
}

export interface AuthSuccessResponseData {
  user: AuthenticatedUserDto;
}

// POST /api/auth/request-password-reset
export interface RequestPasswordResetRequestBody {
  email: string;
}

// POST /api/auth/reset-password
export interface ResetPasswordRequestBody {
  token: string;
  newPassword: string;
}
