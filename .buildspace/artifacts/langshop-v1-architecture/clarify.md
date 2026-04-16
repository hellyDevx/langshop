# Requirements: LangShop V1 Architecture & Vision

**Goal:** Define the complete architecture, vision, competitive positioning, and step-by-step execution plan for a Shopify translation management app that achieves full LangShop feature parity while adding powerful differentiators — AI-powered context-aware translation, translation analytics, glossary on all tiers, and third-party app content translation. Documentation lives in `docs/architecture/`.

## Context

### Current State
- Working Remix + Prisma + Polaris codebase with:
  - Dashboard with language selector and translation stats (sampled from first 50 items)
  - Resource listing/browsing by type with pagination
  - Settings page with Google Translate and DeepL API key validation
  - Auto-translate job creation and progress tracking
  - Image translation management with storefront theme extension (image-swap)
  - Markets overview
  - Full GraphQL query layer for all 28+ resource types
  - Webhook handling (uninstall, scope updates)
- Stack: Remix v2.16.1, Prisma v6.2.1 (SQLite), Polaris v12.0.0, Shopify App Remix v4.1.0
- API version: 2026-04, embedded app with app proxy for image gallery

### Distribution Model
- Private/custom app for now (no billing integration or app store review needed)
- May go public on Shopify App Store in a future phase

### Reference App: LangShop
- **Rating:** 4.8/5 (~626 reviews)
- **Pricing:** Free ($0, 1 lang, 250 products) → Basic ($10, 3 lang) → Standard ($40, 5 lang) → Advanced ($75, unlimited)
- **Key features:** 247 languages, AI translation (ChatGPT-4/DeepL/Google Cloud), URL handle translation, SEO meta tags, third-party app dynamic translations, metafield translation, glossary, bulk editing, RTL support, Shopify Markets integration, currency converter, customizable language/currency switcher, Shopify Flow, auto-sync

### LangShop Drawbacks (Confirmed from Research)
1. **Hidden cost trap / runaway billing** — auto-retranslates ALL content on every shop change via API, leading to $2,000-$3,000/month unexpected bills with no merchant control
2. **Silent translation failures** — translations fail for 17+ days with zero notification
3. **Performance degradation** — dynamic translations feature slows storefront loading
4. **Dashboard is slow** — poor UI performance, missing pagination for large catalogs
5. **No market-level granular control** — cannot manage translations per-market (only per-language)
6. **Auto-translate limitations** — does not work with duplicate products (undocumented)
7. **Missing pagination** — lists not properly paginated across the app
8. **Glossary/brand voice gated behind premium** — basic terminology control requires $40+/month plan
9. **No image management per locale** — cannot swap product images per language/market
10. **Data integrity risk on uninstall** — translation data persists and can corrupt store data

### Competitive Landscape Summary
| App | Rating | Reviews | Starting Price | Key Strength | Key Weakness |
|-----|--------|---------|----------------|-------------|--------------|
| LangShop | 4.8 | ~626 | $0 (250 products) | 247 languages, broadest feature set | Runaway billing, slow dashboard |
| Weglot | High | Many | $15/mo | Brand voice AI, visual editor | Expensive at scale (word-count pricing) |
| Transcy | 4.8 | ~2,647 | $0 | Unlimited words pricing | Billing scandal, SEO issues |
| Langify | 4.7 | ~1,500 | $17.50/mo | Simple, reliable | No free plan, 3rd-party gaps |
| T Lab | 4.9 | ~879 | $0 | Best value, image translation, Autopilot | Smaller user base |
| Translate & Adapt | N/A | N/A | Free (Shopify) | Free, official | 2 auto-translate languages, 100K char/year cap |

### Market-Wide Pain Points (ALL Apps)
1. Performance degradation on storefronts from dynamic translations
2. Unexpected/runaway billing from auto-retranslation
3. Image translation nearly nonexistent
4. Third-party app content (Judge.me, Pagefly, Klaviyo) gaps
5. Silent failures — mixed-language storefronts with no alerts
6. Glossary/brand control gated behind premium tiers
7. Checkout translation fragility after Shopify updates
8. Data retention issues on uninstall
9. Quota opacity — no visibility into usage/costs
10. Poor dashboard UX — slow loading, missing pagination

---

## Requirements

### R1: Architecture Documentation Suite
The following documents must be created in `docs/architecture/`:
- **R1.1** `vision.md` — App vision, mission, competitive positioning, target merchant persona, and north-star metrics
- **R1.2** `architecture.md` — Technical architecture overview: system diagram, data flow, component boundaries, API layer design, database schema design, caching strategy, job processing
- **R1.3** `features.md` — Complete feature inventory organized by category with priority levels (P0/P1/P2), feature parity mapping against LangShop, and differentiator features
- **R1.4** `competitive-analysis.md` — Detailed competitive research with feature comparison matrix, pricing analysis, drawback analysis, and market gaps
- **R1.5** `data-model.md` — Complete Prisma schema design with all models, relationships, indexes, and migration strategy from current schema
- **R1.6** `api-design.md` — Internal API design (route structure, loader/action patterns), Shopify GraphQL API usage patterns, and external API integrations (translation providers)
- **R1.7** `ux-flows.md` — Key merchant workflows and user journeys: onboarding, manual translation, bulk translation, auto-translate, image management, glossary management, analytics review
- **R1.8** `execution-plan.md` — Step-by-step implementation phases with dependencies, organized as a branch-by-branch execution roadmap
- **R1.9** `dx-guide.md` — Developer experience guide: local setup, testing strategy, code conventions, folder structure, extension points for future features
- **R1.10** `differentiators.md` — Deep dive on each differentiating feature: AI translation, analytics, glossary, third-party content — including technical approach and UX design

### R2: Core Translation Engine (LangShop Parity)
- **R2.1** Translate ALL Shopify translatable resource types (28+ types): products, product options/values, collections, pages, blogs, articles, media/image alt text, menus/links, metafields, metaobjects, filters, shop info, policies, email templates, payment gateways, delivery methods, selling plans, packing slips, theme content (locale, JSON templates, sections, settings, app embeds)
- **R2.2** Manual translation editor with side-by-side source/target view
- **R2.3** Bulk editing — translate multiple resources at once
- **R2.4** Auto-translate via multiple providers: Google Translate, DeepL, and AI (Claude/GPT)
- **R2.5** Auto-sync — detect new/changed content and translate automatically, but ONLY changed content (content diffing to prevent runaway costs)
- **R2.6** URL handle translation for SEO
- **R2.7** SEO meta tag translation (title, description, og tags)
- **R2.8** Image alt text translation
- **R2.9** RTL language support
- **R2.10** Support for 200+ languages (matching LangShop's breadth)

### R3: Market-Aware Translation (Key Differentiator from LangShop)
- **R3.1** Full Shopify Markets integration — translations scoped to markets, not just languages
- **R3.2** Market-specific translations — same language, different content per market (e.g., US English vs UK English vs AU English)
- **R3.3** Market-level dashboard — view translation status per market
- **R3.4** Market-level auto-translate — configure translation rules per market
- **R3.5** Leverage `translationsRegister` `marketId` parameter from day one

### R4: Image Management Per Locale/Market (Unique Differentiator)
- **R4.1** Swap product images per locale and per market
- **R4.2** Swap metafield images per locale and per market
- **R4.3** Storefront theme extension for automatic image swapping (already partially built)
- **R4.4** Image management dashboard with visual preview per locale
- **R4.5** Bulk image upload and assignment

### R5: AI-Powered Context-Aware Translation (Differentiator)
- **R5.1** LLM-powered translation (Claude API / OpenAI) that understands product context, category, and brand voice — not just word-for-word translation
- **R5.2** Brand voice configuration — merchants define tone, style, terminology preferences
- **R5.3** Context injection — feed product category, collection, tags, and surrounding content to the LLM for better translations
- **R5.4** Translation quality comparison — show AI translation vs standard machine translation side by side
- **R5.5** Iterative refinement — merchants can give feedback on translations and AI improves

### R6: Translation Analytics & Quality Scoring (Differentiator)
- **R6.1** Translation coverage dashboard — percentage translated per resource type, per locale, per market
- **R6.2** Quality scoring — automated quality assessment of translations (completeness, consistency, terminology adherence)
- **R6.3** Translation diff/changelog — show what changed between translation versions
- **R6.4** Failure alerts — real-time notifications when translations fail (never silent failures)
- **R6.5** Usage tracking — clear visibility into API usage, translation counts, cost estimates
- **R6.6** Stale translation detection — flag translations that may be outdated because source content changed

### R7: Glossary & Brand Voice on All Tiers (Differentiator)
- **R7.1** Glossary/terminology management — define terms that should always (or never) be translated a specific way
- **R7.2** Available on ALL tiers (including free) — not gated behind premium
- **R7.3** Import/export glossary (CSV)
- **R7.4** Glossary enforcement during auto-translate — automatically apply glossary rules
- **R7.5** Brand name protection — mark terms that should never be translated (brand names, product lines)

### R8: Third-Party App Content Translation (Differentiator)
- **R8.1** Translate dynamically injected content from popular third-party apps (Judge.me reviews, Pagefly pages, Klaviyo forms, Yotpo, GemPages, etc.)
- **R8.2** DOM-level translation detection — identify untranslated content on storefront
- **R8.3** Translation proxy or mutation observer approach for dynamic content
- **R8.4** Allow merchants to configure which third-party content to translate

### R9: Performance (Core Differentiator — Solving LangShop's #1 Complaint)
- **R9.1** Fast, paginated dashboard — every list view must be paginated with cursor-based pagination
- **R9.2** Optimistic UI updates — translations feel instant
- **R9.3** Background job processing — all bulk/auto-translate operations run as background jobs, never blocking the UI
- **R9.4** Efficient Shopify API usage — batch GraphQL queries, respect rate limits, use bulk operations where available
- **R9.5** Minimal storefront performance impact — translation serving must not slow down the storefront
- **R9.6** Lazy loading and virtualization for large resource lists
- **R9.7** Caching strategy for translation data and resource metadata

### R10: Merchant Experience (MX)
- **R10.1** One-click setup — guided onboarding that detects shop languages, markets, and suggests initial configuration
- **R10.2** Clear status indicators — always know what's translated, what's pending, what failed
- **R10.3** No silent failures — every error surfaced with actionable guidance
- **R10.4** Smart defaults — auto-detect primary locale, suggest target locales based on market configuration
- **R10.5** Transparent operations — show exactly what the app is doing and why (no opaque auto-retranslation)

### R11: Developer Experience (DX)
- **R11.1** Clean, modular codebase with clear separation of concerns
- **R11.2** Type-safe throughout (TypeScript migration from current JS)
- **R11.3** Service layer pattern — all business logic in services, routes are thin
- **R11.4** Testable architecture — services can be unit tested, routes can be integration tested
- **R11.5** Clear extension points for adding new translation providers, resource types, or features
- **R11.6** Well-documented folder structure and conventions

### R12: UX Design Principles
- **R12.1** Polaris-native — use Shopify Polaris components throughout, no custom UI framework
- **R12.2** Consistent navigation — clear information hierarchy with logical grouping
- **R12.3** Responsive — works on all screen sizes merchants use
- **R12.4** Keyboard accessible — all workflows achievable without a mouse
- **R12.5** Progressive disclosure — show essential info first, details on demand
- **R12.6** Batch operations — every list supports select-all and bulk actions

### R13: Language/Currency Switcher
- **R13.1** Customizable storefront language switcher widget
- **R13.2** Supports dropdown, flag icons, or text-only display modes
- **R13.3** Currency switcher integrated with language switcher
- **R13.4** Auto-detect visitor locale via geolocation (optional)
- **R13.5** Mobile-optimized switcher variant

### R14: Shopify Integration
- **R14.1** Full Shopify Markets API integration
- **R14.2** Webhook handling for content changes (trigger auto-sync)
- **R14.3** Clean uninstall — properly remove all translation data and metafields on app removal
- **R14.4** App proxy for storefront API endpoints
- **R14.5** Theme extension for image swap and language switcher
- **R14.6** Shopify Flow integration (future phase)

---

## Out of Scope (for V1 Architecture Docs)
- Billing/pricing implementation (private app for now, no app store listing)
- App store listing page design and marketing copy
- Shopify Flow triggers/actions (documented as future phase)
- Currency conversion logic (rely on Shopify Markets native currency)
- Multi-store management (single store per install)
- Human translation marketplace/agency integration
- Video content translation
- PDF/document translation

---

## Acceptance Criteria
- [ ] All 10 architecture documents (R1.1–R1.10) are written and saved to `docs/architecture/`
- [ ] Vision document clearly articulates competitive positioning against LangShop, Weglot, Transcy, T Lab, and Langify
- [ ] Feature inventory covers ALL 28+ Shopify translatable resource types
- [ ] Architecture document includes system diagram, data flow, and component boundaries
- [ ] Data model covers all entities needed for R2–R14 requirements
- [ ] Execution plan is organized into phases with clear dependencies and a branch-per-phase strategy
- [ ] Each differentiator (R5–R8) has a dedicated technical approach section in `differentiators.md`
- [ ] UX flows document covers the complete merchant journey from onboarding to daily use
- [ ] DX guide establishes conventions that the implementation will follow
- [ ] All documents cross-reference each other where relevant

---

## Competitive Positioning Summary

### Why Merchants Should Choose This Over LangShop
1. **Performance** — Fast, paginated dashboard vs LangShop's sluggish UI
2. **Market-aware** — Per-market translations, not just per-language
3. **Image management** — Swap product/metafield images per locale/market
4. **AI translation** — Context-aware LLM translations that understand brand voice
5. **No runaway billing** — Smart content diffing, only translates what changed
6. **Transparency** — Full analytics, failure alerts, usage visibility
7. **Glossary for everyone** — Terminology management on all tiers, not gated behind premium
8. **Third-party content** — Translate Judge.me, Pagefly, and other dynamically injected content
9. **Clean uninstall** — Proper data cleanup, no store corruption risk
10. **No silent failures** — Every error surfaced with actionable guidance
