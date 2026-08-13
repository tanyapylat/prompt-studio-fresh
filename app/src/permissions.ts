import type { SpecProject, SpecRole } from "./types";

export type EffectiveRole = "owner" | SpecRole | null;

/** Resolves what a given user can do with a Spec: explicit grants win, else the org/private default. */
export function getRole(spec: SpecProject, userId: string): EffectiveRole {
  if (spec.ownerId === userId) return "owner";
  const grant = spec.access.find((a) => a.userId === userId);
  if (grant) return grant.role;
  if (spec.visibility === "org") return "viewer";
  return null;
}

export function canView(spec: SpecProject, userId: string): boolean {
  return getRole(spec, userId) !== null;
}

export function canEdit(spec: SpecProject, userId: string): boolean {
  const role = getRole(spec, userId);
  return role === "owner" || role === "editor";
}

/** Only the owner can change roles, add/remove people, or flip private/org visibility. */
export function canManageAccess(spec: SpecProject, userId: string): boolean {
  return getRole(spec, userId) === "owner";
}

export const ROLE_LABEL: Record<Exclude<EffectiveRole, null>, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};
