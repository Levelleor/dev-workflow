import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import GithubSlugger from "github-slugger";
import type { Root } from "mdast";
import { toString } from "mdast-util-to-string";
import type { FileSystem } from "./fs.js";
import { readFrontmatter } from "./frontmatter.js";
import { lintMarkdownReferences, markdownNodes, parseMarkdown } from "./markdown.js";

export type DocumentDiagnostic = { path: string; line: number; code: string; message: string };

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

export function documentPath(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

export function formatDiagnostic(issue: DocumentDiagnostic): string {
  return `${issue.path}:${issue.line} [${issue.code}] ${issue.message}`;
}

export function documentLinkChecker(fs: FileSystem, root: string, supplied = new Map<string, string>()) {
  const rootPath = fs.realpathSync(root);
  const directories = new Map<string, Set<string>>();
  const anchors = new Map<string, Set<string>>();

  function exists(target: string): boolean {
    let directory = root;
    for (const segment of relative(root, target).split(sep).filter(Boolean)) {
      let names = directories.get(directory);
      if (!names) {
        names = new Set(fs.readdirSync(directory));
        directories.set(directory, names);
      }
      if (!names.has(segment)) return false;
      directory = join(directory, segment);
    }
    return true;
  }

  function headings(file: string): Set<string> {
    const cached = anchors.get(file);
    if (cached) return cached;
    const raw = supplied.get(file) ?? fs.readFileSync(file, "utf8");
    const tree = parseMarkdown(readFrontmatter(raw)?.body ?? raw);
    const slugger = new GithubSlugger();
    const found = new Set<string>();
    for (const node of markdownNodes(tree)) {
      if (node.type === "heading") found.add(slugger.slug(toString(node, { includeHtml: false })));
    }
    anchors.set(file, found);
    return found;
  }

  function problem(file: string, url: string): string | undefined {
    if (/^file:/i.test(url)) return `Use a repository path instead of the file URL '${url}'.`;
    if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//")) return;
    const hash = url.indexOf("#");
    const location = hash < 0 ? url : url.slice(0, hash);
    let path: string;
    let anchor: string;
    try {
      path = decodeURIComponent(location.split("?")[0]);
      anchor = hash < 0 ? "" : decodeURIComponent(url.slice(hash + 1));
    } catch {
      return `Invalid URL encoding in '${url}'.`;
    }
    if (/[\x00-\x1f\\]/.test(path)) return `Invalid repository link path '${url}'.`;
    const target = path.startsWith("/") ? resolve(root, `.${path}`) : path ? resolve(dirname(file), path) : file;
    if (!isInside(root, target)) return `Repository link leaves the project: '${url}'.`;

    try {
      if (!supplied.has(target)) {
        if (!isInside(rootPath, fs.realpathSync(target))) return `Repository link leaves the project: '${url}'.`;
        if (!exists(target)) return `Missing repository link target '${url}'.`;
      }
      if (anchor && extname(target).toLowerCase() === ".md" && !headings(target).has(anchor)) {
        return `Missing Markdown anchor '${anchor}' in ${documentPath(root, target)}.`;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return `Missing repository link target '${url}'.`;
      return `Cannot check repository link '${url}': ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return (file: string, body: string, tree: Root, lineOffset: number): DocumentDiagnostic[] => {
    const issues: DocumentDiagnostic[] = [];
    const path = documentPath(root, file);
    for (const message of lintMarkdownReferences(body, tree)) {
      issues.push({ path, line: (message.line ?? 1) + lineOffset, code: "link-reference", message: message.reason });
    }

    const definitions = new Map<string, string>();
    for (const node of markdownNodes(tree)) {
      if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    }
    for (const node of markdownNodes(tree)) {
      const url = node.type === "link" || node.type === "image" ? node.url
        : node.type === "linkReference" || node.type === "imageReference" ? definitions.get(node.identifier) : undefined;
      if (url === undefined) continue;
      const message = problem(file, url);
      if (message) issues.push({ path, line: (node.position?.start.line ?? 1) + lineOffset, code: "link-target", message });
    }
    return issues;
  };
}
