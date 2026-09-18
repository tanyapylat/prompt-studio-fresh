/** Application-owned absolute URL helper. Empty base keeps local relative paths. */
export function publicUrl(pathname: string): string {
  const base = (import.meta.env.VITE_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return base ? `${base}${path}` : path;
}
