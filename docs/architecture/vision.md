# Vision

## 1. Mission Statement

We are building the translation management app that Shopify merchants deserve — fast, transparent, market-aware, and AI-powered. Our app empowers merchants to deliver high-quality, localized shopping experiences across every market they sell into, without the performance penalties, surprise costs, or silent failures that plague existing solutions. We treat Shopify Markets as first-class citizens, give merchants full control over their translation pipeline, and use AI not as a black box but as an intelligent copilot that understands brand voice, product context, and industry terminology.

## 2. Problem Statement

Existing Shopify translation apps — led by LangShop — share a set of systemic problems that frustrate merchants and erode trust. We solve every one of them.

### Performance

| Problem | Impact |
|---------|--------|
| **Slow dashboard** | Large catalogs (5,000+ products) cause UI freezes. Missing pagination forces merchants to wait through full-page loads. |
| **Missing pagination** | List views across the app are not properly paginated, making navigation painful at scale. |

### Transparency

| Problem | Impact |
|---------|--------|
| **Silent translation failures** | Translations fail for days or weeks with zero notification, leaving mixed-language storefronts live. |
| **Runaway billing** | Auto-retranslation triggers on every shop change via API, leading to $2,000–$3,000/month unexpected bills with no merchant control or visibility. |
| **Quota opacity** | No visibility into API usage, translation counts, or cost estimates. Merchants discover overages only on their invoice. |

### Control

| Problem | Impact |
|---------|--------|
| **No market-level granularity** | Translations are scoped to languages, not markets. Same-language, different-market content (US English vs UK English) is impossible. |
| **No image management per locale** | Cannot swap product images per language or market — a requirement for culturally appropriate visual merchandising. |
| **Glossary gated behind premium** | Basic terminology management (brand name protection, consistent translations) requires a $40+/month plan. |

### Intelligence

| Problem | Impact |
|---------|--------|
| **No AI context** | Machine translation treats every string identically. Product titles, SEO descriptions, and brand copy all get the same word-for-word treatment with no understanding of context, category, or voice. |
| **No quality scoring** | Zero visibility into translation quality. Merchants have no way to identify bad translations without manually reviewing every string. |

## 3. Target Merchant Persona

### Growth Merchant

- **Store size:** 500–5,000 products
- **Markets:** 2–5 active markets
- **Translation needs:** Needs auto-translate to cover volume, but fears billing surprises and bad translations going live unreviewed
- **Pain points:** Slow dashboards at this catalog size, no way to prioritize which content to translate first, glossary locked behind premium tiers
- **Values:** Speed, transparency, affordable access to quality tools
- **Success metric:** "I can see exactly what's translated, what's pending, and what it costs me — and my dashboard loads instantly."

### Enterprise Merchant

- **Store size:** 10,000+ products
- **Markets:** 5+ markets with market-specific content needs
- **Translation needs:** Market-specific translations (US English vs UK English vs AU English), brand voice consistency across all locales, third-party app content coverage, analytics and audit trail
- **Pain points:** Cannot differentiate content per market with current tools, no visibility into translation health, third-party app content left untranslated
- **Values:** Brand consistency, market-level control, comprehensive analytics, clean operations
- **Success metric:** "Every market has the right content, my brand voice is consistent, and I know the health of every translation at a glance."

## 4. Competitive Positioning Matrix

| Capability | LangShop | Weglot | Transcy | Langify | T Lab | Translate & Adapt | **Our App** |
|---|---|---|---|---|---|---|---|
| Fast dashboard (paginated) | ❌ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | **✅** |
| Market-aware translations | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | **✅** |
| Image swap per locale | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | **✅** |
| AI translation (context-aware) | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Glossary (free tier) | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | **✅** |
| Third-party content translation | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | **✅** |
| Silent failure prevention | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ⚠️ | **✅** |
| Transparent billing/usage | ❌ | ⚠️ | ❌ | ✅ | ✅ | ✅ | **✅** |
| Clean uninstall | ❌ | ⚠️ | ❌ | ⚠️ | ⚠️ | ✅ | **✅** |

**Legend:** ✅ Full support · ⚠️ Partial/limited · ❌ Not supported

## 5. North-Star Metrics

| Metric | Definition | Target |
|--------|-----------|--------|
| **Translation coverage rate** | Percentage of translatable content with published translations, per store, per locale, per market | > 90% for active markets |
| **Time to first translation** | Minutes from app install to first translation published to storefront | < 5 minutes |
| **Auto-translate accuracy** | Percentage of auto-translations that merchants accept without editing (inverse of merchant override rate) | > 85% |
| **Dashboard response time** | p95 page load time across all admin views | < 500ms |
| **Zero silent failures** | Percentage of translation errors that are surfaced to the merchant with an actionable message | 100% |

## 6. Principles

### Performance First

Every list is paginated. Every bulk operation runs in the background. Every action is non-blocking. If the UI freezes, it's a bug, not a tradeoff.

### Markets Are First-Class

We don't translate "into languages" — we translate "for markets." A market owns its translations. The same language in two markets can have entirely different content. This is how Shopify Models it, and we follow suit from day one.

### No Surprises

Every operation is transparent. The merchant always knows what the app is doing and why. No opaque auto-retranslation that silently consumes API quota. No translations going live without explicit merchant action. Every cost is visible before it's incurred.

### AI as Copilot

AI generates translation *suggestions*, not final translations. The merchant reviews, edits, and approves. Context injection (product category, tags, collection) and brand voice configuration make AI translations better than word-for-word machine output — but the merchant always has the final say.

### Developer Ergonomics

TypeScript throughout. Testable service layer. Clear conventions. New translation providers plug in via a standard interface. New resource types are a single map entry. The codebase should be as pleasant to extend as the app is to use.

---

**See also:** [Competitive Analysis](competitive-analysis.md) for detailed competitor data · [Features](features.md) for full feature inventory · [Differentiators](differentiators.md) for technical approach to each differentiator
