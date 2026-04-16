# Architecture

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          STOREFRONT                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Theme Extension (image-swap, language-switcher)             │   │
│  │  - Vanilla JS, localStorage cache, MutationObserver          │   │
│  └──────────────────┬───────────────────────────────────────────┘   │
└─────────────────────┼───────────────────────────────────────────────┘
                      │ (App Proxy)
┌─────────────────────┼───────────────────────────────────────────────┐
│                     ▼                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Remix App Routes (thin controllers)                         │   │
│  │  - Authentication, request parsing, response formatting      │   │
│  │  - No business logic                                         │   │
│  └──────────────────┬───────────────────────────────────────────┘   │
│                     │                                               │
│  ┌──────────────────▼──────────────────────────────────────────┐    │
│  │  Service Layer (business logic)                              │    │
│  │  - Translation, auto-translate, markets, images, glossary,   │    │
│  │    analytics, alerts, content-sync, brand-voice              │    │
│  └───────┬────────────────────┬────────────────────┬───────────┘    │
│          │                    │                    │                 │
│  ┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐       │
│  │ Shopify GraphQL │  │  Database       │  │  Translation   │       │
│  │ API             │  │  (Prisma/SQLite │  │  Providers     │       │
│  │                 │  │   → Postgres)   │  │  (Google,      │       │
│  │ - Resources     │  │                 │  │   DeepL,       │       │
│  │ - Translations  │  │ - Jobs          │  │   Claude,      │       │
│  │ - Markets       │  │ - Config        │  │   OpenAI)      │       │
│  │ - Locales       │  │ - Analytics     │  │                │       │
│  └─────────────────┘  └─────────────────┘  └────────────────┘       │
│                                                                     │
│                          APP SERVER                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Layer Responsibilities

### Routes (`app/routes/`)

Authentication, request parsing, and response formatting. Routes are **thin controllers** — they call into services and return the result. No business logic lives here.

**Responsibilities:**
- Call `authenticate.admin(request)` to establish session
- Parse form data from actions
- Call service functions with parsed parameters
- Format service results as JSON responses
- Handle HTTP-level concerns (status codes, redirects)

**Does NOT do:** GraphQL queries, database access, translation logic, provider calls.

### Services (`app/services/`)

All business logic. Each service is a module with exported functions (not classes). Services coordinate between Shopify's GraphQL API, the database, and translation providers.

**Current services:**
- `translation.server.js` — register/remove translations with Shopify
- `translatable-resources.server.js` — fetch resources and their translatable content
- `auto-translate.server.js` — orchestrate batch auto-translation jobs
- `markets.server.js` — fetch market configuration
- `image-translation.server.js` — manage image swaps per locale/market

**V1 new services:**
- `glossary.server.ts` — CRUD glossary terms, CSV import/export, enforcement
- `brand-voice.server.ts` — CRUD brand voice config, AI prompt injection
- `analytics.server.ts` — coverage, usage, stale detection
- `alerts.server.ts` — create/dismiss/list alerts
- `content-sync.server.ts` — content hashing and auto-sync logic
- `providers/ai-provider.server.ts` — Claude/OpenAI adapter

### GraphQL (`app/graphql/`)

Query and mutation definitions for the Shopify Admin API. Used exclusively by services — never imported directly by routes.

**Current files:**
- Queries: `markets.js`, `shopLocales.js`, `translatableResource.js`, `translatableResources.js`, `translatableResourcesWithTranslations.js`, `nestedTranslatableResources.js`
- Mutations: `translationsRegister.js`, `translationsRemove.js`

### Database (`prisma/`)

Data persistence via Prisma ORM. SQLite for development, PostgreSQL target for production. Accessed exclusively through services.

**Current models:** Session, TranslationJob, TranslationJobEntry, TranslationProviderConfig, ImageTranslation, TranslationStats

### Providers (`app/services/providers/`)

Translation API adapters behind a common interface. Factory pattern via `createProvider()`.

**Common interface:**
```
translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]>
validateApiKey(): Promise<boolean>
getSupportedLanguages(): Promise<Language[]>
```

**Current:** Google Translate, DeepL (both in `provider-interface.server.js`)
**V1 new:** AI provider (Claude API, OpenAI) with context and brand voice injection

### Theme Extension (`extensions/`)

Storefront-side JavaScript for image swapping and (future) language switching. Communicates with the app via App Proxy endpoints.

**Current:** `langshop-image-swap` — vanilla JS with localStorage cache, MutationObserver for dynamic content
**V1 new:** `langshop-switcher` — language/currency switcher widget

### Utils (`app/utils/`)

Pure functions for data transformation, mapping, and formatting. No side effects, no API calls.

**Current:** `locale-utils.js` (locale display names), `resource-type-map.js` (resource type configuration)
**V1 new:** `content-hash.ts` (SHA-256 for content diffing)

## 3. Data Flow Diagrams

### Manual Translation

```
Merchant clicks "Save" on translation editor
    │
    ▼
Route Action (app.resources.$type.$id)
    │  Parse formData: locale, marketId, translations[]
    ▼
translation.server.ts → registerTranslations()
    │  Build translationsRegister input
    ▼
Shopify GraphQL API → translationsRegister mutation
    │  Include marketId for market-scoped translation
    │  Include translatableContentDigest for conflict detection
    ▼
Check userErrors in response
    │
    ├── Success → Return { success: true } → Green toast in UI
    │
    └── Error → Return { error: message, field } → Red banner in UI
```

### Auto-Translate Job

```
Merchant clicks "Start Auto-Translate"
    │
    ▼
Route Action → auto-translate.server.ts → createJob()
    │  Create TranslationJob record (status: "pending")
    ▼
Background Worker picks up job (status → "running")
    │
    ▼
Loop: Paginate resources (cursor-based, 50 per page)
    │
    ├── For each batch:
    │   │
    │   ▼
    │   Fetch translatable content from Shopify GraphQL
    │   │
    │   ▼
    │   Load glossary rules for this locale pair
    │   │
    │   ▼
    │   Apply pre-translation glossary (wrap protected terms)
    │   │
    │   ▼
    │   Send to translation provider (Google/DeepL/AI)
    │   │
    │   ▼
    │   Apply post-translation glossary (restore protected terms)
    │   │
    │   ▼
    │   Register translations with Shopify (translationsRegister)
    │   │
    │   ▼
    │   Update job progress (completedItems++)
    │   │
    │   ▼
    │   Create TranslationJobEntry records (per field)
    │   │
    │   ▼
    │   Log to TranslationAuditLog
    │   │
    │   ▼
    │   Update UsageTracking (characters, requests)
    │
    └── On error:
        │  Create TranslationJobEntry (status: "failed")
        │  Create TranslationAlert
        │  Increment failedItems
        │  Continue to next batch (don't abort entire job)
    │
    ▼
Job complete → status: "completed" or "partially_failed"
    │
    ▼
UI notified via SSE (or polling as fallback)
```

### Image Swap (Storefront)

```
Visitor loads product page
    │
    ▼
Theme Extension JS initializes
    │  Detect current locale from Shopify.locale
    ▼
Check localStorage cache
    │  Key: `langshop-images-{productId}-{locale}`
    │  TTL: 5 minutes
    │
    ├── Cache HIT → Parse cached image mappings
    │
    └── Cache MISS:
        │
        ▼
        Fetch App Proxy endpoint
        │  GET /apps/langshop/image-gallery?resourceId={id}&locale={locale}
        ▼
        api.image-gallery route
        │  Validate Shopify HMAC signature
        ▼
        image-translation.server.ts → getImageMappings()
        │  Query ImageTranslation records from Prisma
        ▼
        Return JSON: { images: [{ original, translated, position }] }
        │
        ▼
        Cache response in localStorage
    │
    ▼
Swap img src and srcset attributes in DOM
    │  Match by image URL or position
    ▼
MutationObserver watches for lazy-loaded images
    │  Swap new images as they appear in DOM
```

## 4. Component Boundaries

### Route ↔ Service

Routes pass **plain objects** to services and receive plain objects back. Never pass Prisma models or raw GraphQL responses across this boundary.

```
// Route → Service
{ shop, resourceType, locale, marketId, page }

// Service → Route
{ resources: [...], pageInfo: { hasNextPage, endCursor }, totalCount }
```

### Service ↔ Provider

Providers receive a standard translation request and return translations in the same order.

```
// Service → Provider
{ texts: string[], sourceLang: string, targetLang: string }

// Provider → Service
{ translations: string[] }

// AI Provider extends with context
{ texts: string[], sourceLang: string, targetLang: string,
  context?: { resourceType, category, tags, collection },
  brandVoice?: { tone, style, instructions },
  glossary?: { terms: GlossaryTerm[] } }
```

### Service ↔ Database

Services use the Prisma client directly with typed models. All database access is through services — no direct Prisma calls from routes.

### Service ↔ Shopify API

Services construct GraphQL queries using definitions from `app/graphql/` and execute via the `admin.graphql()` client from `authenticate.admin()`. Variables are typed, responses are validated for `userErrors`.

## 5. Background Job Architecture

### Current State

Auto-translate runs **inline** — the route action starts the translation loop and the response waits until complete. This blocks the UI for large jobs and risks timeout.

### Target Architecture

Database-backed job queue with asynchronous processing.

**Job lifecycle:**

```
pending → running → completed
                  → failed
                  → partially_failed (some entries failed)
```

**Job fields:** `status`, `totalItems`, `completedItems`, `failedItems`, `errorMessage`, `retryCount`, `scheduledAt`, `startedAt`, `completedAt`

**Progress tracking:** `completedItems / totalItems` updated per batch. UI reads progress via loader revalidation (current) or SSE (target).

**Concurrency:** One active job per shop at a time. Prevents API rate limit exhaustion and ensures predictable resource usage. Additional jobs queue as `pending`.

**Retry logic:** On provider error, retry individual batch with exponential backoff (1s, 2s, 4s). Max 3 retries per batch. Failed batches create entries with `status: "failed"` and `errorMessage`.

**UI notification:**
- Current: `useRevalidator()` polling on the auto-translate page
- Target: Server-Sent Events (SSE) via `api.translation-status` route for real-time progress

## 6. Caching Strategy

| Data | Storage | TTL | Invalidation |
|------|---------|-----|-------------|
| Translation stats (coverage %) | Prisma (TranslationStats) | 30 minutes | On translation register/remove |
| Resource metadata | In-memory per request | Request lifetime | None needed |
| Storefront image gallery | localStorage (client) | 5 minutes | On image mapping change |
| Glossary rules | Prisma, loaded per job/session | Job lifetime | On glossary CRUD |
| Provider rate limits | In-memory token bucket | Per provider reset window | Reset on restart |

**Design principle:** Cache aggressively for read-heavy operations (stats, images), invalidate eagerly for write operations (translations, config changes). No distributed cache for V1 — single-server deployment.

## 7. Error Handling Strategy

### Category 1: User Errors (bad input, invalid API key)

**Source:** Invalid form data, misconfigured provider, missing permissions
**Handling:** Return to UI with actionable message and field identifier
**Example:** `{ error: "Invalid DeepL API key. Please check your key in Settings.", field: "apiKey" }`
**Merchant visibility:** Inline form error or banner on the current page

### Category 2: Shopify API Errors (rate limit, server error)

**Source:** GraphQL rate limit (1,000 cost points/second), 5xx responses, network timeouts
**Handling:** Retry with exponential backoff (1s, 2s, 4s). Max 3 retries. Log to TranslationJobEntry on final failure.
**Example:** Rate limit → wait for `Retry-After` header → retry
**Merchant visibility:** Job progress shows retrying status. Final failure creates TranslationAlert.

### Category 3: Provider Errors (translation failure, quota exceeded)

**Source:** Google/DeepL/AI API errors, quota exhaustion, malformed responses
**Handling:** Log to database (`TranslationJobEntry.status = "failed"`, `errorMessage`). Create TranslationAlert. Continue processing remaining items.
**Example:** DeepL quota exceeded → alert: "DeepL translation quota exhausted. 47 items could not be translated."
**Merchant visibility:** Alert badge in nav, dedicated alert center, per-job error details

### Zero Silent Failures Principle

Every error category has a merchant-visible path. No translation operation can fail without creating either:
1. An inline error response (for synchronous operations), or
2. A `TranslationAlert` record (for background operations)

## 8. Security Considerations

### Authentication

- All app routes behind `authenticate.admin(request)` — Shopify session-based auth
- App Proxy endpoints validate Shopify HMAC signature
- No custom auth system — rely entirely on Shopify's authentication

### API Keys

- Provider API keys stored in Prisma (`TranslationProviderConfig.apiKey`)
- **Known gap:** Keys are stored as plaintext. Encryption at rest required before public launch.
- All provider API calls are server-side — no keys exposed to client

### CORS

- Public API endpoints (App Proxy) set `Access-Control-Allow-Origin` for storefront domain
- Admin routes do not need CORS (embedded app, same-origin via Shopify)

### Input Validation

- All route actions validate form data before passing to services
- GraphQL variables are typed — Shopify API rejects invalid input
- CSV imports (glossary) are validated and sanitized before database insertion

### Secrets

- No client-side secrets — all sensitive operations are server-side
- Environment variables: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`
- Provider API keys: stored per-shop in database, not in environment

---

**See also:** [Data Model](data-model.md) for schema details · [API Design](api-design.md) for route specifications · [DX Guide](dx-guide.md) for conventions
