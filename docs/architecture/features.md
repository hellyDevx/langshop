# Features

## 1. Priority Definitions

| Priority | Meaning | Timing |
|----------|---------|--------|
| **P0 (Must Have)** | Core functionality required for the app to be usable. Blocks launch. | Ship at launch |
| **P1 (Should Have)** | Important features that differentiate from competitors. High value. | Ship within 2 weeks of P0 |
| **P2 (Nice to Have)** | Enhancement features. Valuable but not blocking. | Ship iteratively after launch |

## 2. Feature Inventory by Category

### Core Translation Engine (P0)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
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

### Market-Aware Translations (P0)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-MKT-01 | Market-scoped translations | P0 | ⬆️ Better | Partial (marketId in queries) |
| F-MKT-02 | Market-specific content (same lang, diff market) | P0 | ⬆️ Better | Not started |
| F-MKT-03 | Market-level dashboard | P1 | ⬆️ Better | Not started |
| F-MKT-04 | Market-level auto-translate config | P1 | ⬆️ Better | Not started |

### Image Management (P0)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-IMG-01 | Product image swap per locale | P0 | ⬆️ Better | Built |
| F-IMG-02 | Metafield image swap per locale | P1 | ⬆️ Better | Built |
| F-IMG-03 | Image management dashboard | P0 | ⬆️ Better | Built |
| F-IMG-04 | Bulk image upload | P2 | ⬆️ Better | Not started |
| F-IMG-05 | Market-scoped image swap | P1 | ⬆️ Better | Partial (placeholder in extension) |

### AI Translation (P1 — Differentiator)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-AI-01 | LLM-powered translation (Claude/OpenAI) | P1 | 🆕 Unique | Not started |
| F-AI-02 | Brand voice configuration | P1 | 🆕 Unique | Not started |
| F-AI-03 | Context injection (product category, tags) | P1 | 🆕 Unique | Not started |
| F-AI-04 | Quality comparison (AI vs machine) | P2 | 🆕 Unique | Not started |
| F-AI-05 | Iterative refinement from feedback | P2 | 🆕 Unique | Not started |

### Analytics & Quality (P1 — Differentiator)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-ANA-01 | Translation coverage dashboard | P1 | 🆕 Unique | Partial (basic stats) |
| F-ANA-02 | Quality scoring | P2 | 🆕 Unique | Not started |
| F-ANA-03 | Translation diff/changelog | P2 | 🆕 Unique | Not started |
| F-ANA-04 | Failure alerts | P1 | 🆕 Unique | Not started |
| F-ANA-05 | Usage tracking | P1 | 🆕 Unique | Not started |
| F-ANA-06 | Stale translation detection | P1 | ⬆️ Better | Not started |

### Glossary & Brand Voice (P1 — Differentiator)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-GLO-01 | Glossary management | P1 | ⬆️ Better (free tier) | Not started |
| F-GLO-02 | Import/export CSV | P2 | ✅ Parity | Not started |
| F-GLO-03 | Auto-enforce during translate | P1 | ⬆️ Better | Not started |
| F-GLO-04 | Brand name protection | P1 | 🆕 Unique | Not started |

### Third-Party Content (P2 — Differentiator)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-3P-01 | DOM-level content detection | P2 | 🆕 Unique | Not started |
| F-3P-02 | Dynamic content translation | P2 | 🆕 Unique | Not started |
| F-3P-03 | Configurable app list | P2 | 🆕 Unique | Not started |

### Storefront (P1)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-SF-01 | Language switcher widget | P1 | ✅ Parity | Not started |
| F-SF-02 | Currency switcher | P2 | ✅ Parity | Not started |
| F-SF-03 | Geolocation auto-detect | P2 | ✅ Parity | Not started |

### Performance (P0 — Differentiator)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-PERF-01 | Cursor-based pagination everywhere | P0 | ⬆️ Better | Partial |
| F-PERF-02 | Background job processing | P0 | ⬆️ Better | Not started |
| F-PERF-03 | Optimistic UI updates | P1 | ⬆️ Better | Partial |
| F-PERF-04 | Batch GraphQL queries | P1 | ⬆️ Better | Not started |
| F-PERF-05 | Resource list virtualization | P2 | ⬆️ Better | Not started |

### Merchant Experience (P0)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-MX-01 | Guided onboarding | P1 | ⬆️ Better | Not started |
| F-MX-02 | Status indicators on all views | P0 | ⬆️ Better | Partial |
| F-MX-03 | Transparent operation log | P1 | 🆕 Unique | Not started |

### Shopify Integration (P0)

| ID | Feature | Priority | LangShop Parity | Status |
|---|---|---|---|---|
| F-INT-01 | Shopify Markets API | P0 | ✅ Parity | Built |
| F-INT-02 | Content change webhooks (auto-sync trigger) | P1 | ⬆️ Better | Not started |
| F-INT-03 | Clean uninstall | P0 | ⬆️ Better | Partial |
| F-INT-04 | App proxy | P0 | ✅ Parity | Built |
| F-INT-05 | Theme extension | P0 | ⬆️ Better | Built |

## 3. Parity Summary

| Metric | Count |
|--------|-------|
| **Total features** | ~45 |
| **LangShop parity** | ~15 features |
| **Better than LangShop** | ~20 features |
| **Unique (no competitor has)** | ~10 features |
| **Already built** | ~10 features |
| **Remaining to build** | ~35 features |

### Build Status Breakdown

| Status | Count | Percentage |
|--------|-------|-----------|
| Built | 10 | 22% |
| Partial | 6 | 13% |
| Not started | 29 | 65% |

## 4. Missing Resource Types

The following `TranslatableResourceType` enum values are **not yet** in `resource-type-map.js` and must be added for P0 completion:

| Resource Type | Description | Priority |
|---|---|---|
| `PRODUCT_OPTION` | Product option names (Size, Color) | P0 |
| `PRODUCT_OPTION_VALUE` | Product option values (Small, Medium, Large) | P0 |
| `COLLECTION_IMAGE` | Collection image alt text | P1 |
| `ARTICLE_IMAGE` | Article/blog image alt text | P1 |
| `MEDIA_IMAGE` | Media library image alt text | P1 |
| `METAOBJECT` | Custom metaobject definitions | P1 |
| `FILTER` | Storefront collection filters | P1 |
| `PACKING_SLIP_TEMPLATE` | Packing slip content | P2 |
| `ONLINE_STORE_THEME_APP_EMBED` | Theme app embed block content | P1 |
| `ONLINE_STORE_THEME_JSON_TEMPLATE` | Theme JSON template content | P1 |
| `ONLINE_STORE_THEME_LOCALE_CONTENT` | Theme locale file content | P0 |
| `ONLINE_STORE_THEME_SECTION_GROUP` | Theme section group content | P1 |
| `ONLINE_STORE_THEME_SETTINGS_CATEGORY` | Theme settings category labels | P2 |
| `ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS` | Theme settings data sections | P2 |

**Currently implemented (18 types):** PRODUCT, COLLECTION, ARTICLE, BLOG, PAGE, MENU, LINK, SHOP, SHOP_POLICY, METAFIELD, PAYMENT_GATEWAY, EMAIL_TEMPLATE, DELIVERY_METHOD_DEFINITION, SELLING_PLAN, SELLING_PLAN_GROUP, ONLINE_STORE_THEME, ONLINE_STORE_THEME_SECTION, PRODUCT_VARIANT (approximate based on existing `resource-type-map.js`)

---

**See also:** [Execution Plan](execution-plan.md) for phased delivery · [Differentiators](differentiators.md) for technical approach per differentiator feature
