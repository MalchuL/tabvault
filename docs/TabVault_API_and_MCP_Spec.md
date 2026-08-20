# TabVault: Детальная спецификация Backend API и MCP-сервера

**Версия:** 0.2 (детализация PRD v0.1)
**Дата:** 20.08.2026

Базовый URL: `http://127.0.0.1:{port}/api/v1` (port настраивается, по умолчанию `47821`).
Формат: JSON везде, `Content-Type: application/json; charset=utf-8`.
Аутентификация: опциональный `X-API-Key` заголовок (обязателен, если сервер забинден не на `127.0.0.1`).

---

## 0. Общие конвенции API

### 0.1 Формат ошибок (единый на все эндпоинты)

Взят паттерн из JSON:API и RFC 9457 (Problem Details), адаптированный под требование к максимально подробным ошибкам [web:46][web:60]:

```json
{
  "success": false,
  "errors": [
    {
      "code": "E_INVALID_URL",
      "path": "body.tabs[3].url",
      "expected": "absolute URL with http/https scheme",
      "received": "example.com/page",
      "message": "URL должен начинаться с http:// или https://.",
      "suggestedFix": "https://example.com/page",
      "httpStatus": 422
    }
  ],
  "warnings": []
}
```

Правило: **всегда** собирать все ошибки за один проход валидации, не прерываться на первой (кроме случаев structural parse failure — например, невалидный JSON целиком, где дальнейший разбор невозможен).

### 0.2 Успешный ответ

```json
{
  "success": true,
  "data": { /* ... */ },
  "meta": { /* пагинация, счётчики и т.п. — опционально */ }
}
```

### 0.3 Пагинация

Курсорная пагинация для всех list-эндпоинтов — устойчива при удалениях/добавлениях между страницами, стандарт для 2026 REST API [web:54][web:60]:

- Запрос: `?limit=50&cursor=<opaque_string>`
- `limit`: по умолчанию 50, максимум 200 (жёсткий серверный кап, клиентский `limit` выше игнорируется и заменяется на 200 с warning'ом).
- Ответ включает `meta.nextCursor` (`null`, если конец списка) и `meta.hasMore: boolean`.
- Курсор — opaque base64 строка (encode `{sortKey, id}`), не сырой ID из БД.

### 0.4 Частичные поля (`fields`)

Параметр `?fields=minimal|full` на всех GET/list эндпоинтах:
- `full` (по умолчанию) — все поля включая `note`, `createdAt`, `updatedAt`.
- `minimal` — только `id, url, title, favicon, groupId, tags` — экономия токенов для агента, когда timestamps/note не нужны.
- Можно указать точечно: `?fields=id,url,title` — явный whitelist полей.

### 0.5 Идемпотентность

Мутирующие запросы (`POST`) поддерживают заголовок `Idempotency-Key: <uuid>` — повторный запрос с тем же ключом в течение 24ч возвращает закешированный первый результат, а не создаёт дубликат. Критично для агентов, которые могут ретраить запрос при таймауте.

### 0.6 Версионирование API vs версионирование схемы данных

Не путать: `/api/v1/...` — версия HTTP API (эндпоинты, форматы запросов). `schemaVersion` внутри JSON-документа импорта/экспорта — версия формата данных (§ниже). Это два независимых номера.

---

## 1. Tabs

### 1.1 `GET /tabs` — список вкладок

**Query-параметры:**

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `groupId` | string \| `"inbox"` \| `"all"` | нет (default `"all"`) | Фильтр по группе; `"inbox"` — вкладки без группы |
| `tags` | string (comma-separated) | нет | Фильтр «содержит любой из тегов» (OR) |
| `tagsAll` | string (comma-separated) | нет | Фильтр «содержит все теги» (AND) |
| `search` | string | нет | Текстовый поиск по title/url/note (substring, не семантический) |
| `sortBy` | `position` \| `createdAt` \| `updatedAt` \| `title` | нет (default `position`) | Поле сортировки |
| `sortDir` | `asc` \| `desc` | нет (default `asc`) | Направление |
| `limit` | int 1–200 | нет (default 50) | Размер страницы |
| `cursor` | string | нет | Курсор пагинации |
| `fields` | string | нет (default `full`) | См. §0.4 |
| `includeArchived` | bool | нет (default `false`) | Включать архивированные вкладки |

**Ответ 200:**
```json
{
  "success": true,
  "data": {
    "tabs": [
      {
        "id": "t-1001",
        "url": "https://arxiv.org/abs/2508.01234",
        "title": "Flow Matching for Generative Modeling",
        "favicon": "https://arxiv.org/favicon.ico",
        "note": "Перечитать раздел про ODE solvers",
        "tags": ["read-later"],
        "groupId": "g-2",
        "position": 0,
        "createdAt": "2026-08-02T09:00:00Z",
        "updatedAt": "2026-08-02T09:00:00Z"
      }
    ]
  },
  "meta": { "nextCursor": "eyJwb3NpdGlvbiI6MSwiaWQiOiJ0LTEwMDIifQ==", "hasMore": true, "totalCount": 143 }
}
```
`totalCount` — приблизительный (кешированный счётчик), не гарантирует точность на момент запроса при высокой конкурентности — это ожидаемо и не является багом.

### 1.2 `GET /tabs/{id}` — одна вкладка

**Ответ 200:** `{ "success": true, "data": { /* Tab object, всегда fields=full */ } }`

**Ответ 404:**
```json
{ "success": false, "errors": [{ "code": "E_NOT_FOUND", "path": "params.id", "expected": "existing tab id", "received": "t-9999", "message": "Вкладка с id 't-9999' не найдена.", "httpStatus": 404 }] }
```

### 1.3 `POST /tabs` — создать одну или несколько вкладок

**Тело запроса:**
```json
{
  "tabs": [
    {
      "url": "https://example.com",
      "title": "Example Domain",
      "favicon": "https://example.com/favicon.ico",
      "note": null,
      "tags": ["work"],
      "groupId": null,
      "position": null
    }
  ],
  "dedupe": true,
  "dedupeStrategy": "skip"
}
```

Правила:
- `url` — обязательное, единственное строго обязательное поле. `title` — если не передан, сервер попытается извлечь из `<title>` страницы асинхронно (best-effort, не блокирует создание); до этого `title` = url.
- `groupId: null` → попадает в Inbox.
- `position: null` → добавляется в конец списка (группы/Inbox).
- `id` **не передаётся клиентом** — генерируется сервером (UUID v4). Исключение — `upload`-импорт (§5.2), где id может быть сохранён явно для upsert.
- `dedupe` (default `true`) — включает проверку по нормализованному URL.
- `dedupeStrategy`: `"skip"` (пропустить дубликат, вернуть существующий в ответе с флагом `wasDuplicate: true`), `"merge"` (объединить теги и обновить note/title, если новые непустые), `"createAnyway"` (форс-создание дубликата).

**Ответ 201:**
```json
{
  "success": true,
  "data": {
    "created": [ { "id": "t-2001", "url": "...", "wasDuplicate": false, /* ...остальные поля */ } ],
    "skipped": [ { "url": "https://existing.com", "existingId": "t-1050", "reason": "duplicate_url" } ]
  }
}
```

**Ошибки 422** — по каждому невалидному элементу массива (см. общий формат §0.1), с `path: "body.tabs[N].<field>"`. Валидные элементы в том же запросе **всё равно создаются** (partial success), если явно не передан `?atomic=true` (тогда весь batch либо целиком проходит, либо целиком отвергается).

### 1.4 `PATCH /tabs/{id}` — частичное обновление

**Тело:** любое подмножество `{ title?, note?, tags?, favicon?, groupId?, position? }`. `url` **нельзя** менять через PATCH (это по сути новая сущность — удалить+создать, чтобы не подделывать историю дедупликации). Отправка `note: null` явно очищает заметку (отличие от отсутствия поля в теле, которое оставляет текущее значение нетронутым — важно различать «не менять» и «установить в null»).

**Ответ 200:** обновлённый объект Tab (fields=full).

**Ответ 409** (конфликт — например, `groupId` указывает на несуществующую или архивированную группу):
```json
{ "success": false, "errors": [{ "code": "E_INVALID_REFERENCE", "path": "body.groupId", "expected": "existing, non-archived group id", "received": "g-999", "message": "Группа 'g-999' не существует.", "httpStatus": 409 }] }
```

### 1.5 `DELETE /tabs/{id}` — удалить вкладку

**Query:** `?hard=false` (default) — soft delete (флаг `archived: true`, восстановимо 30 дней); `?hard=true` — безвозвратное удаление, требует явного флага.

**Ответ 200:** `{ "success": true, "data": { "id": "t-1001", "deletedAt": "...", "hard": false } }`

### 1.6 `POST /tabs/batch-delete` — массовое удаление

**Тело:** `{ "ids": ["t-1", "t-2"], "hard": false }`
**Ответ 200:** `{ "success": true, "data": { "deleted": ["t-1", "t-2"], "notFound": [] } }` — не найденные id не считаются ошибкой (идемпотентно), просто перечисляются отдельно.

### 1.7 `POST /tabs/{id}/move` — переместить вкладку

**Тело:** `{ "targetGroupId": "g-3", "position": 2 }` (`targetGroupId: null` → в Inbox; `position: null` → в конец).

**Ответ 200:** обновлённый Tab + пересчитанные `position` соседей в затронутой группе (если использовалась схема целочисленных позиций с реордером — см. §1.8).

### 1.8 Примечание к `position`

Рекомендация к реализации: хранить `position` как **float** (не int), чтобы вставка между двумя элементами не требовала сдвига всех остальных (`position = (prev.position + next.position) / 2`). Периодическая ре-нормализация (batch job) на случай исчерпания точности float после многих вставок в одно место.

---

## 2. Groups

### 2.1 `GET /groups` — дерево групп

**Query:** `?flat=false` (default, вложенное дерево) | `?flat=true` (плоский список с `parentId`, удобнее для агента, который сам строит структуру).

**Ответ 200 (flat=false):**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "id": "g-1", "name": "Research", "parentId": null, "color": "#4285F4",
        "position": 0, "createdAt": "...", "updatedAt": "...", "tabCount": 12,
        "children": [
          { "id": "g-2", "name": "LLM papers", "parentId": "g-1", "color": null,
            "position": 0, "createdAt": "...", "updatedAt": "...", "tabCount": 5, "children": [] }
        ]
      }
    ]
  }
}
```
`tabCount` — прямые вкладки группы, без учёта дочерних групп (агрегат по поддереву доступен через `?includeDescendantCount=true` → добавляет поле `totalTabCount`).

### 2.2 `POST /groups` — создать группу

**Тело:** `{ "name": "New Group", "parentId": null, "color": "#EA4335", "position": null }`
**Валидация:** `name` — обязателен, 1–200 символов. `parentId`, если указан, должен существовать и не создавать цикл (проверка всего пути до корня).

**Ошибка цикла (409):**
```json
{ "code": "E_CYCLIC_GROUP_REFERENCE", "path": "body.parentId", "message": "Группа 'g-5' не может быть родителем 'g-1', так как 'g-1' уже является предком 'g-5' в дереве.", "httpStatus": 409 }
```

### 2.3 `PATCH /groups/{id}` — обновить группу

**Тело:** подмножество `{ name?, parentId?, color?, position? }`. Смена `parentId` на потомка самой группы → та же ошибка `E_CYCLIC_GROUP_REFERENCE`.

### 2.4 `DELETE /groups/{id}` — удалить группу

**Query:** `?strategy=cascade|promote|reject_if_nonempty` (обязательный параметр, без default — явное решение всегда лучше молчаливого поведения при деструктивной операции):
- `cascade` — удаляет группу, все дочерние подгруппы и все вложенные вкладки (мягко, с возможностью восстановления 30 дней).
- `promote` — дочерние группы и вкладки переезжают на уровень родителя удаляемой группы (или в Inbox, если удаляется корневая).
- `reject_if_nonempty` — 409 ошибка, если у группы есть дочерние группы или вкладки; ничего не удаляется.

### 2.5 `GET /groups/{id}/tabs` — вкладки внутри группы

Синтаксический сахар над `GET /tabs?groupId={id}`, с опцией `?includeSubgroups=true` — рекурсивно включает вкладки всех вложенных подгрупп (полезно для экспорта поддерева).

---

## 3. Tags

### 3.1 `GET /tags` — справочник тегов

**Ответ 200:**
```json
{
  "success": true,
  "data": {
    "tags": [
      { "name": "work", "description": "Рабочие задачи", "createdAt": "...", "tabCount": 8 },
      { "name": "read-later", "description": null, "createdAt": "...", "tabCount": 23 }
    ]
  }
}
```

### 3.2 `GET /tags/export.md` — тот же справочник в Markdown

**Ответ 200** (`Content-Type: text/markdown`):
```markdown
# Tags

- **work** — Рабочие задачи
- **read-later** — _(без описания)_
```

### 3.3 `PUT /tags/{name}` — создать/обновить описание тега

Upsert по имени (теги — свободные строки, имя = первичный ключ, регистронезависимое сравнение при поиске, но хранится как введено). **Тело:** `{ "description": "Рабочие задачи" }`.

### 3.4 `DELETE /tags/{name}`

**Query:** `?detachFromTabs=true` (обязателен явно) — удаляет тег из справочника и снимает его со всех вкладок, где он использован. Без этого флага — 409, если тег используется хотя бы одной вкладкой.

### 3.5 `POST /tabs/{id}/tags` и `DELETE /tabs/{id}/tags/{tagName}`

Точечное добавление/удаление одного тега у одной вкладки (без полного PATCH объекта). Если тег не существует в справочнике при добавлении — создаётся автоматически с `description: null` и warning `W_ORPHAN_TAG` в ответе.

---

## 4. Search (семантический + текстовый)

### 4.1 `GET /search`

**Query:**

| Параметр | Тип | Описание |
|---|---|---|
| `q` | string, обязательный | Поисковый запрос |
| `mode` | `semantic` \| `keyword` \| `hybrid` | default `hybrid` |
| `limit` | int 1–50 | default 10 |
| `groupId` | string | ограничить поиск группой (опционально) |
| `tags` | string (CSV) | ограничить поиск тегами |
| `minScore` | float 0–1 | default 0.3 — отсекать нерелевантные semantic-хиты |

**Ответ 200:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "tab": { "id": "t-1001", "url": "...", "title": "...", "groupId": "g-2", "tags": ["read-later"] },
        "score": 0.87,
        "matchType": "semantic",
        "matchedOn": "note"
      }
    ]
  },
  "meta": { "queryEmbeddingMs": 42, "searchMs": 8 }
}
```
`mode=hybrid` — объединяет semantic (Zvec, эмбеддинг `deepvk/USER-bge-m3`) и keyword (substring по title/url/note) с re-ranking по взвешенной сумме; `matchType` в каждом результате показывает, какой механизм его нашёл (`semantic` | `keyword` | `both`).

### 4.2 `POST /search/reindex`

Принудительный пересчёт всех эмбеддингов (например, после смены модели или восстановления из бэкапа без векторного индекса). Асинхронная операция — возвращает `jobId`, статус опрашивается через `GET /jobs/{jobId}`.

---

## 5. Import / Export

### 5.1 `GET /export`

**Query:**
- `format`: `json` | `markdown` (обязательный)
- `scope`: `all` | `group:{id}` | `tag:{name}` (default `all`)
- `includeSubgroups`: bool (default `true`, актуально при `scope=group:{id}`)
- `fields`: `full` | `minimal` (§0.4 — применимо и к экспорту; `minimal` в Markdown убирает строки с `note`/`createdAt`/`updatedAt`)

**Ответ 200** (`format=json`): полный документ, как описан в PRD §5.1, с заголовком `Content-Disposition: attachment; filename="tabvault-export-2026-08-20.json"`.

**Ответ 200** (`format=markdown`): текст, `Content-Type: text/markdown`.

### 5.2 `POST /import`

**Query:** `mode`: `replace` | `upload` (обязательный, без default — явное решение всегда).
**Query (только для `mode=replace`):** `scope`: `all` | `group:{id}` — при `group:{id}` заменяется только содержимое этой группы и её подгрупп, остальное хранилище не трогается.

**Тело:** документ JSON (§5.1 PRD) либо Markdown-текст, определяется заголовком `Content-Type` (`application/json` или `text/markdown`).

**Поведение:**
1. Парсинг документа выбранным парсером версии (`schemaVersion` в JSON; для Markdown — единственная грамматика, без версионирования на этом уровне, т.к. текстовый формат не хранит `schemaVersion` явно — фиксируется в теле спеки MCP §6).
2. Полная валидация — собираются все ошибки (§0.1).
3. Если есть хотя бы одна `error` (не `warning`) — **транзакция не применяется**, возвращается `422` с полным списком проблем, хранилище не тронуто.
4. Если только `warnings` — импорт применяется, warnings возвращаются в ответе для информации.
5. При `mode=replace` — автоматически создаётся snapshot текущего состояния перед заменой (см. §6 Backups).

**Ответ 200 (успех):**
```json
{
  "success": true,
  "data": {
    "mode": "upload",
    "created": { "tabs": 12, "groups": 2, "tags": 3 },
    "updated": { "tabs": 4, "groups": 0, "tags": 1 },
    "skippedDuplicates": 2,
    "backupSnapshotId": null
  },
  "warnings": [
    { "code": "W_ORPHAN_TAG", "path": "tabs[7].tags[0]", "message": "Тег 'archived' не найден — создан автоматически." }
  ]
}
```

**Ответ 422 (провал валидации):** формат из §0.1 PRD, полный список ошибок с `path` (для JSON — JSONPath-подобный, для Markdown — `line:{N}`), `expected`, `received`, `code`, `message`, `suggestedFix`.

Пример markdown-специфичной ошибки:
```json
{
  "code": "E_MARKDOWN_PARSE_ERROR",
  "path": "line:14",
  "expected": "link line in format '- [Title](url)' or metadata line 'key: value'",
  "received": "  some free text without proper format",
  "message": "Строка 14 не распознана ни как ссылка, ни как метаданные. Похоже на незакрытый предыдущий блок метаданных.",
  "suggestedFix": "Добавить '- [Title](https://...)' перед этой строкой или удалить строку.",
  "httpStatus": 422
}
```

### 5.3 `POST /import/validate` — dry-run без применения

Тот же вход, что у `/import`, но **никогда** не мутирует хранилище — только возвращает список ошибок/warnings и предпросмотр диффа (`wouldCreate`, `wouldUpdate`, `wouldSkip`). Существует специально для агентов — итеративно чинить свой экспорт до применения.

---

## 6. Backups & Jobs

### 6.1 `GET /backups`

Список автоматических snapshot'ов (создаются перед каждым `replace`-импортом и по расписанию, например ежедневно). `{ "id": "bkp-...", "createdAt": "...", "reason": "pre_replace_import" | "scheduled", "sizeBytes": 48213 }`.

### 6.2 `POST /backups/{id}/restore`

Восстанавливает хранилище из snapshot'а — по сути `import?mode=replace` с телом = содержимое бэкапа. Тоже создаёт snapshot текущего состояния перед восстановлением (безопасность через избыточность).

### 6.3 `GET /jobs/{jobId}`

Для асинхронных операций (`reindex`, восстановление больших бэкапов): `{ "status": "pending" | "running" | "done" | "failed", "progress": 0.73, "result": null }`.

---

## 7. Health & Meta

### 7.1 `GET /health`

`{ "status": "ok", "version": "0.2.0", "schemaVersion": 1, "storage": { "tabs": 143, "groups": 9, "tags": 14 }, "vectorIndex": { "status": "ready", "indexedCount": 143 } }`

Используется расширением для индикатора «сервер доступен», а также MCP-сервером при старте для sanity-check перед регистрацией tools.

---

# MCP-сервер: инструменты, аннотации и обоснование

MCP-сервер — тонкий прокси-слой над Backend API: транслирует вызовы tools в HTTP-запросы к настроенному URL, добавляет `outputSchema`, аннотации (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) на каждый tool, как того требует практика проектирования MCP-серверов 2026 [web:52][web:58][web:48]. `inputSchema` держим максимально плоским (без глубокой вложенности) — известная рекомендация, так как модели хуже работают с deep-nested JSON Schema при генерации аргументов [web:52].

## Обязательные (нужны с первого дня)

| Tool | inputSchema (ключевые поля) | annotations | Зачем |
|---|---|---|---|
| `list_tabs` | `groupId?, tags?, search?, limit?, cursor?, fields?` | readOnly, idempotent | Базовая навигация по хранилищу |
| `search_tabs` | `query (required), mode?, limit?, groupId?` | readOnly, idempotent | Семантический поиск — основной способ агента «вспомнить», что было сохранено |
| `get_tab` | `id (required)` | readOnly, idempotent | Точечное чтение одной вкладки перед изменением |
| `save_tab` | `url (required), title?, note?, tags?, groupId?` | не readOnly, не destructive, не idempotent (создаёт новую сущность при повторе без dedupe) | Главная операция — агент сохраняет находку из веба |
| `save_tabs_batch` | `tabs: array<{url, title?, ...}>` | не readOnly | Массовое сохранение (например, агент распарсил список ссылок из статьи) |
| `update_tab` | `id (required), title?, note?, tags?, groupId?` | не readOnly, не destructive, idempotent | Правка метаданных без потери остального |
| `delete_tab` | `id (required), hard?` | destructive | Удаление; `hard=false` по умолчанию — обратимо |
| `move_tab` | `id (required), targetGroupId?, position?` | не readOnly, идempotent | Реорганизация без явного update всех полей |
| `list_groups` | `flat?` | readOnly, idempotent | Агенту нужно знать структуру дерева групп перед тем, как решить, куда класть вкладку |
| `create_group` | `name (required), parentId?, color?` | не readOnly | Агент может сам создать «Research/LLM papers», если такой ветки ещё нет |
| `update_group` / `delete_group` | — | не readOnly / destructive | Реорганизация структуры по запросу пользователя |
| `list_tags` | — | readOnly, idempotent | Агенту нужен словарь тегов, чтобы не плодить синонимы (`llm` vs `LLM` vs `machine-learning`) |
| `tag_tab` / `untag_tab` | `tabId, tagName` | не readOnly | Точечное добавление/снятие тега без полного update |
| `export_data` | `format (json\|markdown), scope?, fields?` | readOnly, idempotent | Агент выгружает бэкап или отдаёт человеку список для чата |
| `import_data` | `mode (required), format, content` | destructive (при `mode=replace`) | Восстановление / массовая загрузка данных, которые агент сам сформировал |
| `validate_import` | тот же вход, что `import_data` | readOnly, idempotent | Критично: агент может «прорепетировать» импорт и почитать ошибки без риска что-то сломать — прямое следствие требования к подробным ошибкам вместо тихого падения |

## Желательные / вероятно понадобятся (не MVP, но продумать заранее)

- **`get_tab_context`** — расширенная выдача: вкладка + путь до корня в дереве групп (breadcrumb) + список «похожих» вкладок (топ-3 по semantic similarity). Экономит агенту отдельный вызов `search_tabs`, когда нужно «понять контекст» одной ссылки перед решением, куда её положить.
- **`suggest_group_for_tab`** — на основе эмбеддинга title/note возвращает наиболее подходящую существующую группу (по схожести с уже лежащими там вкладками). Полезно для авто-раскладки Inbox без явного правила.
- **`merge_duplicate_tabs`** — находит вкладки с одинаковым нормализованным URL по всему хранилищу (не только при импорте) и предлагает/выполняет слияние. Актуально, если dedupe при create был отключён или база собиралась до того, как правило появилось.
- **`bulk_tag`** — применить тег к результатам последнего `search_tabs`/`list_tabs` без передачи списка id вручную (composability — MCP-паттерн «предыдущий результат как неявный вход» [web:58]).
- **`get_export_diff`** — принимает два снапшота (или snapshot + текущее состояние) и возвращает человекочитаемый diff, что изменилось. Полезно перед `import_data(mode=replace)`, чтобы агент мог explain пользователю, что откатывается.
- **`archive_group` / `restore_group`** — мягкое скрытие целой ветки без удаления (отличается от `delete_group`), для случаев «сейчас не нужно, но не выбрасывать».
- **`get_backup_list` / `restore_backup`** — прямой доступ к автоматическим snapshot'ам (§6 API) через MCP, чтобы агент мог сам предложить пользователю «откатиться на вчерашнюю версию», а не только человек через UI.
- **`describe_schema`** — возвращает актуальную JSON Schema (текущей версии `schemaVersion`) и грамматику Markdown-формата прямо в MCP-ответе (а не только как статический файл). Снимает необходимость агенту заранее знать формат — он может запросить его в моменте перед тем, как формировать `import_data`.

## Почему именно так — три принципа из спецификации MCP 2026

1. **Fewer tools, task-oriented.** Вместо одного универсального `crud_tab(action, ...)` — отдельные `save_tab`/`update_tab`/`delete_tab`/`move_tab`: явные глаголы снижают ошибки выбора инструмента моделью [web:57][web:58].
2. **Annotations как контракт, не документация.** `destructiveHint`/`idempotentHint` на каждом tool — это не просто описание для человека, а сигнал клиенту MCP (например, Claude Desktop может требовать доп. подтверждение перед вызовом tool с `destructiveHint: true`) [web:48][web:52].
3. **`validate_import` как отдельный readOnly tool, а не флаг у `import_data`.** Разделение операций «попробовать» и «применить» — прямое следствие того, что подробные ошибки должны быть доступны агенту **до** того, как он рискует что-то испортить, а не только в ответе на уже совершённую мутацию.

## Открытый вопрос к следующей итерации

Нужно решить, возвращают ли read-tools (`list_tabs`, `search_tabs`) сразу полный объект вкладки или **handle/URI** с последующим точечным `get_tab` — по рекомендации 2026 крупные payload'ы лучше не инлайнить целиком в результат tool-вызова, а отдавать ссылку/id [web:52]. Для небольших хранилищ (сотни вкладок) это, вероятно, избыточно — стоит мерить реальный объём токенов на типичный `list_tabs` ответ перед решением.
