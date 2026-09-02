import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthenticatedUserDto } from "@shared/contracts/auth";
import { apiClient } from "../api/apiClient";

interface AuthContextValue {
  // undefined = still loading the initial GET /api/auth/me, null = signed out.
  user: AuthenticatedUserDto | null | undefined;
  googleSignInEnabled: boolean;
  refreshCurrentUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Loads the signed-in user (if any) once on mount and makes it available
 * everywhere via useAuth(). Anonymous visitors are a fully supported state
 * here (`user: null`), not an error — the dashboard and link-creation flow
 * work identically either way, since account support is additive on top of
 * the existing anonymous owner-cookie flow.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUserDto | null | undefined>(undefined);
  const [googleSignInEnabled, setGoogleSignInEnabled] = useState(false);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const response = await apiClient.getCurrentUser();
      setUser(response.data.user);
      setGoogleSignInEnabled(response.data.googleSignInEnabled);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refreshCurrentUser();
  }, [refreshCurrentUser]);

  const signOut = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, googleSignInEnabled, refreshCurrentUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const contextValue = useContext(AuthContext);

  if (contextValue === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return contextValue;
}
