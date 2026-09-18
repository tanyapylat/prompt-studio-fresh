import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const FONT_PACKAGES = ["@fontsource-variable/geist", "@fontsource-variable/inter"];

/**
 * `@fontsource` ships `url(./files/*.woff2)` in its CSS, and those URLs are left unresolved by the
 * build — so without this the emitted stylesheet points at font files that were never copied into
 * `dist/`, and the deployed app silently falls back to a system font.
 */
export function fontsourceAssets(): Plugin {
  return {
    name: "fontsource-assets",
    apply: "build",
    async writeBundle(options, bundle) {
      const outDir = options.dir ?? "dist";

      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith(".css")) continue;

        const css = await readFile(path.join(outDir, fileName), "utf8");
        const referenced = new Set(
          [...css.matchAll(/url\(\.\/files\/([^)"']+\.woff2)\)/g)].map((m) => m[1]),
        );
        if (referenced.size === 0) continue;

        const targetDir = path.join(outDir, path.dirname(fileName), "files");
        await mkdir(targetDir, { recursive: true });

        for (const font of referenced) {
          const source = FONT_PACKAGES.map((pkg) =>
            path.join(__dirname, "..", "node_modules", pkg, "files", font),
          ).find((candidate) => existsSync(candidate));

          if (!source) {
            this.warn(`Font file referenced by ${fileName} not found in node_modules: ${font}`);
            continue;
          }
          await copyFile(source, path.join(targetDir, font));
        }
      }
    },
  };
}
