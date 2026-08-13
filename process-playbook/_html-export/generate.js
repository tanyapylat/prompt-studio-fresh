const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const srcDir = path.join(__dirname, "..");
const outDir = __dirname;

const files = [
  "README.md",
  "01-the-spec.md",
  "02-launching-a-brand-new-prompt.md",
  "03-updating-an-existing-prompt.md",
  "04-roles-responsibilities-and-approvals.md",
  "05-continuous-quality-and-feedback-loop.md",
  "06-libraries-and-real-data.md",
  "07-glossary.md",
  "08-under-the-hood-technical-context.md",
];

// Render fenced ```mermaid blocks as <pre class="mermaid"> for client-side rendering,
// and rewrite in-repo .md links (including ones pointing at ../spec-driven-redesign/*.md)
// to .html so cross-navigation works in the exported set.
const renderer = new marked.Renderer();

renderer.code = ({ text, lang }) => {
  const language = (lang || "").trim();
  if (language === "mermaid") {
    return `<pre class="mermaid">\n${text}\n</pre>\n`;
  }
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre><code class="language-${language}">${escaped}</code></pre>\n`;
};

renderer.link = function ({ href, title, tokens }) {
  let newHref = href || "";
  // Cross-repo links into ../spec-driven-redesign/*.md need to land in that
  // folder's own _html-export/ output, one level further up than a same-folder link.
  const crossMatch = newHref.match(/^\.\.\/spec-driven-redesign\/([^#]+)\.md(#.*)?$/);
  if (crossMatch) {
    newHref = "../../spec-driven-redesign/_html-export/" + crossMatch[1] + ".html" + (crossMatch[2] || "");
  } else {
    const mdMatch = newHref.match(/^([^#]+)\.md(#.*)?$/);
    if (mdMatch) {
      newHref = mdMatch[1] + ".html" + (mdMatch[2] || "");
    }
  }
  const titleAttr = title ? ` title="${title}"` : "";
  const text = this.parser.parseInline(tokens);
  return `<a href="${newHref}"${titleAttr}>${text}</a>`;
};

marked.setOptions({
  gfm: true,
  breaks: false,
  renderer,
});

const template = (title, bodyHtml) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  body {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px 40px 80px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #1f2328;
    background: #ffffff;
  }
  h1, h2, h3, h4 { font-weight: 600; margin-top: 1.6em; margin-bottom: 0.6em; }
  h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  h3 { font-size: 1.25em; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    background: rgba(175,184,193,0.2);
    padding: 0.2em 0.4em;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 85%;
  }
  pre {
    background: #f6f8fa;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
  }
  pre code { background: transparent; padding: 0; }
  pre.mermaid { background: #ffffff; border: 1px solid #d0d7de; text-align: center; }
  blockquote {
    border-left: 4px solid #d0d7de;
    margin: 0;
    padding: 0 1em;
    color: #59636e;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    display: block;
    overflow-x: auto;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 6px 13px;
    text-align: left;
    vertical-align: top;
  }
  tr:nth-child(2n) { background: #f6f8fa; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
  .nav {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 10px 16px;
    margin-bottom: 24px;
    font-size: 14px;
  }
  .nav a { margin-right: 14px; }
  .banner {
    background: #ddf4ff;
    border: 1px solid #54aeff3d;
    border-radius: 6px;
    padding: 10px 16px;
    margin-bottom: 16px;
    font-size: 14px;
  }
</style>
</head>
<body>
<div class="banner">Business-process playbook — for the technical/engineering companion set, see <a href="../../spec-driven-redesign/_html-export/README.html">spec-driven-redesign</a>.</div>
<div class="nav">${files
  .map((f) => {
    const name = f.replace(/\.md$/, ".html");
    const label = f === "README.md" ? "README" : f.replace(/\.md$/, "");
    return `<a href="${name}">${label}</a>`;
  })
  .join("")}</div>
${bodyHtml}
<script>
  mermaid.initialize({ startOnLoad: true, theme: "default", securityLevel: "loose" });
</script>
</body>
</html>
`;

for (const file of files) {
  const srcPath = path.join(srcDir, file);
  const md = fs.readFileSync(srcPath, "utf8");
  const html = marked.parse(md);
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : file;
  const outPath = path.join(outDir, file.replace(/\.md$/, ".html"));
  fs.writeFileSync(outPath, template(title, html), "utf8");
  console.log("Wrote " + outPath);
}
