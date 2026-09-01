// An OwnerContext identifies who is allowed to manage a link. Release 1 uses
// an anonymous, signed session cookie, but the shape already supports a
// future authenticated user without changing any link service code.
export type OwnerType = "anonymous_session" | "authenticated_user";

export interface OwnerContext {
  ownerType: OwnerType;
  ownerId: string;
}
