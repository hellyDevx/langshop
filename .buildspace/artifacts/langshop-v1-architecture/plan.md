# Plan: LangShop V1 Architecture Documentation Suite

**Complexity:** High
**Files to create:** 10 (all in `docs/architecture/`)
**Files to modify:** 0

## Approach

Create a comprehensive architecture documentation suite that captures every decision needed for V1 implementation. Each document is self-contained but cross-references others. The documentation is informed by deep codebase analysis of the existing working prototype (19 routes, 6 services, 8 GraphQL files, 5 Prisma models, 1 theme extension) — preserving patterns that work (service layer, cursor pagination, market-aware queries, provider factory) while documenting improvements needed (TypeScript migration, background jobs, AI providers, glossary system, analytics).

The execution order follows dependency: vision first (informs everything), then architecture (informs data model and API), then features (maps to execution plan), then supporting docs. Each document specifies exact sections so `/execute` writes content, not structure.

## Codebase Context

Key findings from analysis that shape documentation decisions:

- **Naming:** Routes use kebab-case dot-notation (`app.resources.$type.$id.jsx`), services use camelCase `.server.js`, GraphQL uses PascalCase queries with SCREAMING_SNAKE exports, DB fields use camelCase
- **Preserved patterns:** Service layer abstraction, provider factory (Google/DeepL), cursor-based pagination, GraphQL userErrors extraction, Prisma session storage, market-aware queries (marketId threaded through full stack)
- **Improvements to document:** No TypeScript (all .jsx), no background job processing (inline execution), no error tracking/alerting, 18/28 resource types implemented, no glossary/AI translation/third-party content features, stats cache is 30-min TTL with no persistence strategy, API version 3 months behind (2026-01 vs 2026-04), `AppDistribution.AppStore` contradicts private app intent, missing `write_metafields` scope for image metafield operations
- **Largest complexity:** `app.resources.$type.$id.jsx` (606 lines, nested resource translation editor), `auto-translate.server.js` (215 lines, pagination loop + batch translation)
- **Theme extension:** Vanilla JS image-swap with localStorage cache, MutationObserver, but no market-scoped image support yet and fragile filename matching

## File Specs

---

### `docs/architecture/vision.md` (create)

**Purpose:** App vision, mission, competitive positioning, merchant persona, north-star metrics

**Exact sections to write:**

1. **Mission Statement** — One paragraph: what the app does and why it exists. Frame around "the translation app Shopify merchants deserve" — fast, transparent, market-aware, AI-powered.

2. **Problem Statement** — Document the 10 LangShop drawbacks from clarify.md as the problems we solve. Group into: Performance (slow dashboard, missing pagination), Transparency (silent failures, runaway billing, quota opacity), Control (no market-level, no image management, glossary gated), Intelligence (no AI context, no quality scoring).

3. **Target Merchant Persona** — Two personas:
   - **Growth Merchant:** 500-5,000 products, 2-5 markets, needs auto-translate but fears billing surprises, values speed and transparency
   - **Enterprise Merchant:** 10,000+ products, 5+ markets, needs market-specific translations, brand voice consistency, third-party app coverage, analytics

4. **Competitive Positioning Matrix** — Table: LangShop vs Weglot vs Transcy vs Langify vs T Lab vs Our App. Rows: Performance, Market-Aware, Image Swap, AI Translation, Glossary (free tier), Third-Party Content, Silent Failure Prevention, Transparent Billing, Clean Uninstall. Values: ✅ / ⚠️ / ❌ for each.

5. **North-Star Metrics** — Define 5 metrics:
   - Translation coverage rate (% of content translated per store)
   - Time to first translation (onboarding speed)
   - Auto-translate accuracy (merchant override rate)
   - Dashboard response time (p95 < 500ms)
   - Zero silent failures (100% error surfacing)

6. **Principles** — 5 principles that guide every implementation decision:
   - Performance first (every list paginated, every action non-blocking)
   - Markets are first-class (not languages — markets own translations)
   - No surprises (transparent operations, no opaque auto-retranslation)
   - AI as copilot (context-aware translation, not just word replacement)
   - Developer ergonomics (TypeScript, testable services, clear conventions)

**Cross-references:** Links to `competitive-analysis.md` for detailed competitor data, `features.md` for full feature inventory, `differentiators.md` for technical approach to each differentiator.

---

### `docs/architecture/architecture.md` (create)

**Purpose:** Technical architecture overview — system layers, data flow, component boundaries

**Exact sections to write:**

1. **System Architecture Diagram** — ASCII diagram showing 4 layers:
   ```
   [Storefront] ←→ [Theme Extension (image-swap, language-switcher)]
        ↓ (App Proxy)
   [Remix App Routes (thin controllers)]
        ↓
   [Service Layer (business logic)]
        ↓                    ↓
   [Shopify GraphQL API]  [Database (Prisma/SQLite→Postgres)]
        ↓
   [Translation Providers (Google, DeepL, Claude/OpenAI)]
   ```

2. **Layer Responsibilities:**
   - **Routes (app/routes/):** Authentication, request parsing, response formatting. No business logic. Thin controllers pattern.
   - **Services (app/services/):** All business logic, GraphQL query execution, provider orchestration, caching, job management. Each service is a module with exported functions, not classes.
   - **GraphQL (app/graphql/):** Query/mutation definitions. Used exclusively by services, never directly by routes.
   - **Database (prisma/):** Data persistence via Prisma ORM. Accessed exclusively by services.
   - **Providers (app/services/providers/):** Translation API adapters. Common interface: `translate(texts[], srcLang, tgtLang)`, `validateApiKey()`, `getSupportedLanguages()`. Factory pattern via `createProvider()`.
   - **Theme Extension (extensions/):** Storefront-side JS for image swapping and language switching. Communicates with app via App Proxy endpoints.
   - **Utils (app/utils/):** Pure functions for data transformation, mapping, formatting. No side effects, no API calls.

3. **Data Flow Diagrams** — Three key flows as ASCII sequences:
   - **Manual Translation:** Route → Service → Shopify GraphQL (fetch resource + digest) → Merchant edits → Route action → Service → Shopify GraphQL (translationsRegister with marketId) → Return success/error
   - **Auto-Translate Job:** Route action (create job) → Service creates DB record → Background worker picks up job → Paginate resources → For each batch: fetch content → check glossary → send to provider → register translations → update progress → Webhook/SSE notifies UI
   - **Image Swap (Storefront):** Page load → Theme extension JS → Check localStorage cache → If miss: fetch App Proxy endpoint → Service queries DB for image mappings → Return JSON → JS swaps img src/srcset → Cache in localStorage (5-min TTL)

4. **Component Boundaries:**
   - Define what crosses each boundary (data shapes, not implementation)
   - Route ↔ Service: plain objects, never Prisma models or GraphQL responses directly
   - Service ↔ Provider: `{ texts: string[], sourceLang: string, targetLang: string }` → `{ translations: string[] }`
   - Service ↔ Database: Prisma client, typed models
   - Service ↔ Shopify API: GraphQL queries with typed variables

5. **Background Job Architecture:**
   - Current state: inline execution (blocks during auto-translate)
   - Target architecture: Database-backed job queue
   - Job lifecycle: `pending` → `running` → `completed` / `failed` / `partially_failed`
   - Progress tracking: `completedItems / totalItems` updated per batch
   - UI notification: polling via `useRevalidator()` (current) → SSE or webhook callback (future)
   - Concurrency: one job per shop at a time (prevent API rate limit exhaustion)

6. **Caching Strategy:**
   - Translation stats: Prisma-backed cache with 30-min TTL (existing pattern, preserve)
   - Resource metadata: In-memory LRU cache per request (no persistence needed)
   - Storefront image gallery: localStorage on client (5-min TTL, existing pattern)
   - Glossary rules: Prisma-backed, loaded once per job/session, invalidated on edit
   - Provider rate limits: Token bucket per provider per shop (track in memory, reset on restart)

7. **Error Handling Strategy:**
   - Define 3 error categories:
     - **User errors** (bad input, invalid API key): Return to UI with actionable message
     - **Shopify API errors** (rate limit, server error): Retry with exponential backoff (max 3 retries)
     - **Provider errors** (translation failure, quota exceeded): Log to DB (TranslationJobEntry.status = "failed"), surface in analytics dashboard
   - Zero silent failures principle: every error category has a merchant-visible path

8. **Security Considerations:**
   - API keys stored in Prisma (document need for encryption at rest before public launch)
   - All routes behind `authenticate.admin(request)` — Shopify session-based auth
   - App Proxy endpoints validate Shopify HMAC signature
   - CORS on public API endpoints (`Access-Control-Allow-Origin` for storefront)
   - No client-side secrets (all provider calls are server-side)

**Cross-references:** Links to `data-model.md` for schema details, `api-design.md` for route specifications, `dx-guide.md` for conventions.

---

### `docs/architecture/features.md` (create)

**Purpose:** Complete feature inventory with priority levels and parity mapping

**Exact sections to write:**

1. **Priority Definitions:**
   - **P0 (Must Have):** Core functionality required for the app to be usable. Blocks launch.
   - **P1 (Should Have):** Important features that differentiate from competitors. Ship within 2 weeks of P0.
   - **P2 (Nice to Have):** Enhancement features. Ship iteratively after launch.

2. **Feature Inventory by Category** — Table format for each category:

   **Category: Core Translation Engine (P0)**
   | ID | Feature | Priority | LangShop Parity | Status |
   | --- | --- | --- | --- | --- |
   | F-CORE-01 | Translate all 28+ resource types | P0 | ✅ Parity | Partial (18/28) |
   | F-CORE-02 | Manual side-by-side translation editor | P0 | ✅ Parity | Built |
   | F-CORE-03 | Bulk editing (multi-resource) | P0 | ✅ Parity | Not started |
   | F-CORE-04 | Auto-translate (Google, DeepL) | P0 | ✅ Parity | Built (needs background jobs) |
   | F-CORE-05 | Auto-sync (new/changed content only) | P1 | ⬆️ Better (content diffing) | Not started |
   | F-CORE-06 | URL handle translation | P1 | ✅ Parity | Not started |
   | F-CORE-07 | SEO meta tag translation | P1 | ✅ Parity | Not started |
   | F-CORE-08 | Image alt text translation | P1 | ✅ Parity | Not started |
   | F-CORE-09 | RTL language support | P1 | ✅ Parity | Not started |
   | F-CORE-10 | 200+ language support | P0 | ✅ Parity | Partial (34 display names) |

   **Category: Market-Aware Translations (P0)**
   | F-MKT-01 | Market-scoped translations | P0 | ⬆️ Better | Partial (marketId in queries) |
   | F-MKT-02 | Market-specific content (same lang, diff market) | P0 | ⬆️ Better | Not started |
   | F-MKT-03 | Market-level dashboard | P1 | ⬆️ Better | Not started |
   | F-MKT-04 | Market-level auto-translate config | P1 | ⬆️ Better | Not started |

   **Category: Image Management (P0)**
   | F-IMG-01 | Product image swap per locale | P0 | ⬆️ Better | Built |
   | F-IMG-02 | Metafield image swap per locale | P1 | ⬆️ Better | Built |
   | F-IMG-03 | Image management dashboard | P0 | ⬆️ Better | Built |
   | F-IMG-04 | Bulk image upload | P2 | ⬆️ Better | Not started |
   | F-IMG-05 | Market-scoped image swap | P1 | ⬆️ Better | Partial (placeholder in extension) |

   **Category: AI Translation (P1 — Differentiator)**
   | F-AI-01 | LLM-powered translation (Claude/OpenAI) | P1 | 🆕 Unique | Not started |
   | F-AI-02 | Brand voice configuration | P1 | 🆕 Unique | Not started |
   | F-AI-03 | Context injection (product category, tags) | P1 | 🆕 Unique | Not started |
   | F-AI-04 | Quality comparison (AI vs machine) | P2 | 🆕 Unique | Not started |
   | F-AI-05 | Iterative refinement from feedback | P2 | 🆕 Unique | Not started |

   **Category: Analytics & Quality (P1 — Differentiator)**
   | F-ANA-01 | Translation coverage dashboard | P1 | 🆕 Unique | Partial (basic stats) |
   | F-ANA-02 | Quality scoring | P2 | 🆕 Unique | Not started |
   | F-ANA-03 | Translation diff/changelog | P2 | 🆕 Unique | Not started |
   | F-ANA-04 | Failure alerts | P1 | 🆕 Unique | Not started |
   | F-ANA-05 | Usage tracking | P1 | 🆕 Unique | Not started |
   | F-ANA-06 | Stale translation detection | P1 | ⬆️ Better | Not started |

   **Category: Glossary & Brand Voice (P1 — Differentiator)**
   | F-GLO-01 | Glossary management | P1 | ⬆️ Better (free tier) | Not started |
   | F-GLO-02 | Import/export CSV | P2 | ✅ Parity | Not started |
   | F-GLO-03 | Auto-enforce during translate | P1 | ⬆️ Better | Not started |
   | F-GLO-04 | Brand name protection | P1 | 🆕 Unique | Not started |

   **Category: Third-Party Content (P2 — Differentiator)**
   | F-3P-01 | DOM-level content detection | P2 | 🆕 Unique | Not started |
   | F-3P-02 | Dynamic content translation | P2 | 🆕 Unique | Not started |
   | F-3P-03 | Configurable app list | P2 | 🆕 Unique | Not started |

   **Category: Storefront (P1)**
   | F-SF-01 | Language switcher widget | P1 | ✅ Parity | Not started |
   | F-SF-02 | Currency switcher | P2 | ✅ Parity | Not started |
   | F-SF-03 | Geolocation auto-detect | P2 | ✅ Parity | Not started |

   **Category: Performance (P0 — Differentiator)**
   | F-PERF-01 | Cursor-based pagination everywhere | P0 | ⬆️ Better | Partial |
   | F-PERF-02 | Background job processing | P0 | ⬆️ Better | Not started |
   | F-PERF-03 | Optimistic UI updates | P1 | ⬆️ Better | Partial |
   | F-PERF-04 | Batch GraphQL queries | P1 | ⬆️ Better | Not started |
   | F-PERF-05 | Resource list virtualization | P2 | ⬆️ Better | Not started |

   **Category: Merchant Experience (P0)**
   | F-MX-01 | Guided onboarding | P1 | ⬆️ Better | Not started |
   | F-MX-02 | Status indicators on all views | P0 | ⬆️ Better | Partial |
   | F-MX-03 | Transparent operation log | P1 | 🆕 Unique | Not started |

   **Category: Shopify Integration (P0)**
   | F-INT-01 | Shopify Markets API | P0 | ✅ Parity | Built |
   | F-INT-02 | Content change webhooks (auto-sync trigger) | P1 | ⬆️ Better | Not started |
   | F-INT-03 | Clean uninstall | P0 | ⬆️ Better | Partial |
   | F-INT-04 | App proxy | P0 | ✅ Parity | Built |
   | F-INT-05 | Theme extension | P0 | ⬆️ Better | Built |

3. **Parity Summary:**
   - Total features: ~45
   - LangShop parity: ~15 features
   - Better than LangShop: ~20 features
   - Unique (no competitor has): ~10 features
   - Already built: ~10 features
   - Remaining to build: ~35 features

4. **Missing Resource Types** — List the 10+ resource types from the Shopify `TranslatableResourceType` enum not yet in `resource-type-map.js`: PRODUCT_OPTION, PRODUCT_OPTION_VALUE, COLLECTION_IMAGE, ARTICLE_IMAGE, MEDIA_IMAGE, METAOBJECT, FILTER, PACKING_SLIP_TEMPLATE, ONLINE_STORE_THEME_APP_EMBED, ONLINE_STORE_THEME_JSON_TEMPLATE, ONLINE_STORE_THEME_LOCALE_CONTENT, ONLINE_STORE_THEME_SECTION_GROUP, ONLINE_STORE_THEME_SETTINGS_CATEGORY, ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS

**Cross-references:** Links to `execution-plan.md` for phased delivery, `differentiators.md` for technical approach per differentiator feature.

---

### `docs/architecture/competitive-analysis.md` (create)

**Purpose:** Detailed competitive research with feature matrix, pricing, drawbacks, and market gaps

**Exact sections to write:**

1. **Executive Summary** — 3 paragraphs: market state, common pain points, our opportunity

2. **Competitor Deep Dives** — For each of 6 competitors (LangShop, Weglot, Transcy, Langify, T Lab, Translate & Adapt), use this structure:
   - Overview (1 paragraph)
   - Pricing table (all tiers)
   - Strengths (bullet list, 5-7 items)
   - Weaknesses (bullet list, 5-7 items, sourced from merchant reviews)
   - Key differentiator (1 sentence)

   Use data from the research agent's findings in clarify.md context.

3. **Feature Comparison Matrix** — Large table with ALL features as rows, all 7 apps (6 competitors + ours) as columns. Values: ✅ Full / ⚠️ Partial / ❌ Missing / 🆕 Unique. Minimum 30 feature rows covering:
   - Translation basics (manual, auto, bulk)
   - Resource types (products, collections, pages, theme, metafields, etc.)
   - SEO (meta tags, URL handles, hreflang, alt text)
   - Market features (market-scoped, multi-market, adaptation)
   - AI features (brand voice, context-aware, quality scoring)
   - Management (glossary, analytics, diff/changelog, alerts)
   - Storefront (switcher, image swap, geolocation)
   - Performance (pagination, background jobs, caching)
   - Integration (webhooks, third-party apps, clean uninstall)

4. **Pricing Analysis** — Table comparing pricing models (per-language, per-word, per-product, flat rate). Analysis of which model is fairest for merchants. Note: no pricing needed for V1 (private app).

5. **Market-Wide Pain Points** — Expanded version of the 10 pain points from clarify.md, with specific merchant quotes/examples where available, and our solution for each.

6. **Market Gaps & Opportunities** — The 11 gaps from research, with priority ranking and feasibility assessment for our V1.

7. **Our Positioning** — "The translation app built for Shopify Markets" — frame around markets-first, AI-powered, transparent, and performant.

**Cross-references:** Links to `vision.md` for positioning principles, `features.md` for our feature inventory.

---

### `docs/architecture/data-model.md` (create)

**Purpose:** Complete Prisma schema design for V1 with all models, relationships, and migration strategy

**Exact sections to write:**

1. **Current Schema** — Document existing 5 models (Session, TranslationJob, TranslationJobEntry, TranslationProviderConfig, ImageTranslation, TranslationStats) with their fields. Note known issues: plaintext API key storage, missing `write_metafields` scope bug.

2. **V1 Schema — New Models** — Define these new models with exact field names, types, and constraints:

   **GlossaryTerm**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - sourceLocale (String)
   - targetLocale (String)
   - sourceTerm (String)
   - targetTerm (String)
   - caseSensitive (Boolean, @default(false))
   - neverTranslate (Boolean, @default(false)) — for brand name protection
   - createdAt (DateTime, @default(now()))
   - updatedAt (DateTime, @updatedAt)
   - @@unique([shop, sourceLocale, targetLocale, sourceTerm])
   - @@index([shop, sourceLocale])

   **BrandVoiceConfig**
   - id (String, @id, @default(uuid()))
   - shop (String, @unique)
   - tone (String) — e.g., "professional", "casual", "playful"
   - style (String) — e.g., "concise", "descriptive", "technical"
   - instructions (String) — free-text merchant instructions for AI
   - createdAt (DateTime, @default(now()))
   - updatedAt (DateTime, @updatedAt)

   **TranslationAuditLog**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - resourceId (String)
   - resourceType (String)
   - locale (String)
   - marketId (String?) — nullable for global translations
   - fieldKey (String)
   - previousValue (String?)
   - newValue (String)
   - source (String) — "manual" | "auto_google" | "auto_deepl" | "auto_ai" | "import"
   - createdAt (DateTime, @default(now()))
   - @@index([shop, resourceId, locale])
   - @@index([shop, createdAt])

   **TranslationAlert**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - type (String) — "failure" | "stale" | "quota_warning" | "job_error"
   - severity (String) — "info" | "warning" | "critical"
   - message (String)
   - resourceId (String?)
   - locale (String?)
   - jobId (String?)
   - dismissed (Boolean, @default(false))
   - createdAt (DateTime, @default(now()))
   - @@index([shop, dismissed, createdAt])

   **UsageTracking**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - provider (String)
   - characterCount (Int)
   - requestCount (Int)
   - locale (String)
   - date (DateTime) — daily bucket
   - @@unique([shop, provider, locale, date])
   - @@index([shop, date])

   **ContentDigest**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - resourceId (String)
   - fieldKey (String)
   - contentHash (String) — SHA-256 of source content
   - lastCheckedAt (DateTime)
   - @@unique([shop, resourceId, fieldKey])
   - @@index([shop, resourceId])

   **TranslationSuggestion**
   - id (String, @id, @default(uuid()))
   - shop (String)
   - resourceId (String)
   - resourceType (String)
   - fieldKey (String)
   - locale (String)
   - marketId (String?) — nullable for global translations
   - sourceValue (String) — original content at time of suggestion
   - suggestedValue (String) — AI-generated suggestion
   - editedValue (String?) — merchant's edited version (null if accepted as-is)
   - status (String) — "pending" | "accepted" | "rejected"
   - provider (String) — "claude" | "openai"
   - rejectionReason (String?) — optional merchant feedback on why rejected
   - createdAt (DateTime, @default(now()))
   - reviewedAt (DateTime?) — when merchant accepted/rejected
   - @@index([shop, status])
   - @@index([shop, resourceId, locale])
   - @@unique([shop, resourceId, fieldKey, locale, marketId])

   **OnboardingState**
   - id (String, @id, @default(uuid()))
   - shop (String, @unique)
   - step (Int, @default(0))
   - completedSteps (String) — JSON array of completed step IDs
   - primaryLocale (String?)
   - targetLocales (String?) — JSON array
   - selectedProvider (String?)
   - completedAt (DateTime?)
   - createdAt (DateTime, @default(now()))

3. **V1 Schema — Model Modifications** — Changes to existing models:
   - **TranslationJob:** Add fields: `errorMessage (String?)`, `retryCount (Int, @default(0))`, `scheduledAt (DateTime?)`, `startedAt (DateTime?)`, `completedAt (DateTime?)`, `glossaryApplied (Boolean, @default(false))`
   - **TranslationJobEntry:** Add fields: `errorMessage (String?)`, `providerResponse (String?)` — raw provider response for debugging
   - **TranslationProviderConfig:** Add fields: `displayName (String?)`, `monthlyQuota (Int?)`, `quotaUsed (Int, @default(0))`, `quotaResetDate (DateTime?)`
   - **TranslationStats:** Add fields: `marketId (String?)`, update unique constraint to include marketId

4. **Relationships Diagram** — ASCII diagram showing all model relationships:
   ```
   TranslationJob (1) ──→ (many) TranslationJobEntry
   TranslationJob (1) ──→ (many) TranslationAuditLog [via jobId]
   TranslationJob (1) ──→ (many) TranslationAlert [via jobId]
   GlossaryTerm ──→ used by ──→ TranslationJob [via glossaryApplied flag]
   BrandVoiceConfig ──→ used by ──→ AI Provider [per shop]
   ContentDigest ──→ compared by ──→ Auto-Sync [to detect changes]
   UsageTracking ──→ aggregated in ──→ Analytics Dashboard
   OnboardingState ──→ drives ──→ Onboarding UI
   ```

5. **Migration Strategy:**
   - Phase 1: Add GlossaryTerm, BrandVoiceConfig, OnboardingState (independent, no FK conflicts)
   - Phase 2: Add TranslationAuditLog, TranslationAlert (reference existing job IDs)
   - Phase 3: Add UsageTracking, ContentDigest (analytics/sync features)
   - Phase 4: Modify existing models (add fields with defaults, non-breaking)
   - Production migration note: SQLite → PostgreSQL migration path for public launch

6. **Database Considerations:**
   - Indexing strategy: every `shop` + frequently-queried field gets a composite index
   - Data retention: audit logs kept 90 days, alerts kept 30 days (configurable)
   - Soft delete: not implemented for V1 (hard delete with audit log is sufficient)
   - Encryption: document that API keys need encryption before public launch

**Cross-references:** Links to `architecture.md` for system boundaries, `features.md` for feature-to-model mapping.

---

### `docs/architecture/api-design.md` (create)

**Purpose:** Route structure, loader/action patterns, Shopify API usage, provider integrations

**Exact sections to write:**

1. **Route Architecture** — Complete route tree for V1:
   ```
   app.jsx                              (layout, nav)
   ├── app._index.jsx                   (dashboard)
   ├── app.onboarding.jsx               (guided setup — NEW)
   ├── app.resources.$type._index.jsx   (resource list)
   ├── app.resources.$type.$id.jsx      (translation editor)
   ├── app.auto-translate.jsx           (job management)
   ├── app.auto-translate.$jobId.jsx    (job detail — NEW)
   ├── app.markets.jsx                  (markets overview)
   ├── app.markets.$marketId.jsx        (market detail — NEW)
   ├── app.images._index.jsx            (image gallery)
   ├── app.images.$resourceId.jsx       (image editor)
   ├── app.glossary.jsx                 (glossary management — NEW)
   ├── app.glossary.import.jsx          (CSV import — NEW)
   ├── app.analytics.jsx                (translation analytics — NEW)
   ├── app.analytics.usage.jsx          (usage tracking — NEW)
   ├── app.settings.jsx                 (provider config)
   ├── app.settings.brand-voice.jsx     (brand voice config — NEW)
   ├── app.alerts.jsx                   (alert center — NEW)
   ├── api.image-gallery.jsx            (public API)
   ├── api.translation-status.jsx       (SSE for job progress — NEW)
   ├── auth.$.jsx                       (auth callback)
   ├── auth.login/route.jsx             (login)
   ├── webhooks.app.uninstalled.jsx     (uninstall cleanup)
   ├── webhooks.app.scopes_update.jsx   (scope update)
   ├── webhooks.products.update.jsx     (auto-sync trigger — NEW)
   └── webhooks.collections.update.jsx  (auto-sync trigger — NEW)
   ```

2. **Route Conventions:**
   - Every loader starts with `const { admin, session } = await authenticate.admin(request)`
   - Loaders return typed objects (document shape for each route)
   - Actions use `formData.get("_action")` to multiplex multiple form actions per route
   - Error responses: `json({ error: "message", field: "fieldName" }, { status: 400 })`
   - Success responses: `json({ success: true, data: {...} })`

3. **New Route Specifications** — For each NEW route, specify:
   - Loader data shape (what it fetches and returns)
   - Action(s) it handles (form action names and parameters)
   - Key UI components used
   - Service functions called

   Document these routes: onboarding, auto-translate.$jobId, markets.$marketId, glossary, glossary.import, analytics, analytics.usage, settings.brand-voice, alerts, api.translation-status, webhooks.products.update, webhooks.collections.update

4. **Service Layer API** — For each service module, document:
   - Existing functions (preserve)
   - New functions to add (name, parameters, return type, purpose)

   New services to create:
   - `glossary.server.js` — CRUD glossary terms, CSV import/export, enforcement during translation
   - `brand-voice.server.js` — CRUD brand voice config, inject into AI prompts
   - `analytics.server.js` — coverage calculations, usage aggregation, stale detection
   - `alerts.server.js` — create/dismiss/list alerts, check for stale translations
   - `content-sync.server.js` — content hash comparison, auto-sync trigger logic
   - `providers/ai-provider.server.js` — Claude/OpenAI adapter with context injection and brand voice

5. **Shopify GraphQL API Patterns:**
   - Document all queries/mutations needed (existing 8 + new ones)
   - New queries needed: `translatableResourcesByIds` (batch fetch), bulk operation queries for large datasets
   - New mutations needed: `metafieldsSet` (for image gallery metafield)
   - Rate limiting strategy: 1,000 cost points/second, document cost of each query
   - Pagination contract: always use cursor-based, `first: 25` for UI lists, `first: 50` for background jobs

6. **External API Integrations:**
   - Google Translate: REST API, 128 texts/batch, document rate limits
   - DeepL: REST API, 50 texts/batch, document rate limits
   - Claude API (NEW): Messages API with system prompt for brand voice, document token limits and pricing
   - OpenAI (NEW): Chat Completions API, document model selection (GPT-4o for quality, GPT-4o-mini for speed)

7. **Webhook Design:**
   - `products/update` → trigger content hash check → if changed, queue auto-sync job
   - `collections/update` → same pattern
   - Document HMAC validation for all webhook routes
   - Document idempotency (same webhook delivered twice shouldn't duplicate work)

**Cross-references:** Links to `architecture.md` for layer diagram, `data-model.md` for Prisma models, `dx-guide.md` for conventions.

---

### `docs/architecture/ux-flows.md` (create)

**Purpose:** Key merchant workflows and user journeys

**Exact sections to write:**

1. **Navigation Structure** — Polaris NavMenu items:
   ```
   Dashboard (app._index)
   ├── Resources
   │   └── [Resource Type List] → [Translation Editor]
   ├── Markets
   │   └── [Market Detail]
   ├── Images
   │   └── [Image Editor]
   ├── Auto-Translate
   │   └── [Job Detail]
   ├── Glossary
   │   └── [CSV Import]
   ├── Analytics
   │   └── [Usage]
   ├── Alerts
   └── Settings
       └── [Brand Voice]
   ```

2. **Flow 1: Onboarding (New Install)**
   - Step 1: Welcome screen → detect primary locale, list published locales, show markets
   - Step 2: Select target languages (pre-select based on market config)
   - Step 3: Choose translation provider (show free vs paid options)
   - Step 4: Optional: configure brand voice basics (tone dropdown, brand names to protect)
   - Step 5: Optional: run initial auto-translate on priority resources (products first)
   - Step 6: Dashboard with progress indicator
   - Design: Polaris `Wizard` pattern — progress bar, back/next buttons, skip option on optional steps

3. **Flow 2: Manual Translation**
   - Start: Dashboard → click resource type → paginated resource list with status badges
   - Select resource → side-by-side editor: source (read-only left) | target (editable right)
   - Locale selector at top (dropdown), market selector next to it (if multiple markets)
   - Auto-save drafts, explicit "Save" button for Shopify registration
   - Nested resources (product options, metafields) shown as expandable sections below main fields
   - Success: green toast "Translation saved", badge updates to "Complete"
   - Error: red banner with specific field + error message

4. **Flow 3: Bulk Translation**
   - Start: Resource list → checkbox select multiple resources (or select all)
   - Bulk action bar: "Auto-translate selected" button
   - Modal: choose provider, target locale(s), apply glossary checkbox
   - Creates TranslationJob, redirects to job detail page
   - Job detail: progress bar, per-resource status table (success/failed/pending), error details expandable

5. **Flow 4: Auto-Translate Job Management**
   - Start: Auto-Translate page → "New Job" button
   - Form: resource type, target locale(s), market scope, provider, glossary toggle
   - Job list: sortable table with status, progress, timestamps, actions (retry failed, cancel)
   - Job detail: real-time progress via SSE, per-entry status, error log

6. **Flow 5: Image Management**
   - Start: Images page → product grid with thumbnails
   - Select product → see all product images in grid
   - For each image: locale dropdown → upload replacement image or select from files
   - Preview: toggle between locales to see image swap
   - Bulk: select multiple images → assign same replacement across locales

7. **Flow 6: Glossary Management**
   - Start: Glossary page → table of terms (source, target, locale pair, case-sensitive, never-translate)
   - Add term: inline form or modal
   - Import: CSV upload with preview/validation step
   - Export: download CSV button
   - Brand protection: toggle "Never translate" for brand names
   - Enforcement: visual indicator on translation editor showing glossary-applied terms

8. **Flow 7: Analytics Dashboard**
   - Start: Analytics page → coverage overview (donut charts per locale)
   - Drill down: by resource type, by market, by locale
   - Stale translations: list of resources where source changed but translation didn't
   - Usage: bar chart of API calls per provider per day, estimated cost
   - Quality: placeholder for future quality scoring

9. **Flow 8: Alert Management**
   - Start: Alerts page (badge count in nav if unread)
   - Alert types: failure (red), stale (yellow), quota warning (orange), info (blue)
   - Each alert: message, timestamp, link to affected resource, dismiss button
   - Bulk dismiss: select all → dismiss

10. **Empty States** — Define Polaris `EmptyState` for each page:
    - No resources: "No [type] found in your store"
    - No translations: "Get started by translating your first [type]"
    - No glossary terms: "Add glossary terms to ensure consistent translations"
    - No alerts: "All clear! No translation issues detected"
    - No jobs: "Create your first auto-translate job"

11. **Loading States** — Define skeleton patterns:
    - Resource list: `SkeletonBodyText` + `SkeletonDisplayText`
    - Translation editor: two-column skeleton
    - Dashboard: `SkeletonPage` with stat card placeholders

**Cross-references:** Links to `features.md` for feature IDs referenced in flows, `api-design.md` for route-to-flow mapping.

---

### `docs/architecture/execution-plan.md` (create)

**Purpose:** Step-by-step implementation phases with dependencies

**Exact sections to write:**

1. **Phase Overview:**
   ```
   Phase 0: Foundation (DX setup, TypeScript, schema)     [~1 phase]
   Phase 1: Core Engine Completion (all resource types)    [~1 phase]
   Phase 2: Market-Aware + Performance                     [~1 phase]
   Phase 3: Glossary + Brand Voice                         [~1 phase]
   Phase 4: AI Translation Provider                        [~1 phase]
   Phase 5: Analytics + Alerts                             [~1 phase]
   Phase 6: Storefront (Switcher, Third-Party)             [~1 phase]
   Phase 7: Polish + Onboarding                            [~1 phase]
   ```

2. **Phase 0: Foundation** — Branch: `phase-0/foundation`
   - [ ] Migrate all .jsx → .tsx (TypeScript setup)
   - [ ] Add strict TypeScript config
   - [ ] Create shared types for Shopify GraphQL responses, service interfaces
   - [ ] Run Prisma migration for new models (GlossaryTerm, BrandVoiceConfig, TranslationAuditLog, TranslationAlert, UsageTracking, ContentDigest, OnboardingState)
   - [ ] Modify existing models (add new fields to TranslationJob, TranslationJobEntry, TranslationProviderConfig, TranslationStats)
   - [ ] Set up folder structure per `dx-guide.md` conventions
   - [ ] Fix known bugs: `write_metafields` scope, API version (2026-01 → 2026-04), `AppDistribution` setting
   - [ ] Add error boundary at root level
   - **Dependencies:** None (first phase)
   - **Deliverable:** Type-safe codebase with complete schema, all known bugs fixed

3. **Phase 1: Core Engine Completion** — Branch: `phase-1/core-engine`
   - [ ] Add remaining 10+ resource types to `resource-type-map`
   - [ ] Update resource list UI to handle all types
   - [ ] Implement background job processing (database-backed queue, not inline)
   - [ ] Add job retry logic with exponential backoff
   - [ ] Implement content diffing for auto-sync (ContentDigest model)
   - [ ] Add URL handle translation support
   - [ ] Add SEO meta tag translation
   - [ ] Image alt text auto-translation
   - [ ] Expand locale display names to 200+ languages
   - **Dependencies:** Phase 0 (needs TypeScript, new schema)
   - **Deliverable:** All 28+ resource types translatable, background jobs working, auto-sync with diffing

4. **Phase 2: Market-Aware + Performance** — Branch: `phase-2/markets-performance`
   - [ ] Market-specific translation editor (market selector alongside locale selector)
   - [ ] Market dashboard view (translation stats per market)
   - [ ] Market-level auto-translate configuration
   - [ ] Market-scoped image swap (update theme extension)
   - [ ] Implement SSE for job progress (replace polling)
   - [ ] Add cursor-based pagination to all remaining list views
   - [ ] Optimize GraphQL queries (batch where possible)
   - [ ] Add optimistic UI updates to translation editor
   - **Dependencies:** Phase 1 (needs complete resource type support)
   - **Deliverable:** Full market-aware translations, real-time job progress, fast UI

5. **Phase 3: Glossary + Brand Voice** — Branch: `phase-3/glossary`
   - [ ] Glossary CRUD (route + service)
   - [ ] CSV import/export for glossary
   - [ ] Brand name protection (never-translate flag)
   - [ ] Glossary enforcement in auto-translate pipeline
   - [ ] Brand voice configuration UI
   - [ ] Brand voice injection into translation context
   - **Dependencies:** Phase 1 (needs background job system for enforcement)
   - **Deliverable:** Working glossary with enforcement, brand voice config ready for AI provider

6. **Phase 4: AI Translation Provider** — Branch: `phase-4/ai-translation`
   - [ ] Create AI provider adapter (Claude API + OpenAI)
   - [ ] Implement context injection (product category, collection, tags)
   - [ ] Integrate brand voice config into AI prompts
   - [ ] Integrate glossary rules into AI prompts
   - [ ] Add AI as provider option in auto-translate UI
   - [ ] Quality comparison view (AI vs machine translation side-by-side)
   - **Dependencies:** Phase 3 (needs glossary + brand voice for context)
   - **Deliverable:** AI-powered translations with context, brand voice, and glossary awareness

7. **Phase 5: Analytics + Alerts** — Branch: `phase-5/analytics`
   - [ ] Translation coverage dashboard (per locale, per market, per resource type)
   - [ ] Usage tracking (API calls, characters, estimated cost per provider)
   - [ ] Stale translation detection (compare ContentDigest with Shopify)
   - [ ] Alert system (failure, stale, quota warning)
   - [ ] Alert center UI with badge count
   - [ ] Translation audit log (track all changes with source)
   - [ ] Translation diff view (previous vs current value)
   - **Dependencies:** Phase 2 (needs market-aware stats), Phase 4 (needs usage data from AI provider)
   - **Deliverable:** Full analytics dashboard, proactive alerts, audit trail

8. **Phase 6: Storefront** — Branch: `phase-6/storefront`
   - [ ] Language switcher theme extension (dropdown, flags, text-only modes)
   - [ ] Mobile-optimized switcher variant
   - [ ] Geolocation auto-detect (optional, configurable)
   - [ ] Third-party app content detection (DOM analysis)
   - [ ] MutationObserver-based dynamic content translation
   - [ ] Configurable third-party app list
   - **Dependencies:** Phase 2 (needs market-scoped storefront features)
   - **Deliverable:** Complete storefront experience with switcher and third-party content support

9. **Phase 7: Polish + Onboarding** — Branch: `phase-7/polish`
   - [ ] Guided onboarding wizard
   - [ ] Empty states for all pages
   - [ ] Loading skeletons for all pages
   - [ ] RTL language support in translation editor
   - [ ] Keyboard accessibility audit
   - [ ] Clean uninstall (delete all app data, metafields, extension data)
   - [ ] Error boundary improvements
   - [ ] Final UX review and polish
   - **Dependencies:** All previous phases
   - **Deliverable:** Production-ready app with complete merchant experience

10. **Dependency Graph:**
    ```
    Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 6
                    │            │
                    ↓            ↓
                 Phase 3 ──→ Phase 4 ──→ Phase 5
                                            │
                    All phases ──→ Phase 7
    ```

11. **Branch Strategy:**
    - Each phase = one branch off `main`
    - Branch naming: `phase-{N}/{short-name}`
    - Merge to `main` after each phase is complete and tested
    - No long-lived branches — merge frequently

**Cross-references:** Links to `features.md` for feature IDs per phase, `data-model.md` for schema migrations per phase, `api-design.md` for routes per phase.

---

### `docs/architecture/dx-guide.md` (create)

**Purpose:** Developer experience guide — setup, conventions, folder structure, testing

**Exact sections to write:**

1. **Folder Structure (V1 Target):**
   ```
   app/
   ├── routes/                    # Remix routes (thin controllers)
   │   ├── app.jsx                # App layout
   │   ├── app._index.tsx         # Dashboard
   │   ├── app.resources.$type._index.tsx
   │   ├── ...
   │   ├── api.*.tsx              # Public API endpoints
   │   ├── auth.*.tsx             # Auth routes
   │   └── webhooks.*.tsx         # Webhook handlers
   ├── services/                  # Business logic (all .server.ts)
   │   ├── translation.server.ts
   │   ├── translatable-resources.server.ts
   │   ├── markets.server.ts
   │   ├── auto-translate.server.ts
   │   ├── image-translation.server.ts
   │   ├── glossary.server.ts          # NEW
   │   ├── brand-voice.server.ts       # NEW
   │   ├── analytics.server.ts         # NEW
   │   ├── alerts.server.ts            # NEW
   │   ├── content-sync.server.ts      # NEW
   │   └── providers/
   │       ├── provider-interface.server.ts
   │       ├── google.server.ts        # Extract from interface
   │       ├── deepl.server.ts         # Extract from interface
   │       └── ai-provider.server.ts   # NEW (Claude/OpenAI)
   ├── graphql/                   # GraphQL query/mutation definitions
   │   ├── queries/               # Reorganize into subfolder
   │   └── mutations/             # Reorganize into subfolder
   ├── components/                # Reusable React components (currently empty)
   │   ├── TranslationEditor.tsx  # Extract from route
   │   ├── ResourceList.tsx       # Extract from route
   │   ├── StatusBadge.tsx        # Extract from utils
   │   ├── LocaleSelector.tsx     # Reusable locale dropdown
   │   └── MarketSelector.tsx     # Reusable market dropdown
   ├── utils/                     # Pure utility functions
   │   ├── locale-utils.ts
   │   ├── resource-type-map.ts
   │   └── content-hash.ts        # NEW (SHA-256 for content diffing)
   ├── types/                     # TypeScript type definitions (currently empty)
   │   ├── shopify.ts             # Shopify GraphQL response types
   │   ├── translation.ts         # Translation domain types
   │   └── provider.ts            # Provider interface types
   ├── hooks/                     # React hooks (NEW directory)
   │   ├── useTranslation.ts      # Translation state management
   │   └── useJobProgress.ts      # SSE-based job progress
   ├── shopify.server.ts
   ├── db.server.ts
   └── root.tsx
   extensions/
   ├── langshop-image-swap/       # Existing
   └── langshop-switcher/         # NEW (language switcher)
   prisma/
   ├── schema.prisma
   └── migrations/
   docs/
   └── architecture/              # This documentation
   ```

2. **Naming Conventions:**
   - Files: kebab-case (e.g., `auto-translate.server.ts`)
   - Routes: dot-notation per Remix convention
   - Components: PascalCase (e.g., `TranslationEditor.tsx`)
   - Functions: camelCase (e.g., `fetchTranslatableResources`)
   - Types/Interfaces: PascalCase with descriptive names (e.g., `TranslatableResource`, `TranslationJobStatus`)
   - GraphQL: PascalCase queries, SCREAMING_SNAKE_CASE for exported constants
   - Database fields: camelCase (Prisma convention)
   - CSS classes: kebab-case with `langshop-` prefix for theme extension

3. **Code Conventions:**
   - Routes are thin controllers: authenticate → call service → return JSON
   - Services contain ALL business logic
   - Services never import from routes; routes import from services
   - GraphQL definitions only used by services, never by routes directly
   - No `any` type — use explicit types or `unknown` with type guards
   - Error handling: services throw typed errors, routes catch and format for UI
   - Async/await everywhere (no raw promises or callbacks)

4. **Component Extraction Rules:**
   - Extract a component when it's used in 2+ routes OR exceeds 100 lines of JSX
   - Components in `app/components/` are pure UI (props in, events out)
   - No data fetching inside components — data comes from route loaders via props
   - Use Polaris components as building blocks, compose into app-specific components

5. **Testing Strategy:**
   - Unit tests: services (business logic), utils (pure functions)
   - Integration tests: routes (loader/action with mocked Shopify API)
   - E2E: manual testing on demo store (no automated E2E for V1)
   - Test file naming: `{module}.test.ts` alongside source file
   - Framework: Vitest (already in Remix template)

6. **Local Development Setup:**
   - Prerequisites: Node.js 20.19+, pnpm, Shopify CLI
   - Steps: clone → `pnpm install` → `pnpm prisma migrate dev` → `pnpm dev`
   - Environment variables needed: `SCOPES`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`
   - Demo store: configure in `shopify.app.toml`

7. **Extension Points:**
   - New translation provider: implement `TranslationProvider` interface in `providers/`, add to factory in `provider-interface.server.ts`
   - New resource type: add to `resource-type-map.ts`, no other changes needed (generic handler)
   - New webhook: create route in `webhooks.*.tsx`, register in `shopify.app.toml`
   - New analytics metric: add to `analytics.server.ts`, create route for UI

**Cross-references:** Links to `architecture.md` for layer responsibilities, `execution-plan.md` for migration order.

---

### `docs/architecture/differentiators.md` (create)

**Purpose:** Deep dive on each differentiating feature — technical approach and UX design

**Exact sections to write:**

1. **Differentiator 1: AI-Powered Context-Aware Translation (Suggest-First Model)**

   **Problem:** Existing apps use word-for-word machine translation (Google/DeepL) that doesn't understand product context, industry terminology, or brand voice. Result: awkward, generic translations that merchants have to manually fix. Worse — most apps auto-apply translations without review, so bad translations go live silently.

   **Our approach:** AI generates translation **suggestions** first. Merchants review, edit if needed, then explicitly apply. No translation goes live without merchant approval.

   **Technical Approach:**
   - New provider: `ai-provider.server.ts` implementing a `SuggestionProvider` interface (distinct from auto-apply providers)
   - Suggestion flow: AI generates → stored as `pending` suggestions in DB → merchant reviews in UI → merchant accepts/edits/rejects → only accepted translations are registered with Shopify
   - System prompt construction: combine brand voice config + glossary terms + product context (category, tags, collection) + merchant instructions
   - Model selection: Claude API (claude-sonnet-4-5-20241022) for quality, with fallback to OpenAI GPT-4o-mini for budget-conscious merchants
   - Batch strategy: group related fields per product (title + description + SEO together) for consistent voice
   - Token management: estimate tokens before sending, warn if approaching limits
   - Suggestion storage: new `TranslationSuggestion` model — stores AI output, merchant edits, accept/reject status, and feedback for learning
   - Prompt template (document exact structure):
     ```
     System: You are a professional translator for an e-commerce store.
     Brand voice: {tone}, {style}
     Glossary rules: {terms that must/must not be translated}
     Merchant instructions: {free-text instructions}
     
     Translate the following {resourceType} content from {sourceLang} to {targetLang}.
     Product context: Category: {category}, Tags: {tags}, Collection: {collection}
     
     Maintain brand voice. Apply glossary rules strictly. Return JSON.
     ```

   **UX Design:**
   - **Suggestion generation:** "Get AI Suggestions" button in translation editor (per-resource) and in bulk auto-translate form (per-batch). Clearly labeled as suggestions, not final translations.
   - **Review UI:** Three-column view in translation editor: Source (original) | AI Suggestion (editable, highlighted in blue) | Current Translation (if exists). Merchant can:
     - **Accept** suggestion as-is (one click → registers with Shopify)
     - **Edit & Accept** (modify suggestion, then apply)
     - **Reject** (dismiss suggestion, optionally provide reason for future AI improvement)
     - **Accept All** bulk action for confident merchants (select multiple → apply all suggestions at once)
   - **Suggestion badges:** Resources with pending AI suggestions show a "Suggestions Available" badge in resource list
   - **Quality comparison:** Side-by-side toggle showing AI suggestion vs Google/DeepL translation for the same content — helps merchant pick the best option
   - **Brand voice setup:** Settings page with tone/style dropdowns + free-text instruction box
   - **Cost indicator:** Show estimated cost before generating AI suggestions
   - **Feedback loop:** When merchant edits a suggestion before accepting, store the delta — this data can improve future prompts (P2 feature)

2. **Differentiator 2: Translation Analytics & Quality Scoring**

   **Problem:** Merchants have zero visibility into translation health. They don't know what's translated, what's stale, what failed, or how much they're spending on translation APIs.

   **Technical Approach:**
   - Coverage calculation: query `translatableResourcesWithTranslations` for each type/locale/market, compute percentage (existing pattern, extend with market dimension)
   - Stale detection: compare `ContentDigest.contentHash` with current Shopify content hash. If different, mark translations as potentially stale.
   - Usage tracking: increment `UsageTracking` on every provider API call (characters + requests)
   - Alert generation: service runs after each job, checks for failures → creates `TranslationAlert`
   - Quality scoring (P2): future — compare AI translation with machine translation, measure merchant override rate

   **UX Design:**
   - Dashboard overview: donut charts (coverage per locale), bar charts (usage per provider per day)
   - Drill-down: click locale → see per-resource-type coverage, click resource type → see per-resource status
   - Stale translations: dedicated section with "Re-translate" bulk action
   - Usage: daily/weekly/monthly views, cost estimate based on provider pricing
   - Alerts: badge in nav, dedicated page, dismissible cards with action links

3. **Differentiator 3: Glossary & Brand Voice on All Tiers**

   **Problem:** Competitors gate glossary behind $40+/month plans. Merchants on free/basic tiers can't control how their brand name is translated, leading to inconsistent and embarrassing translations.

   **Technical Approach:**
   - Glossary storage: `GlossaryTerm` model with source/target locale pair
   - Enforcement in auto-translate pipeline: before sending text to provider, scan for glossary matches. For "never translate" terms, wrap in placeholder tokens (`{{BRAND_NAME}}`). After translation, replace tokens with original terms.
   - CSV import: parse CSV with columns [source_term, target_term, source_locale, target_locale, case_sensitive, never_translate]. Validate, preview, bulk upsert.
   - AI integration: glossary terms injected into AI system prompt as rules
   - Machine translation integration: post-process Google/DeepL output to enforce glossary (find-and-replace with case sensitivity)

   **UX Design:**
   - Glossary page: sortable/filterable table, inline add/edit
   - Import: drag-and-drop CSV, preview table with validation errors highlighted, confirm button
   - Brand protection: prominent "Never Translate" toggle per term, separate "Protected Terms" section
   - Translation editor: glossary-matched terms highlighted in source text, tooltip shows target term
   - Visual indicators: blue underline for glossary-applied terms in translated text

4. **Differentiator 4: Third-Party App Content Translation**

   **Problem:** Popular apps (Judge.me, Pagefly, Klaviyo) inject content via JavaScript after page load. Translation apps miss this content entirely, leaving mixed-language storefronts.

   **Technical Approach:**
   - Theme extension enhancement: extend existing MutationObserver to detect new text nodes
   - Content detection: scan DOM for text nodes not in the page's declared locale (heuristic: check if text matches known untranslated content patterns)
   - Translation approach: collect untranslated text → batch translate via App Proxy endpoint → inject translations
   - Configuration: merchant selects which DOM selectors / app content to translate (e.g., `.jdgm-rev__body`, `.pf-content`)
   - Caching: translated third-party content cached in localStorage per page + locale
   - Limitation: document that this is best-effort — some apps use shadow DOM or iframes that can't be accessed

   **UX Design:**
   - Settings page section: "Third-Party Content" with toggles per supported app
   - Auto-detect: theme extension reports detected third-party apps to admin dashboard
   - Coverage indicator: "3rd-party content detected on X pages, Y% translated"
   - Limitations clearly communicated: "Works with Judge.me, Pagefly, GemPages. Some apps may not be supported."

**Cross-references:** Links to `api-design.md` for provider interface, `data-model.md` for models per differentiator, `features.md` for feature IDs.

---

## TODO Steps

Ordered by dependency. Each TODO = one file.

- [ ] TODO 1: Create `docs/architecture/vision.md` — see File Spec above
  - Files: `docs/architecture/vision.md`
- [ ] TODO 2: Create `docs/architecture/competitive-analysis.md` — see File Spec above
  - Files: `docs/architecture/competitive-analysis.md`
- [ ] TODO 3: Create `docs/architecture/architecture.md` — see File Spec above
  - Files: `docs/architecture/architecture.md`
  - Depends on: TODO 1 (vision principles inform architecture decisions)
- [ ] TODO 4: Create `docs/architecture/data-model.md` — see File Spec above
  - Files: `docs/architecture/data-model.md`
  - Depends on: TODO 3 (architecture boundaries inform model design)
- [ ] TODO 5: Create `docs/architecture/features.md` — see File Spec above
  - Files: `docs/architecture/features.md`
  - Depends on: TODO 2 (competitor data informs parity mapping)
- [ ] TODO 6: Create `docs/architecture/api-design.md` — see File Spec above
  - Files: `docs/architecture/api-design.md`
  - Depends on: TODO 3, TODO 4 (architecture + data model inform API)
- [ ] TODO 7: Create `docs/architecture/ux-flows.md` — see File Spec above
  - Files: `docs/architecture/ux-flows.md`
  - Depends on: TODO 5, TODO 6 (features + API inform flows)
- [ ] TODO 8: Create `docs/architecture/differentiators.md` — see File Spec above
  - Files: `docs/architecture/differentiators.md`
  - Depends on: TODO 4, TODO 6 (data model + API inform technical approach)
- [ ] TODO 9: Create `docs/architecture/dx-guide.md` — see File Spec above
  - Files: `docs/architecture/dx-guide.md`
  - Depends on: TODO 3, TODO 6 (architecture + API inform conventions)
- [ ] TODO 10: Create `docs/architecture/execution-plan.md` — see File Spec above
  - Files: `docs/architecture/execution-plan.md`
  - Depends on: ALL previous TODOs (execution plan references everything)

## Test Cases

### Functional
- [ ] All 10 documents exist in `docs/architecture/`
- [ ] Vision document contains mission, problem statement, personas, positioning matrix, north-star metrics, principles
- [ ] Architecture document contains system diagram, layer responsibilities, 3 data flow diagrams, component boundaries, background job design, caching strategy, error handling, security considerations
- [ ] Features document contains all 45+ features with priority (P0/P1/P2), parity status, build status
- [ ] Competitive analysis contains 6 competitor deep dives, feature comparison matrix (30+ rows), pricing analysis, market gaps
- [ ] Data model contains 7 new models with exact field definitions, 4 model modifications, migration strategy
- [ ] API design contains complete route tree (25+ routes), new route specifications, service layer API, Shopify API patterns, webhook design
- [ ] UX flows contains 8+ merchant workflows with step-by-step descriptions, navigation structure, empty states, loading states
- [ ] Execution plan contains 8 phases with dependencies, branch strategy, dependency graph
- [ ] DX guide contains folder structure, naming conventions, code conventions, component extraction rules, testing strategy
- [ ] Differentiators document contains 4 deep dives with technical approach and UX design per differentiator

### Cross-References
- [ ] Every document links to at least 2 other documents where relevant
- [ ] Feature IDs (F-CORE-01, etc.) are consistent between features.md and execution-plan.md
- [ ] Model names are consistent between data-model.md and api-design.md
- [ ] Route paths are consistent between api-design.md and ux-flows.md

### Completeness
- [ ] All 28+ Shopify TranslatableResourceType values are listed in features.md
- [ ] All 10 LangShop drawbacks from clarify.md are addressed in vision.md problem statement
- [ ] All 4 differentiators from clarify.md have dedicated sections in differentiators.md
- [ ] All new Prisma models have indexes on `shop` field (multi-tenant query requirement)

## Risks

1. **Document scope creep** — 10 documents is a lot of content. Risk of spending too much time on documentation vs. implementation. Mitigation: each document has exact sections specified — write those sections, don't expand.
2. **Staleness** — Architecture docs become outdated as implementation proceeds. Mitigation: execution-plan.md ties docs to phases; update relevant docs when phase completes.
3. **Over-specification** — Too much detail in docs may constrain implementation flexibility. Mitigation: docs specify "what" and "why", not "how to code it" — code conventions and patterns come from skill standards during /execute.
