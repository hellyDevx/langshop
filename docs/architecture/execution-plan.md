# Execution Plan

## 1. Phase Overview

```
Phase 0: Foundation (DX setup, TypeScript, schema)          ~1 phase
Phase 1: Core Engine Completion (all resource types)         ~1 phase
Phase 2: Market-Aware + Performance                          ~1 phase
Phase 3: Glossary + Brand Voice                              ~1 phase
Phase 4: AI Translation Provider                             ~1 phase
Phase 5: Analytics + Alerts                                  ~1 phase
Phase 6: Storefront (Switcher, Third-Party)                  ~1 phase
Phase 7: Polish + Onboarding                                 ~1 phase
```

## 2. Phase 0: Foundation

**Branch:** `phase-0/foundation`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Migrate all `.jsx` → `.tsx` (TypeScript setup) | F-PERF-01 | All route, service, graphql, util files |
| 2 | Add strict TypeScript config | — | `tsconfig.json` |
| 3 | Create shared types for Shopify GraphQL responses, service interfaces | — | `app/types/shopify.ts`, `app/types/translation.ts`, `app/types/provider.ts` |
| 4 | Run Prisma migration: new models | — | `prisma/schema.prisma`, new migration |
| | — GlossaryTerm | F-GLO-01 | |
| | — BrandVoiceConfig | F-AI-02 | |
| | — TranslationAuditLog | F-ANA-03 | |
| | — TranslationAlert | F-ANA-04 | |
| | — UsageTracking | F-ANA-05 | |
| | — ContentDigest | F-CORE-05 | |
| | — TranslationSuggestion | F-AI-01 | |
| | — OnboardingState | F-MX-01 | |
| 5 | Modify existing models (add new fields) | — | `prisma/schema.prisma` |
| | — TranslationJob: retryCount, scheduledAt, startedAt, completedAt, glossaryApplied | | |
| | — TranslationJobEntry: providerResponse | | |
| | — TranslationProviderConfig: displayName, monthlyQuota, quotaUsed, quotaResetDate | | |
| | — TranslationStats: marketId, update unique constraint | | |
| 6 | Set up folder structure per DX guide | — | `app/components/`, `app/types/`, `app/hooks/` |
| 7 | Fix known bugs | — | `shopify.app.toml`, various |
| | — Add `write_metafields` scope | | |
| | — Update API version to 2026-04 | | |
| | — Fix `AppDistribution` setting | | |
| 8 | Add error boundary at root level | — | `app/root.tsx` |

**Dependencies:** None (first phase)

**Deliverable:** Type-safe codebase with complete schema, all known bugs fixed, folder structure ready.

## 3. Phase 1: Core Engine Completion

**Branch:** `phase-1/core-engine`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Add remaining 10+ resource types to resource-type-map | F-CORE-01 | `app/utils/resource-type-map.ts` |
| | — PRODUCT_OPTION, PRODUCT_OPTION_VALUE, COLLECTION_IMAGE, ARTICLE_IMAGE | | |
| | — MEDIA_IMAGE, METAOBJECT, FILTER, PACKING_SLIP_TEMPLATE | | |
| | — ONLINE_STORE_THEME_APP_EMBED, ONLINE_STORE_THEME_JSON_TEMPLATE | | |
| | — ONLINE_STORE_THEME_LOCALE_CONTENT, ONLINE_STORE_THEME_SECTION_GROUP | | |
| | — ONLINE_STORE_THEME_SETTINGS_CATEGORY, ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS | | |
| 2 | Update resource list UI to handle all types | F-CORE-01 | `app/routes/app.resources.$type._index.tsx` |
| 3 | Implement background job processing | F-PERF-02 | `app/services/auto-translate.server.ts` |
| | — Database-backed queue (not inline) | | |
| | — Job lifecycle: pending → running → completed/failed | | |
| | — Progress tracking per batch | | |
| 4 | Add job retry logic with exponential backoff | F-PERF-02 | `app/services/auto-translate.server.ts` |
| 5 | Implement content diffing for auto-sync | F-CORE-05 | `app/services/content-sync.server.ts`, `app/utils/content-hash.ts` |
| 6 | Add URL handle translation support | F-CORE-06 | `app/routes/app.resources.$type.$id.tsx` |
| 7 | Add SEO meta tag translation | F-CORE-07 | `app/routes/app.resources.$type.$id.tsx` |
| 8 | Image alt text auto-translation | F-CORE-08 | `app/services/auto-translate.server.ts` |
| 9 | Expand locale display names to 200+ languages | F-CORE-10 | `app/utils/locale-utils.ts` |

**Dependencies:** Phase 0 (needs TypeScript, new schema)

**Deliverable:** All 28+ resource types translatable, background jobs working, auto-sync with content diffing.

## 4. Phase 2: Market-Aware + Performance

**Branch:** `phase-2/markets-performance`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Market-specific translation editor | F-MKT-01, F-MKT-02 | `app/routes/app.resources.$type.$id.tsx`, `app/components/MarketSelector.tsx` |
| | — Market selector alongside locale selector | | |
| | — Same language, different market content | | |
| 2 | Market dashboard view | F-MKT-03 | `app/routes/app.markets.$marketId.tsx` |
| | — Translation stats per market | | |
| | — Per-locale coverage within market | | |
| 3 | Market-level auto-translate configuration | F-MKT-04 | `app/routes/app.auto-translate.tsx` |
| 4 | Market-scoped image swap | F-IMG-05 | `extensions/langshop-image-swap/`, `app/services/image-translation.server.ts` |
| | — Update theme extension to pass market context | | |
| 5 | Implement SSE for job progress | F-PERF-02 | `app/routes/api.translation-status.tsx`, `app/hooks/useJobProgress.ts` |
| | — Replace polling with Server-Sent Events | | |
| 6 | Add cursor-based pagination to all remaining list views | F-PERF-01 | Various route files |
| 7 | Optimize GraphQL queries (batch where possible) | F-PERF-04 | `app/graphql/queries/`, services |
| 8 | Add optimistic UI updates to translation editor | F-PERF-03 | `app/routes/app.resources.$type.$id.tsx` |

**Dependencies:** Phase 1 (needs complete resource type support)

**Deliverable:** Full market-aware translations, real-time job progress, fast UI across all views.

## 5. Phase 3: Glossary + Brand Voice

**Branch:** `phase-3/glossary`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Glossary CRUD service | F-GLO-01 | `app/services/glossary.server.ts` |
| 2 | Glossary route + UI | F-GLO-01 | `app/routes/app.glossary.tsx` |
| | — Data table, inline add/edit, delete, locale pair filter | | |
| 3 | CSV import/export | F-GLO-02 | `app/routes/app.glossary.import.tsx`, `app/services/glossary.server.ts` |
| | — Upload, preview with validation, bulk upsert | | |
| | — Export to CSV download | | |
| 4 | Brand name protection | F-GLO-04 | `app/services/glossary.server.ts` |
| | — "Never translate" flag | | |
| | — Quick-add for all locale pairs | | |
| 5 | Glossary enforcement in auto-translate pipeline | F-GLO-03 | `app/services/auto-translate.server.ts`, `app/services/glossary.server.ts` |
| | — Pre-translation: wrap protected terms in placeholders | | |
| | — Post-translation: restore terms and enforce translations | | |
| 6 | Brand voice configuration UI | F-AI-02 | `app/routes/app.settings.brand-voice.tsx` |
| 7 | Brand voice service | F-AI-02 | `app/services/brand-voice.server.ts` |
| | — CRUD config, build AI system prompt | | |

**Dependencies:** Phase 1 (needs background job system for enforcement during auto-translate)

**Deliverable:** Working glossary with full enforcement, brand voice configuration ready for AI provider.

## 6. Phase 4: AI Translation Provider

**Branch:** `phase-4/ai-translation`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Create AI provider adapter | F-AI-01 | `app/services/providers/ai-provider.server.ts` |
| | — Claude API (Messages) integration | | |
| | — OpenAI Chat Completions integration | | |
| | — Structured JSON output parsing | | |
| 2 | Implement context injection | F-AI-03 | `app/services/providers/ai-provider.server.ts` |
| | — Product category, collection, tags | | |
| | — Resource type context | | |
| 3 | Integrate brand voice into AI prompts | F-AI-02 | `app/services/brand-voice.server.ts`, `app/services/providers/ai-provider.server.ts` |
| 4 | Integrate glossary rules into AI prompts | F-GLO-03 | `app/services/providers/ai-provider.server.ts` |
| 5 | Add AI as provider option in auto-translate UI | F-AI-01 | `app/routes/app.auto-translate.tsx`, `app/routes/app.settings.tsx` |
| | — Provider selector, API key config | | |
| | — Cost estimation before generation | | |
| 6 | AI suggestion review UI | F-AI-01 | `app/routes/app.resources.$type.$id.tsx` |
| | — Three-column view: source / suggestion / current | | |
| | — Accept, edit & accept, reject actions | | |
| | — Accept All bulk action | | |
| 7 | Quality comparison view | F-AI-04 | `app/routes/app.resources.$type.$id.tsx` |
| | — Toggle: AI suggestion vs machine translation side-by-side | | |

**Dependencies:** Phase 3 (needs glossary + brand voice for full context injection)

**Deliverable:** AI-powered translations with context, brand voice, and glossary awareness. Suggest-first model with merchant review.

## 7. Phase 5: Analytics + Alerts

**Branch:** `phase-5/analytics`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Translation coverage dashboard | F-ANA-01 | `app/routes/app.analytics.tsx`, `app/services/analytics.server.ts` |
| | — Per locale, per market, per resource type | | |
| | — Donut charts, drill-down tables | | |
| 2 | Usage tracking | F-ANA-05 | `app/routes/app.analytics.usage.tsx`, `app/services/analytics.server.ts` |
| | — Characters, requests per provider per day | | |
| | — Cost estimation | | |
| 3 | Stale translation detection | F-ANA-06 | `app/services/analytics.server.ts`, `app/services/content-sync.server.ts` |
| | — Compare ContentDigest with current Shopify content | | |
| | — "Re-translate stale" bulk action | | |
| 4 | Alert system | F-ANA-04 | `app/services/alerts.server.ts`, `app/routes/app.alerts.tsx` |
| | — Create alerts on failure, stale, quota warning | | |
| | — Alert center UI with badge count in nav | | |
| | — Dismiss single and bulk dismiss | | |
| 5 | Translation audit log | F-ANA-03 | `app/services/analytics.server.ts` |
| | — Log all translation changes with source | | |
| | — Previous/new value tracking | | |
| 6 | Translation diff view | F-ANA-03 | `app/routes/app.resources.$type.$id.tsx` |
| | — Show previous vs current translation value | | |

**Dependencies:** Phase 2 (needs market-aware stats), Phase 4 (needs usage data from AI provider)

**Deliverable:** Full analytics dashboard, proactive alerts, complete audit trail.

## 8. Phase 6: Storefront

**Branch:** `phase-6/storefront`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Language switcher theme extension | F-SF-01 | `extensions/langshop-switcher/` |
| | — Dropdown, flag icons, text-only display modes | | |
| | — Configurable via theme editor | | |
| 2 | Mobile-optimized switcher variant | F-SF-01 | `extensions/langshop-switcher/` |
| 3 | Geolocation auto-detect | F-SF-03 | `extensions/langshop-switcher/` |
| | — Optional, configurable | | |
| 4 | Third-party app content detection | F-3P-01 | `extensions/langshop-image-swap/` |
| | — Extend MutationObserver for text node detection | | |
| | — Pre-configured selectors for Judge.me, Pagefly, GemPages, Yotpo | | |
| 5 | Dynamic content translation | F-3P-02 | `extensions/langshop-image-swap/`, `app/routes/api.translate-content.tsx` |
| | — Batch text → App Proxy → translate → inject | | |
| | — localStorage caching | | |
| 6 | Configurable third-party app list | F-3P-03 | `app/routes/app.settings.tsx` |
| | — Toggle per app, custom selector input | | |

**Dependencies:** Phase 2 (needs market-scoped storefront features)

**Deliverable:** Complete storefront experience with language switcher and third-party content translation.

## 9. Phase 7: Polish + Onboarding

**Branch:** `phase-7/polish`

| # | Task | Features | Files |
|---|------|----------|-------|
| 1 | Guided onboarding wizard | F-MX-01 | `app/routes/app.onboarding.tsx` |
| | — 6-step wizard with progress bar | | |
| | — Detect shop config, suggest settings | | |
| 2 | Empty states for all pages | — | All route files |
| | — Polaris EmptyState with contextual CTAs | | |
| 3 | Loading skeletons for all pages | — | All route files |
| | — SkeletonPage, SkeletonBodyText, SkeletonDisplayText | | |
| 4 | RTL language support in translation editor | F-CORE-09 | `app/routes/app.resources.$type.$id.tsx` |
| | — `dir="rtl"` on target text fields for RTL locales | | |
| 5 | Keyboard accessibility audit | — | All components |
| | — Tab order, focus management, ARIA labels | | |
| 6 | Clean uninstall | F-INT-03 | `app/routes/webhooks.app.uninstalled.tsx` |
| | — Delete all app data: jobs, entries, configs, images, glossary, analytics | | |
| | — Clean up metafields created by the app | | |
| | — Confirmation dialog before data removal | | |
| 7 | Error boundary improvements | — | `app/root.tsx`, route-level boundaries |
| 8 | Final UX review and polish | — | All routes |

**Dependencies:** All previous phases

**Deliverable:** Production-ready app with complete merchant experience, accessible UI, clean lifecycle.

## 10. Dependency Graph

```
Phase 0 ──────→ Phase 1 ──────→ Phase 2 ──────→ Phase 6
                    │                │
                    │                │
                    ▼                ▼
                 Phase 3 ──→ Phase 4 ──→ Phase 5
                                            │
                                            │
                    All phases ────────→ Phase 7
```

**Reading the graph:**
- Phase 0 must complete before anything else starts
- Phase 1 unlocks both Phase 2 and Phase 3 (parallel tracks)
- Phase 2 unlocks Phase 6
- Phase 3 → Phase 4 → Phase 5 is a sequential chain
- Phase 7 waits for all other phases

**Parallel opportunities:**
- After Phase 1: Phase 2 and Phase 3 can run in parallel
- After Phase 2 + Phase 4: Phase 5 and Phase 6 can run in parallel

## 11. Branch Strategy

| Rule | Detail |
|------|--------|
| **One branch per phase** | Each phase = one feature branch off `main` |
| **Branch naming** | `phase-{N}/{short-name}` (e.g., `phase-0/foundation`, `phase-3/glossary`) |
| **Merge strategy** | Merge to `main` after each phase is complete and tested |
| **No long-lived branches** | Merge frequently — each phase is a self-contained increment |
| **PR per phase** | One pull request per phase for code review |
| **Hotfix branches** | `fix/{description}` for urgent fixes between phases |

### Example Branch Timeline

```
main ──●──────────●──────────●──────────●──────────●──────── ...
       │          ↑          ↑          ↑          ↑
       └─ phase-0/foundation ─┘          │          │
                  └─ phase-1/core-engine ─┘          │
                             ├─ phase-2/markets ─────┘
                             └─ phase-3/glossary ──→ phase-4/ai ──→ ...
```

---

**See also:** [Features](features.md) for feature IDs per phase · [Data Model](data-model.md) for schema migrations per phase · [API Design](api-design.md) for routes per phase
