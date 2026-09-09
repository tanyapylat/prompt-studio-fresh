import { useState } from "react";
import { Globe2, Lock, Trash2, UserPlus } from "lucide-react";
import { useStore } from "../store";
import type { LibraryVisibility, SpecProject, SpecRole } from "../types";
import { canManageAccess, ROLE_LABEL } from "../permissions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Per-Spec role management: owner (implicit), plus explicit editor/viewer grants on top of the
 * private/org default. Read-only for anyone who isn't the owner — everyone can see who has access,
 * only the owner can change it.
 */
export function AccessManager({ spec }: { spec: SpecProject }) {
  const { users, currentUserId, updateSpec } = useStore();
  const isOwner = canManageAccess(spec, currentUserId);
  const owner = users.find((u) => u.id === spec.ownerId);
  const [pickUserId, setPickUserId] = useState("");
  const [pickRole, setPickRole] = useState<SpecRole>("viewer");

  const grantable = users.filter((u) => u.id !== spec.ownerId && !spec.access.some((a) => a.userId === u.id));
  // Defensive: an owner should never also appear as an explicit grant row, even if stale/bad data has one.
  const grants = spec.access.filter((a) => a.userId !== spec.ownerId);

  function setVisibility(v: LibraryVisibility) {
    updateSpec(spec.id, (s) => ({ ...s, visibility: v, updatedAt: Date.now() }));
  }
  function addGrant() {
    if (!pickUserId) return;
    updateSpec(spec.id, (s) => ({
      ...s,
      access: [...s.access, { userId: pickUserId, role: pickRole }],
      updatedAt: Date.now(),
    }));
    setPickUserId("");
  }
  function removeGrant(userId: string) {
    updateSpec(spec.id, (s) => ({ ...s, access: s.access.filter((a) => a.userId !== userId), updatedAt: Date.now() }));
  }
  function changeRole(userId: string, role: SpecRole) {
    updateSpec(spec.id, (s) => ({
      ...s,
      access: s.access.map((a) => (a.userId === userId ? { ...a, role } : a)),
      updatedAt: Date.now(),
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {spec.visibility === "org" ? "Everyone in the org can view this Spec." : "Only the owner and people listed below can view this Spec."}
        </p>
        {isOwner ? (
          <div className="flex shrink-0 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["private", "org"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  spec.visibility === v ? "bg-primary text-primary-foreground" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {v === "org" ? (
                  <>
                    <Globe2 size={11} /> Public
                  </>
                ) : (
                  <>
                    <Lock size={11} /> Private
                  </>
                )}
              </button>
            ))}
          </div>
        ) : (
          <Badge tone={spec.visibility === "org" ? "success" : "neutral"}>
            {spec.visibility === "org" ? (
              <>
                <Globe2 size={11} /> Public
              </>
            ) : (
              <>
                <Lock size={11} /> Private
              </>
            )}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <span className="flex items-center gap-1.5 text-xs text-slate-700">
            <Avatar title={owner?.name ?? "Unknown"}>
              <AvatarFallback>{owner?.initials ?? "?"}</AvatarFallback>
            </Avatar>{" "}
            {owner?.name ?? "Unknown"}
          </span>
          <Badge tone="accent">Owner</Badge>
        </div>
        {grants.map((grant) => {
          const u = users.find((x) => x.id === grant.userId);
          return (
            <div
              key={grant.userId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
            >
              <span className="flex items-center gap-1.5 text-xs text-slate-700">
                <Avatar title={u?.name ?? "Unknown"}>
                  <AvatarFallback>{u?.initials ?? "?"}</AvatarFallback>
                </Avatar>{" "}
                {u?.name ?? "Unknown"}
              </span>
              {isOwner ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={grant.role}
                    onChange={(e) => changeRole(grant.userId, e.target.value as SpecRole)}
                    className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => removeGrant(grant.userId)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : (
                <Badge>{ROLE_LABEL[grant.role]}</Badge>
              )}
            </div>
          );
        })}
        {grants.length === 0 && (
          <p className="px-0.5 text-[11px] text-slate-400">No individual grants yet — access follows the default above.</p>
        )}
      </div>

      {isOwner && grantable.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1">
          <select
            value={pickUserId}
            onChange={(e) => setPickUserId(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
          >
            <option value="">Add person…</option>
            {grantable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value as SpecRole)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-800"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <Button size="sm" onClick={addGrant} disabled={!pickUserId}>
            <UserPlus size={12} /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
