export class TabVaultApiError extends Error {
  readonly status: number;

  /** Create an error for one failed local-server request. */
  constructor(status: number, message: string) {
    super(message);
    this.name = "TabVaultApiError";
    this.status = status;
  }
}

type ApiConfig = { baseUrl: string; apiKey: string };

type PreviewWire = {
  status: string;
  title?: string | null;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  contentHtml?: string | null;
  length?: number;
  sourceUrl?: string | null;
  error?: string | null;
};

/**
 * Create a configured client for the local TabVault HTTP API.
 *
 * @param config - Runtime-editable server origin and API key.
 * @returns Domain-grouped operations with shared request and error handling.
 */
export function createTabVaultApi(config: ApiConfig) {
  const root = config.baseUrl.replace(/\/+$/, "");
  const headers = {
    "content-type": "application/json",
    "X-API-Key": config.apiKey,
  };

  async function raw(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${root}/api/v1${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok)
      throw new TabVaultApiError(
        response.status,
        `Request failed (${response.status})`
      );
    return response;
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await raw(path, init);
    return response.json() as Promise<T>;
  }

  return {
    request,
    tabs: {
      list: <T>() => request<T>("/tabs"),
      get: <T>(id: string) => request<T>(`/tabs/${encodeURIComponent(id)}`),
      create: <T>(body: unknown) =>
        request<T>("/tabs", { method: "POST", body: JSON.stringify(body) }),
      createBatch: <T>(body: unknown, idempotencyKey: string) =>
        request<T>("/tabs/batch", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        }),
      update: <T>(id: string, body: unknown) =>
        request<T>(`/tabs/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      remove: <T>(id: string, hard = false) =>
        request<T>(`/tabs/${encodeURIComponent(id)}?hard=${hard}`, {
          method: "DELETE",
        }),
    },
    groups: {
      list: <T>() => request<T>("/groups"),
      create: <T>(body: unknown) =>
        request<T>("/groups", { method: "POST", body: JSON.stringify(body) }),
      update: <T>(id: string, body: unknown) =>
        request<T>(`/groups/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      remove: <T>(id: string) =>
        request<T>(`/groups/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    search: {
      query: <T>(query: URLSearchParams) => request<T>(`/search?${query}`),
      structured: <T>(body: unknown) =>
        request<T>("/search", { method: "POST", body: JSON.stringify(body) }),
    },
    index: {
      status: <T>() => request<T>("/index/status"),
      rebuild: <T>() => request<T>("/search/reindex", { method: "POST" }),
    },
    transfer: {
      export: (format: "json" | "markdown") => raw(`/export?format=${format}`),
      sync: <T>() => request<T>("/sync"),
      import: <T>(body: unknown) =>
        request<T>("/import", { method: "POST", body: JSON.stringify(body) }),
      validate: <T>(body: unknown) =>
        request<T>("/import/validate", {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    properties: {
      get: <T>() => request<T>("/property-schema"),
      upsert: <T>(body: unknown) =>
        request<T>("/property-schema", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      remove: <T>(name: string) =>
        request<T>(`/property-schema/${encodeURIComponent(name)}`, {
          method: "DELETE",
        }),
    },
    previews: {
      loadArticle: async (tab: { id: string; title: string; url: string }) => {
        const { data: preview } = await request<{ data: PreviewWire }>(
          `/tabs/${encodeURIComponent(tab.id)}/preview`
        );
        if (preview.status !== "ready" || !preview.contentHtml)
          throw new Error(
            preview.error || "The cached server preview is not ready yet."
          );

        let content = preview.contentHtml;
        const assetIds = Array.from(
          new Set(
            Array.from(
              content.matchAll(/tabvault-asset:\/\/([\w-]+)/g),
              match => match[1]
            )
          )
        );
        const objectUrls: string[] = [];
        await Promise.all(
          assetIds.map(async id => {
            const response = await fetch(
              `${root}/api/v1/assets/${encodeURIComponent(id)}`,
              { headers }
            );
            if (!response.ok) return;
            const objectUrl = URL.createObjectURL(await response.blob());
            objectUrls.push(objectUrl);
            content = content.replaceAll(`tabvault-asset://${id}`, objectUrl);
          })
        );
        return {
          article: {
            title: preview.title || tab.title,
            byline: preview.byline,
            siteName: preview.siteName,
            excerpt: preview.excerpt,
            content,
            length: preview.length || 0,
            url: preview.sourceUrl || tab.url,
          },
          objectUrls,
        };
      },
    },
  };
}

export type TabVaultApi = ReturnType<typeof createTabVaultApi>;
