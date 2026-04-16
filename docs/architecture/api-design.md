# API Design

## 1. Route Architecture

Complete route tree for V1. Routes marked **NEW** do not exist yet.

```
app.jsx                                    Layout, NavMenu
├── app._index.jsx                         Dashboard
├── app.onboarding.tsx                     Guided setup wizard — NEW
├── app.resources.$type._index.jsx         Resource list (paginated)
├── app.resources.$type.$id.jsx            Translation editor (side-by-side)
├── app.auto-translate.jsx                 Job management (list + create)
├── app.auto-translate.$jobId.tsx          Job detail (progress, entries) — NEW
├── app.markets.jsx                        Markets overview
├── app.markets.$marketId.tsx              Market detail (stats, config) — NEW
├── app.images._index.jsx                  Image gallery
├── app.images.$resourceId.jsx             Image editor (per product)
├── app.glossary.tsx                       Glossary management — NEW
├── app.glossary.import.tsx                CSV import — NEW
├── app.analytics.tsx                      Translation analytics — NEW
├── app.analytics.usage.tsx                Usage tracking — NEW
├── app.settings.jsx                       Provider config
├── app.settings.brand-voice.tsx           Brand voice config — NEW
├── app.alerts.tsx                         Alert center — NEW
├── api.image-gallery.jsx                  Public API (App Proxy)
├── api.translation-status.tsx             SSE for job progress — NEW
├── auth.$.jsx                             Auth callback
├── auth.login/route.jsx                   Login page
├── webhooks.app.uninstalled.jsx           Uninstall cleanup
├── webhooks.app.scopes_update.jsx         Scope update
├── webhooks.products.update.tsx           Auto-sync trigger — NEW
└── webhooks.collections.update.tsx        Auto-sync trigger — NEW
```

**Total:** 26 routes (15 existing + 11 new)

## 2. Route Conventions

### Authentication

Every app route starts with:
```typescript
const { admin, session } = await authenticate.admin(request);
const { shop } = session;
```

Webhook routes use `authenticate.webhook(request)` instead. Public API routes validate the Shopify HMAC signature.

### Loader Pattern

```typescript
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  // Call service(s)
  const data = await someService.fetchData(admin, shop, params);

  // Return typed plain object
  return json({ data });
}
```

### Action Pattern

```typescript
export async function action({ request, params }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const _action = formData.get("_action");

  switch (_action) {
    case "save": {
      // Parse, validate, call service
      const result = await someService.save(admin, shop, parsed);
      return json({ success: true, data: result });
    }
    case "delete": {
      await someService.delete(admin, shop, parsed);
      return json({ success: true });
    }
    default:
      return json({ error: "Unknown action" }, { status: 400 });
  }
}
```

### Response Shapes

```typescript
// Success
{ success: true, data: { ... } }

// Error
{ error: "Human-readable message", field?: "fieldName" }

// List with pagination
{ resources: [...], pageInfo: { hasNextPage: boolean, endCursor: string | null }, totalCount?: number }
```

## 3. New Route Specifications

### `app.onboarding.tsx` — NEW

**Loader:** Fetch `OnboardingState` for shop. If `completedAt` is set, redirect to dashboard. Fetch shop locales and markets from Shopify.

```typescript
// Returns:
{
  onboardingState: { step, completedSteps, primaryLocale, targetLocales, selectedProvider },
  shopLocales: { locale, name, primary, published }[],
  markets: { id, name, locales }[]
}
```

**Actions:**
- `_action: "next_step"` — Advance step, save selections to OnboardingState
- `_action: "skip_step"` — Mark step as skipped, advance
- `_action: "complete"` — Set `completedAt`, redirect to dashboard
- `_action: "start_initial_translate"` — Create TranslationJob for selected resources, then complete

**UI:** Polaris `Wizard` pattern with progress bar. Steps: Welcome → Select Languages → Choose Provider → Brand Voice (optional) → Initial Translate (optional) → Done.

**Services:** `onboardingState` CRUD via Prisma, `markets.server.ts`, `shopLocales` query

---

### `app.auto-translate.$jobId.tsx` — NEW

**Loader:** Fetch TranslationJob by ID with entries (paginated). Verify job belongs to current shop.

```typescript
// Returns:
{
  job: { id, status, provider, resourceType, sourceLocale, targetLocale, totalItems, completedItems, failedItems, errorMessage, createdAt },
  entries: { id, resourceId, key, status, errorMessage, translatedValue }[],
  pageInfo: { hasNextPage, endCursor }
}
```

**Actions:**
- `_action: "retry_failed"` — Re-queue failed entries for translation
- `_action: "cancel"` — Set job status to "failed" with "Cancelled by merchant" message

**UI:** Progress bar, status badge, sortable entry table (filter by status), retry button for failed entries, cancel button for running jobs.

**Services:** `auto-translate.server.ts` (job fetch, retry, cancel)

---

### `app.markets.$marketId.tsx` — NEW

**Loader:** Fetch market details from Shopify (name, locales, countries). Fetch TranslationStats filtered by marketId.

```typescript
// Returns:
{
  market: { id, name, locales, countries },
  stats: { resourceType, locale, totalSampled, translatedCount, hasResources }[],
  recentJobs: { id, status, provider, targetLocale, completedAt }[]
}
```

**Actions:**
- `_action: "auto_translate"` — Create TranslationJob scoped to this market

**UI:** Market header, per-locale coverage table, recent job list, "Auto-translate this market" button.

**Services:** `markets.server.ts`, `translatable-resources.server.ts` (stats), `auto-translate.server.ts`

---

### `app.glossary.tsx` — NEW

**Loader:** Fetch GlossaryTerms for shop (paginated, filterable by locale pair).

```typescript
// Returns:
{
  terms: { id, sourceLocale, targetLocale, sourceTerm, targetTerm, caseSensitive, neverTranslate }[],
  pageInfo: { hasNextPage, endCursor },
  totalCount: number,
  localePairs: { source, target }[]  // For filter dropdown
}
```

**Actions:**
- `_action: "create"` — Create new glossary term
- `_action: "update"` — Update existing term
- `_action: "delete"` — Delete term
- `_action: "export_csv"` — Generate CSV and return as download

**UI:** Data table with inline edit, add term form/modal, locale pair filter, export CSV button, link to import page.

**Services:** `glossary.server.ts`

---

### `app.glossary.import.tsx` — NEW

**Loader:** Minimal — just auth check.

**Actions:**
- `_action: "preview"` — Parse uploaded CSV, validate, return preview with errors highlighted
- `_action: "import"` — Bulk upsert validated terms

```typescript
// Preview returns:
{
  preview: { row, sourceTerm, targetTerm, sourceLocale, targetLocale, valid, error? }[],
  validCount: number,
  errorCount: number
}
```

**UI:** File upload (drag-and-drop), preview table with validation errors highlighted in red, confirm import button.

**Services:** `glossary.server.ts` (CSV parsing, validation, bulk upsert)

---

### `app.analytics.tsx` — NEW

**Loader:** Fetch translation coverage stats (per locale, per resource type, per market). Fetch stale translation count.

```typescript
// Returns:
{
  coverage: { locale, resourceType, marketId?, total, translated, percentage }[],
  staleCount: number,
  recentAlerts: { id, type, severity, message, createdAt }[],
  overallPercentage: number
}
```

**Actions:** None (read-only dashboard).

**UI:** Donut charts (coverage per locale), resource type breakdown table, stale translations callout, recent alerts summary.

**Services:** `analytics.server.ts`, `alerts.server.ts`

---

### `app.analytics.usage.tsx` — NEW

**Loader:** Fetch UsageTracking records (filterable by date range, provider).

```typescript
// Returns:
{
  usage: { date, provider, characterCount, requestCount, locale }[],
  totals: { provider, totalCharacters, totalRequests, estimatedCost }[],
  dateRange: { start, end }
}
```

**Actions:** None (read-only).

**UI:** Bar chart (usage per provider per day), totals table, date range picker, estimated cost display.

**Services:** `analytics.server.ts`

---

### `app.settings.brand-voice.tsx` — NEW

**Loader:** Fetch BrandVoiceConfig for shop (or defaults if not configured).

```typescript
// Returns:
{
  config: { tone, style, instructions } | null
}
```

**Actions:**
- `_action: "save"` — Upsert BrandVoiceConfig

**UI:** Tone dropdown, style dropdown, free-text instructions textarea, save button, preview section showing how the AI prompt will look.

**Services:** `brand-voice.server.ts`

---

### `app.alerts.tsx` — NEW

**Loader:** Fetch TranslationAlerts for shop (paginated, active first).

```typescript
// Returns:
{
  alerts: { id, type, severity, message, resourceId, locale, jobId, dismissed, createdAt }[],
  activeCount: number,
  pageInfo: { hasNextPage, endCursor }
}
```

**Actions:**
- `_action: "dismiss"` — Mark alert as dismissed
- `_action: "dismiss_all"` — Mark all alerts as dismissed

**UI:** Alert cards (color-coded by severity), dismiss button per alert, bulk dismiss, link to affected resource/job.

**Services:** `alerts.server.ts`

---

### `api.translation-status.tsx` — NEW

**Purpose:** Server-Sent Events endpoint for real-time job progress.

**Loader:** Authenticate, start SSE stream. Poll TranslationJob progress every 2 seconds, emit events on change.

```typescript
// SSE event format:
event: progress
data: { "jobId": "...", "status": "running", "completedItems": 42, "totalItems": 100 }

event: complete
data: { "jobId": "...", "status": "completed", "completedItems": 100, "totalItems": 100 }

event: error
data: { "jobId": "...", "status": "failed", "errorMessage": "..." }
```

**Services:** Direct Prisma query for job status (lightweight, no service abstraction needed)

---

### `webhooks.products.update.tsx` — NEW

**Purpose:** Trigger content hash check when a product is updated.

**Handler:** Validate webhook HMAC → extract product ID → call `content-sync.server.ts` → compare content hashes → if changed, queue auto-sync job (if merchant has auto-sync enabled).

**Services:** `content-sync.server.ts`

---

### `webhooks.collections.update.tsx` — NEW

**Purpose:** Same pattern as products.update but for collections.

**Services:** `content-sync.server.ts`

## 4. Service Layer API

### Existing Services (Preserve)

#### `translation.server.js`

- `registerTranslations(admin, resourceId, translations, locale, marketId?)` — Register translations with Shopify via `translationsRegister` mutation
- `removeTranslations(admin, resourceId, translationKeys, locale)` — Remove translations via `translationsRemove` mutation

#### `translatable-resources.server.js`

- `fetchTranslatableResources(admin, resourceType, locale, cursor?, limit?)` — Fetch paginated list of translatable resources
- `fetchTranslatableResource(admin, resourceId, locale)` — Fetch single resource with translatable fields and existing translations
- `fetchTranslatableResourcesWithTranslations(admin, resourceType, locale, cursor?, limit?)` — Fetch resources with translation status

#### `auto-translate.server.js`

- `createAutoTranslateJob(admin, prisma, shop, options)` — Create and execute auto-translation job
- `translateBatch(admin, provider, texts, sourceLang, targetLang)` — Translate a batch of texts

#### `markets.server.js`

- `fetchMarkets(admin)` — Fetch all markets with their locales

#### `image-translation.server.js`

- `getImageTranslations(prisma, shop, resourceId, locale, marketId?)` — Get image mappings
- `saveImageTranslation(prisma, shop, data)` — Save image mapping
- `deleteImageTranslation(prisma, id)` — Delete image mapping

### New Services

#### `glossary.server.ts` — NEW

- `getGlossaryTerms(prisma, shop, options?: { sourceLocale?, targetLocale?, cursor?, limit? })` — Paginated glossary terms
- `createGlossaryTerm(prisma, shop, term)` — Create term (validate uniqueness)
- `updateGlossaryTerm(prisma, id, updates)` — Update term
- `deleteGlossaryTerm(prisma, id)` — Delete term
- `importFromCSV(prisma, shop, csvContent: string)` — Parse, validate, bulk upsert
- `exportToCSV(prisma, shop, options?: { sourceLocale?, targetLocale? })` — Generate CSV string
- `applyGlossary(text: string, terms: GlossaryTerm[], direction: "pre" | "post")` — Pre-translation: wrap protected terms in placeholders. Post-translation: restore protected terms and enforce term translations.

#### `brand-voice.server.ts` — NEW

- `getBrandVoiceConfig(prisma, shop)` — Get config or null
- `saveBrandVoiceConfig(prisma, shop, config)` — Upsert config
- `buildAISystemPrompt(config: BrandVoiceConfig, glossaryTerms: GlossaryTerm[], context?: ResourceContext)` — Construct the AI system prompt with brand voice, glossary rules, and product context

#### `analytics.server.ts` — NEW

- `getTranslationCoverage(prisma, admin, shop, options?: { locale?, marketId?, resourceType? })` — Coverage stats
- `getUsageStats(prisma, shop, dateRange: { start, end }, provider?)` — Usage aggregation
- `trackUsage(prisma, shop, provider, locale, characterCount, requestCount)` — Increment daily usage
- `getStaleTranslations(prisma, admin, shop, locale)` — Compare ContentDigest with current Shopify content
- `getOverallCoverage(prisma, shop)` — Single percentage across all locales/types

#### `alerts.server.ts` — NEW

- `createAlert(prisma, shop, alert: { type, severity, message, resourceId?, locale?, jobId? })` — Create alert
- `getAlerts(prisma, shop, options?: { dismissed?, cursor?, limit? })` — Paginated alerts
- `dismissAlert(prisma, id)` — Mark alert as dismissed
- `dismissAllAlerts(prisma, shop)` — Dismiss all
- `getActiveAlertCount(prisma, shop)` — Count for nav badge

#### `content-sync.server.ts` — NEW

- `computeContentHash(content: string)` — SHA-256 hash
- `checkForChanges(prisma, admin, shop, resourceId)` — Compare stored hash with current Shopify content
- `updateContentDigest(prisma, shop, resourceId, fieldKey, contentHash)` — Store/update hash
- `triggerAutoSync(prisma, admin, shop, changedResourceIds: string[])` — Create auto-translate job for changed resources

#### `providers/ai-provider.server.ts` — NEW

- `translateWithAI(options: { texts, sourceLang, targetLang, provider: "claude" | "openai", systemPrompt, model? })` — Send to Claude/OpenAI API
- `generateSuggestions(options: { resources, sourceLang, targetLang, brandVoice?, glossary?, provider })` — Generate TranslationSuggestion records
- `estimateTokens(texts: string[])` — Estimate token count before API call
- `estimateCost(tokenCount: number, provider: string)` — Estimate cost in USD

## 5. Shopify GraphQL API Patterns

### Existing Queries & Mutations

| File | Operation | Estimated Cost | Used By |
|------|-----------|-------|---------|
| `queries/translatableResources.js` | List translatable resources (paginated) | 10-20 points | Resource list, auto-translate |
| `queries/translatableResource.js` | Single resource with translatable fields | 5-10 points | Translation editor |
| `queries/translatableResourcesWithTranslations.js` | Resources with translation status | 15-25 points | Stats, coverage |
| `queries/nestedTranslatableResources.js` | Nested resources (e.g., product variants) | 10-20 points | Translation editor |
| `queries/markets.js` | List all markets | 5 points | Markets page, locale selector |
| `queries/shopLocales.js` | List shop locales | 2 points | Language selector, onboarding |
| `mutations/translationsRegister.js` | Register translations | 10 points | Save translations |
| `mutations/translationsRemove.js` | Remove translations | 10 points | Remove translations |

### New Queries Needed

| Query | Purpose | Estimated Cost |
|-------|---------|-------|
| `translatableResourcesByIds` | Batch fetch specific resources by ID | 10-20 points |
| Bulk operation queries | Large dataset operations (10,000+ resources) | Variable |

### New Mutations Needed

| Mutation | Purpose | Estimated Cost |
|----------|---------|-------|
| `metafieldsSet` | Set image gallery metafield on products | 10 points |

### Rate Limiting Strategy

- Shopify GraphQL Admin API: **1,000 cost points per second** (bucket refills)
- Track available points via `extensions.cost` in GraphQL responses
- If available points < 100: pause and wait for refill
- Background jobs: add 100ms delay between batches to avoid bursting
- UI requests: no artificial delay (single queries, low cost)

### Pagination Contract

- **UI lists:** `first: 25` with cursor pagination (Polaris `IndexTable` pattern)
- **Background jobs:** `first: 50` with cursor pagination (larger batches for efficiency)
- **Always cursor-based:** Never use offset pagination with Shopify API

## 6. External API Integrations

### Google Translate

- **API:** Cloud Translation API v2 (REST)
- **Batch size:** Up to 128 texts per request
- **Rate limits:** 600,000 characters/minute (default quota)
- **Pricing:** $20 per million characters
- **Auth:** API key in header
- **Error handling:** 429 (rate limit) → retry with backoff, 400 (bad request) → surface to user

### DeepL

- **API:** DeepL API v2 (REST)
- **Batch size:** Up to 50 texts per request
- **Rate limits:** Varies by plan (Free: 500,000 chars/month, Pro: unlimited)
- **Pricing:** Free tier available, Pro from $5.49/month + $25/million chars
- **Auth:** API key in `Authorization: DeepL-Auth-Key` header
- **Error handling:** 429 → retry, 456 (quota exceeded) → alert merchant

### Claude API (NEW)

- **API:** Messages API (`POST /v1/messages`)
- **Model:** `claude-sonnet-4-5-20241022` for quality, `claude-haiku-4-5-20251001` for speed/budget
- **Token limits:** 200K input, 8K output (Sonnet)
- **Pricing:** Sonnet: $3/$15 per million input/output tokens; Haiku: $0.80/$4
- **Auth:** API key in `x-api-key` header
- **System prompt:** Brand voice + glossary + product context (see [Differentiators](differentiators.md))
- **Response format:** Request JSON output with structured schema

### OpenAI (NEW)

- **API:** Chat Completions (`POST /v1/chat/completions`)
- **Model:** `gpt-4o` for quality, `gpt-4o-mini` for speed/budget
- **Token limits:** 128K context window
- **Pricing:** GPT-4o: $2.50/$10 per million input/output tokens; Mini: $0.15/$0.60
- **Auth:** API key in `Authorization: Bearer` header
- **System prompt:** Same structure as Claude
- **Response format:** Request JSON output via `response_format: { type: "json_object" }`

## 7. Webhook Design

### `webhooks.products.update.tsx`

**Trigger:** Shopify sends when any product is created or updated.

**Flow:**
1. Validate HMAC signature via `authenticate.webhook(request)`
2. Extract product ID from payload
3. Call `content-sync.server.ts → checkForChanges()`
4. If content hash differs from stored `ContentDigest`:
   a. Update `ContentDigest` with new hash
   b. Check if merchant has auto-sync enabled for this resource type
   c. If yes: create `TranslationJob` for changed fields only
5. Return 200 OK

**Idempotency:** The content hash comparison is inherently idempotent — if the same webhook fires twice, the second comparison finds no change and takes no action.

### `webhooks.collections.update.tsx`

Same pattern as `products.update`, but for collection resources.

### HMAC Validation

All webhook routes use `authenticate.webhook(request)` from `@shopify/shopify-app-remix`, which validates the `X-Shopify-Hmac-Sha256` header against the app's API secret. Invalid signatures return 401 automatically.

### Registration

Webhooks are declared in `shopify.app.toml`:
```toml
[webhooks]
api_version = "2026-04"

  [[webhooks.subscriptions]]
  topics = ["app/uninstalled"]
  uri = "/webhooks/app/uninstalled"

  [[webhooks.subscriptions]]
  topics = ["app/scopes_update"]
  uri = "/webhooks/app/scopes_update"

  [[webhooks.subscriptions]]
  topics = ["products/update"]
  uri = "/webhooks/products/update"

  [[webhooks.subscriptions]]
  topics = ["collections/update"]
  uri = "/webhooks/collections/update"
```

---

**See also:** [Architecture](architecture.md) for layer diagram · [Data Model](data-model.md) for Prisma models · [DX Guide](dx-guide.md) for conventions
