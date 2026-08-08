import { getRequest } from "@tanstack/react-start/server";
import { getAuthenticatedUser, requireUserAuth, type UserSession } from "./auth.server";

/** Asserts that the incoming request carries a valid Supabase user session token. */
export async function assertOwner(): Promise<UserSession> {
  const request = getRequest();
  return requireUserAuth(request);
}

export async function isOwnerRequest(): Promise<boolean> {
  try {
    const user = await getAuthenticatedUser(getRequest());
    return Boolean(user);
  } catch {
    return false;
  }
}
