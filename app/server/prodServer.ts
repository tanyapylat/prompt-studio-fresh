import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { applyCors } from "./cors";
import { handleApiRoute } from "./apiPlugin";

declare const __dirname: string;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function sendFile(res: ServerResponse, filePath: string) {
  applyCors(res);
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
  createReadStream(filePath).pipe(res);
}

export function startProdServer(wwwRoot: string, port: number) {
  const indexPath = path.join(wwwRoot, "index.html");

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    applyCors(res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    void handleApiRoute(req, res)
      .then((handled) => {
        if (handled) return;

        const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] || "/");
        const relative = urlPath.replace(/^\/+/, "");
        const resolvedRoot = path.resolve(wwwRoot);
        const filePath = path.resolve(resolvedRoot, relative || "index.html");
        if (!filePath.startsWith(resolvedRoot + path.sep) && filePath !== path.join(resolvedRoot, "index.html")) {
          applyCors(res);
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        if (existsSync(filePath) && statSync(filePath).isFile()) {
          sendFile(res, filePath);
          return;
        }

        // Only client-side routes fall through to index.html; a missing asset must 404 rather
        // than quietly serve HTML in its place.
        if (path.extname(filePath)) {
          applyCors(res);
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        if (existsSync(indexPath)) {
          sendFile(res, indexPath);
          return;
        }

        applyCors(res);
        res.statusCode = 404;
        res.end("Not found");
      })
      .catch((err: unknown) => {
        applyCors(res);
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : String(err));
      });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`AI Studio listening on ${port}`);
  });
}

const port = Number(process.env.PORT) || 8080;
const wwwRoot = __dirname;
startProdServer(wwwRoot, port);
