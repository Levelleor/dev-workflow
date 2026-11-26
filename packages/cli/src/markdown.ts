import type { Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import noUndefinedReferences from "remark-lint-no-undefined-references";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";

const parser = unified().use(remarkParse).use(remarkGfm);
const linter = parser().use(noUndefinedReferences, { allowShortcutLink: true });

export function parseMarkdown(body: string): Root {
  return parser.parse(body);
}

export function fragmentHasBoundary(body: string): boolean {
  const boundary = body + "\n\n";
  const next = parseMarkdown(boundary + "## Boundary\n").children.at(-1);
  return next?.type === "heading" && next.position?.start.offset === boundary.length;
}

export function markdownTitle(tree: Root): string | undefined {
  const heading = tree.children.find((node) => node.type === "heading" && node.depth === 1);
  return heading && toString(heading, { includeHtml: false }).trim() || undefined;
}

export function lintMarkdownReferences(body: string, tree: Root) {
  const file = new VFile(body);
  linter.runSync(tree, file);
  return file.messages;
}

export function escapeMarkdownText(text: string): string {
  return text.replace(/[\\`*_\[\]<>#~&]/g, "\\$&");
}

export function* markdownNodes(parent: Root | RootContent): Generator<RootContent> {
  if ("children" in parent) {
    for (const node of parent.children) {
      yield node;
      yield* markdownNodes(node);
    }
  }
}
