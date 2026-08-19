/**
 * Signal Library implementation reminder: reader content is derived, ephemeral evidence.
 * It never replaces the saved URL, title, note, tags, or other canonical library metadata.
 */
import { fetchReadablePageSource } from "@/lib/extension";

export type ReadableArticle = {
  title: string;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  content: string;
  length: number;
  url: string;
};

function resolveArticleUrls(content: string, baseUrl: string) {
  const contentDocument = new DOMParser().parseFromString(content, "text/html");
  contentDocument
    .querySelectorAll<HTMLElement>("[href], [src]")
    .forEach(node => {
      for (const attribute of ["href", "src"] as const) {
        const value = node.getAttribute(attribute);
        if (!value || /^(#|data:|mailto:|tel:)/i.test(value)) continue;
        try {
          node.setAttribute(attribute, new URL(value, baseUrl).toString());
        } catch {
          node.removeAttribute(attribute);
        }
      }
    });
  return contentDocument.body.innerHTML;
}

export async function parseReadableArticle(
  url: string
): Promise<ReadableArticle> {
  const [source, readabilityModule, domPurifyModule] = await Promise.all([
    fetchReadablePageSource(url),
    import("@mozilla/readability"),
    import("dompurify"),
  ]);
  const { Readability } = readabilityModule;
  const DOMPurify = domPurifyModule.default;
  const document = new DOMParser().parseFromString(source.html, "text/html");
  const article = new Readability(document.cloneNode(true) as Document, {
    charThreshold: 120,
  }).parse();
  const textContent = article?.textContent ?? "";

  if (!article?.content || !textContent.trim())
    throw new Error("This page does not expose a readable article.");

  const resolvedContent = resolveArticleUrls(article.content, source.url);
  const content = DOMPurify.sanitize(resolvedContent, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object"],
    FORBID_ATTR: ["style"],
  });
  if (!content.trim()) throw new Error("No safe readable content was found.");

  return {
    title: article.title ?? "Untitled article",
    byline: article.byline,
    siteName: article.siteName,
    excerpt: article.excerpt,
    content,
    length: article.length ?? textContent.length,
    url: source.url,
  };
}
