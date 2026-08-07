import { getRequest } from "@tanstack/react-start/server";
import { isRequestAuthenticated } from "./auth.server";

/** Throws unless the incoming request carries a valid signed owner session cookie. */
export function assertOwner(): void {
  const request = getRequest();
  if (!isRequestAuthenticated(request)) {
    throw new Error("Unauthorized: Owner login required.");
  }
}

export function isOwnerRequest(): boolean {
  try {
    return isRequestAuthenticated(getRequest());
  } catch {
    return false;
  }
}
