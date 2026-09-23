import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  BookOpenText,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createTabVaultApi } from "@/domain/server/client";
import { parseReadableArticle, type ReadableArticle } from "@/lib/readability";
import {
  TabFavicon,
  ViewedCheckbox,
} from "@/domain/library/components/tabs/TabContentParts";
import {
  openReaderLink,
  openSavedLink,
} from "@/domain/library/components/tabs/tabLinkEvents";
import type { TabListItem } from "@/domain/library/components/tabs/TabList";

type ReadabilityState =
  | { status: "loading"; url: string }
  | {
      status: "ready";
      url: string;
      article: ReadableArticle;
      objectUrls?: string[];
    }
  | { status: "unavailable"; url: string; reason: string };

/**
 * Load an ephemeral reader view for a saved tab.
 * Server previews are preferred when configured; object URLs are revoked on replacement or unmount.
 * @param {{ tab: TabListItem; backend?: { url: string; apiKey: string }; hidden: boolean; onViewedChange: (id: string, viewed: boolean) => void; onOpen: (tab: TabListItem, url?: string) => void; }} props - Tab, optional server preview connection, and open/viewed handlers.
 * @returns {React.ReactElement} Reader preview or a recoverable unavailable state.
 */
export function ReadableArticlePreview({
  tab,
  backend,
  hidden,
  onViewedChange,
  onOpen,
}: {
  tab: TabListItem;
  backend?: { url: string; apiKey: string };
  hidden: boolean;
  onViewedChange: (id: string, viewed: boolean) => void;
  onOpen: (tab: TabListItem, url?: string) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadabilityState>({
    status: "loading",
    url: tab.url,
  });
  const backendUrl = backend?.url;
  const backendApiKey = backend?.apiKey;

  useEffect(() => {
    let cancelled = false;
    let loadedObjectUrls: string[] = [];
    const load =
      backendUrl && backendApiKey
        ? createTabVaultApi({
            baseUrl: backendUrl,
            apiKey: backendApiKey,
          }).previews.loadArticle({
            id: tab.id,
            title: tab.title,
            url: tab.url,
          })
        : parseReadableArticle(tab.url).then(article => ({
            article,
            objectUrls: [],
          }));
    void load
      .then(({ article, objectUrls }) => {
        loadedObjectUrls = objectUrls;
        if (!cancelled)
          setState({ status: "ready", url: tab.url, article, objectUrls });
        else objectUrls.forEach(value => URL.revokeObjectURL(value));
      })
      .catch(error => {
        if (!cancelled)
          setState({
            status: "unavailable",
            url: tab.url,
            reason:
              error instanceof Error
                ? error.message
                : "Reader preview is unavailable for this page.",
          });
      });
    return () => {
      cancelled = true;
      loadedObjectUrls.forEach(value => URL.revokeObjectURL(value));
    };
  }, [tab.id, tab.title, tab.url, backendUrl, backendApiKey, attempt]);

  if (state.status === "loading" || state.url !== tab.url) {
    return (
      <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8]">
        <ReaderHeader tab={tab} label="Preparing reader preview" />
        <PreviewTitle
          tab={tab}
          title={tab.title}
          hidden={hidden}
          onViewedChange={onViewedChange}
        />
        <div className="flex min-h-[156px] items-center gap-3 px-4 py-6 text-[11px] text-[#727970]">
          <LoaderCircle className="h-4 w-4 animate-spin text-[#e95224]" />
          Mozilla Readability is extracting the article…
        </div>
      </section>
    );
  }

  if (state.status === "unavailable") {
    return (
      <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8]">
        <ReaderHeader tab={tab} label="Saved link" />
        <PreviewTitle
          tab={tab}
          title={tab.title}
          hidden={hidden}
          onViewedChange={onViewedChange}
        />
        <div className="min-h-[156px] px-4 py-4">
          <div className="flex items-center gap-2 text-[#536057]">
            <BookOpenText className="h-4 w-4 text-[#e95224]" />
            <p className="text-[12px] font-bold">Reader preview unavailable</p>
          </div>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#667068]">
            {tab.note ||
              "This site did not provide readable article HTML to the current TabVault context."}
          </p>
          <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#9a7a5f]">
            {state.reason}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setAttempt(current => current + 1)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#e95224] hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry reader
            </Button>
            <a
              href={tab.url}
              target="_blank"
              rel="noreferrer"
              onClick={event => openSavedLink(event, tab, onOpen)}
              onAuxClick={event => openSavedLink(event, tab, onOpen)}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#43554a] hover:text-[#e95224] hover:underline"
            >
              Open original <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  const { article } = state;
  return (
    <section className="overflow-hidden border border-[#d7d1c4] bg-[#fffdf8] shadow-[0_7px_18px_rgba(24,38,31,0.04)]">
      <ReaderHeader tab={tab} label="Reader preview" />
      <div className="px-4 pt-4 pb-2">
        <PreviewTitle
          tab={tab}
          title={article.title || tab.title}
          hidden={hidden}
          onViewedChange={onViewedChange}
          flush
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8px] uppercase tracking-[0.09em] text-[#7f867d]">
          {article.byline && <span>{article.byline}</span>}
          {article.siteName && <span>{article.siteName}</span>}
          <span>{Math.max(1, Math.ceil(article.length / 900))} min read</span>
        </div>
        {article.excerpt && (
          <p className="mt-3 border-l-2 border-[#e95224] pl-3 text-[11px] leading-5 text-[#5c665e]">
            {article.excerpt}
          </p>
        )}
      </div>
      <div
        className="reader-preview max-h-[360px] overflow-y-auto border-y border-[#e9e3d8] bg-[#fdfbf6] px-4 py-4 text-[13px] leading-7 text-[#38463d] [&_a]:text-[#c64b27] [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d7b091] [&_blockquote]:pl-3 [&_figcaption]:mt-1 [&_figcaption]:text-[10px] [&_figcaption]:text-[#7b8078] [&_h1]:mt-5 [&_h1]:font-['DM_Sans'] [&_h1]:text-[24px] [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:font-['DM_Sans'] [&_h2]:text-[20px] [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_img]:my-4 [&_img]:max-h-72 [&_img]:w-auto [&_img]:max-w-full [&_img]:object-contain [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-4"
        onClick={event => openReaderLink(event, tab, onOpen, article.url)}
        onAuxClick={event => openReaderLink(event, tab, onOpen, article.url)}
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
      <div className="flex flex-wrap items-center gap-1.5 bg-[#fffdf8] px-4 py-3">
        {tab.tags.map(tag => (
          <span
            key={tag}
            className="rounded border border-[#ded9cd] bg-[#f9f7f1] px-1.5 py-[3px] font-mono text-[8px] text-[#747a72]"
          >
            {tag}
          </span>
        ))}
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          onClick={event => openSavedLink(event, tab, onOpen, article.url)}
          onAuxClick={event => openSavedLink(event, tab, onOpen, article.url)}
          className="ml-auto inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#e95224] hover:underline"
        >
          Open original <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

/**
 * Show a reader title beside its viewed control.
 * Flush layout removes inset when the title sits in the article header.
 * @param {{ tab: TabListItem; title: string; hidden: boolean; onViewedChange: (id: string, viewed: boolean) => void; flush?: boolean; }} props - Tab, displayed title, hidden state, and viewed handler.
 * @returns {React.ReactElement} Reader title row.
 */
function PreviewTitle({
  tab,
  title,
  hidden,
  onViewedChange,
  flush = false,
}: {
  tab: TabListItem;
  title: string;
  hidden: boolean;
  onViewedChange: (id: string, viewed: boolean) => void;
  flush?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-start gap-2 ${flush ? "" : "px-4 pt-4"}`}
    >
      <h3 className="min-w-0 truncate font-['DM_Sans'] text-[20px] font-bold leading-[1.08] tracking-[-0.045em] text-[#26342c]">
        {title}
      </h3>
      <ViewedCheckbox tab={tab} hidden={hidden} onChange={onViewedChange} />
    </div>
  );
}

/**
 * Identify the source domain of a reader preview.
 * The saved tab color anchors the preview to its library record.
 * @param {{ tab: TabListItem; label: string }} props - Tab metadata and reader-state label.
 * @returns {React.ReactElement} Source strip above the reader content.
 */
function ReaderHeader({ tab, label }: { tab: TabListItem; label: string }) {
  return (
    <div
      className="relative flex items-center justify-between gap-3 border-b border-[#e5dfd4] px-4 py-2.5"
      style={{ backgroundColor: `${tab.color}18` }}
    >
      <div
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: tab.color }}
      />
      <div className="flex min-w-0 items-center gap-2">
        <TabFavicon tab={tab} size="compact" />
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.11em] text-[#617066]">
          {tab.domain}
        </span>
      </div>
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#758077]">
        {label}
      </span>
    </div>
  );
}
