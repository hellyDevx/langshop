# Differentiators

## 1. AI-Powered Context-Aware Translation (Suggest-First Model)

### Problem

Existing apps use word-for-word machine translation (Google Translate, DeepL) that doesn't understand product context, industry terminology, or brand voice. A luxury handbag and a grocery bag get the same translation. Product descriptions lose their persuasive tone. Brand names get translated into gibberish. Worse — most apps auto-apply translations without review, so bad translations go live silently.

### Our Approach

AI generates translation **suggestions** first. Merchants review, edit if needed, then explicitly apply. No translation goes live without merchant approval.

This is fundamentally different from LangShop's "ChatGPT-4 translation" — which is just another auto-apply provider. We treat AI as a copilot that generates informed suggestions, not a black box that produces final output.

### Technical Approach

**Provider architecture:**

New provider: `ai-provider.server.ts` implementing a `SuggestionProvider` interface — distinct from the auto-apply `TranslationProvider` interface used by Google/DeepL.

**Suggestion flow:**

```
Merchant requests AI suggestions
    │
    ▼
Build system prompt:
    - Brand voice config (tone, style, instructions)
    - Glossary terms (must-translate and never-translate rules)
    - Product context (category, tags, collection name)
    - Merchant instructions
    │
    ▼
Send to Claude API / OpenAI API
    │
    ▼
Parse structured JSON response
    │
    ▼
Store as TranslationSuggestion records (status: "pending")
    │
    ▼
Merchant reviews in UI → accept / edit / reject
    │
    ▼
Accepted suggestions → translationsRegister with Shopify
Rejected suggestions → optionally store feedback for improvement
```

**Model selection:**
- Quality: Claude Sonnet (`claude-sonnet-4-5-20241022`) — best translation quality with strong context understanding
- Budget: Claude Haiku (`claude-haiku-4-5-20251001`) or OpenAI GPT-4o-mini — cheaper, still context-aware
- Merchant choice in settings (default: Sonnet for quality)

**Batch strategy:** Group related fields per product (title + description + SEO meta together) for consistent voice within a single product. Send as one API call with structured output.

**Token management:** Estimate tokens before sending. Warn merchant if approaching limits. Show estimated cost before generating suggestions.

**Prompt template:**

```
System: You are a professional translator for an e-commerce store.

Brand voice: {tone}, {style}
{instructions from merchant}

Glossary rules:
- Always translate "{sourceTerm}" as "{targetTerm}" ({locale pair})
- Never translate: {brand names list}

Translate the following {resourceType} content from {sourceLang} to {targetLang}.

Product context:
- Category: {category}
- Tags: {tags}
- Collection: {collection}

Maintain brand voice. Apply glossary rules strictly.
Return JSON: { "translations": [{ "key": "{fieldKey}", "value": "{translation}" }] }
```

**Suggestion storage:** `TranslationSuggestion` model stores:
- AI output (`suggestedValue`)
- Merchant edits (`editedValue`, null if accepted as-is)
- Accept/reject status and optional rejection reason
- This data feeds future prompt improvement (P2)

### UX Design

**Suggestion generation:**
- "Get AI Suggestions" button in translation editor (per resource)
- "Generate AI Suggestions" option in bulk auto-translate form
- Button clearly labeled as generating suggestions, not final translations

**Review UI — three-column view in translation editor:**

| Source (Original) | AI Suggestion | Current Translation |
|---|---|---|
| Read-only, primary locale | Editable, highlighted in blue | Read-only (if exists) |

**Merchant actions per field:**
- **Accept** — one click, registers suggestion with Shopify immediately
- **Edit & Accept** — modify the suggestion text, then apply
- **Reject** — dismiss suggestion, optionally provide a reason
- **Accept All** — bulk action: select multiple fields → apply all suggestions at once

**Suggestion badges:** Resources with pending AI suggestions show a blue "Suggestions Available" badge in the resource list.

**Quality comparison:** Toggle button to show AI suggestion vs Google/DeepL translation side-by-side for the same content. Helps merchant pick the best option or blend approaches.

**Brand voice setup:** Settings → Brand Voice page with:
- Tone dropdown (Professional, Casual, Playful, Formal, Friendly)
- Style dropdown (Concise, Descriptive, Technical, Conversational)
- Free-text instructions textarea
- Preview section showing a sample prompt

**Cost indicator:** Before generating, show: "Estimated cost: ~$0.12 for 15 fields using Claude Sonnet"

**Feedback loop (P2):** When a merchant edits a suggestion before accepting, store the delta. Over time, use merchant corrections to refine prompt templates — measure suggestion acceptance rate per locale pair.

## 2. Translation Analytics & Quality Scoring

### Problem

Merchants have zero visibility into translation health. They don't know what percentage of their content is translated, what's become stale after source content changed, what failed silently, or how much they're spending on translation APIs. They discover problems only when customers complain about mixed-language pages.

### Technical Approach

**Coverage calculation:**
- Query `translatableResourcesWithTranslations` for each resource type / locale / market combination
- Compute percentage: `translatedFields / totalFields`
- Cache in `TranslationStats` with 30-minute TTL (existing pattern, extend with market dimension)
- Dashboard aggregates cached stats — no live Shopify queries on page load

**Stale detection:**
- `ContentDigest` model stores SHA-256 hash of source content per field
- On webhook (`products/update`, `collections/update`): recompute hash, compare with stored
- If hash differs: mark translations for that resource as potentially stale
- Stale detection runs via webhooks (event-driven) and daily sweep (scheduled)

**Usage tracking:**
- Increment `UsageTracking` record on every provider API call
- Track: characters sent, request count, per provider, per locale, per day
- Cost estimation: multiply character count by provider pricing (Google: $20/M, DeepL: $25/M, Claude: varies by model)

**Alert generation:**
- After each auto-translate job: check for failures → create `TranslationAlert` (type: "failure")
- Daily sweep: check for stale translations → create alert (type: "stale")
- On provider call: check quota usage → if >80%, create alert (type: "quota_warning")
- All alerts are per-shop, timestamped, and dismissible

**Quality scoring (P2):**
- Compare AI translation with machine translation → compute similarity score
- Track merchant override rate (how often merchants edit before accepting)
- Lower override rate = higher quality score
- Surface in analytics: "AI translation acceptance rate: 87%"

### UX Design

**Dashboard overview (app.analytics):**
- Donut charts: one per locale, showing overall translation coverage percentage
- Color coding: Green (>90%), Yellow (50-90%), Red (<50%)
- Click chart → drill down to per-resource-type breakdown

**Drill-down:**
- Table: Resource Type | Total Fields | Translated | Percentage | Action
- Click resource type → navigate to resource list filtered to untranslated items
- Market toggle: switch between "by locale" and "by market" views

**Stale translations:**
- Dedicated section on analytics page
- Count + list of resources with stale translations
- "Re-translate stale" bulk action → creates focused auto-translate job

**Usage (app.analytics.usage):**
- Bar chart: daily API usage per provider
- Date range picker (7 days, 30 days, 90 days, custom)
- Totals table: Provider | Characters | Requests | Estimated Cost
- Monthly projection based on current usage trend

**Alerts (app.alerts):**
- Badge count in nav item
- Cards sorted by severity → recency
- Each card: icon, message, timestamp, link to affected resource, dismiss button
- Bulk dismiss available

## 3. Glossary & Brand Voice on All Tiers

### Problem

Competitors gate glossary behind $40+/month plans. Merchants on free or basic tiers can't control how their brand name is translated, leading to inconsistent translations ("Nike" becoming "耐克" in Chinese when the merchant wants to keep "Nike") and embarrassing mistranslations of industry-specific terms.

### Technical Approach

**Glossary storage:**
- `GlossaryTerm` model with source/target locale pair, case sensitivity, and "never translate" flag
- Unique constraint: `[shop, sourceLocale, targetLocale, sourceTerm]` prevents duplicates
- Index on `[shop, sourceLocale]` for fast lookup during translation

**Enforcement in auto-translate pipeline:**

```
Pre-translation (before sending to provider):
    1. Load glossary terms for this locale pair
    2. For "never translate" terms: replace with placeholders
       "Check out our Nike Air Max shoes" → "Check out our {{BRAND_0}} {{BRAND_1}} shoes"
    3. For "must translate" terms: note positions for post-processing

Send to translation provider (Google/DeepL/AI)

Post-translation (after receiving translation):
    1. Restore "never translate" placeholders with original terms
       "Découvrez nos {{BRAND_0}} {{BRAND_1}} chaussures" → "Découvrez nos Nike Air Max chaussures"
    2. Find-and-replace for "must translate" terms (case-sensitive if configured)
    3. Validate all glossary rules are satisfied
```

**CSV import:**
- Parse CSV with columns: `source_term, target_term, source_locale, target_locale, case_sensitive, never_translate`
- Validate: required fields present, locales valid, no duplicate keys
- Preview: show parsed rows with validation errors highlighted
- Bulk upsert: use `createMany` with `skipDuplicates` or upsert loop

**AI integration:**
- Glossary terms injected directly into AI system prompt as explicit rules
- AI models follow glossary rules more naturally than post-processing (can understand context)
- Still apply post-processing as validation layer

**Machine translation integration:**
- Google/DeepL don't understand glossary natively (DeepL has a glossary API, but not all language pairs)
- Use pre/post-processing approach for all machine translation providers
- For DeepL: explore native glossary API as optimization (P2)

### UX Design

**Glossary page (app.glossary):**
- Sortable, filterable data table
- Columns: Source Term, Target Term, Source Locale → Target Locale, Case Sensitive, Never Translate, Actions
- Inline add: form row at top of table for quick entry
- Edit: click row → inline edit mode
- Delete: confirm modal

**Import (app.glossary.import):**
- Drag-and-drop file upload zone
- Preview table with validation:
  - Green rows: valid, ready to import
  - Red rows: errors (missing fields, duplicate terms)
  - Error message per row
- "Import N valid terms" button
- Download template CSV button

**Brand protection:**
- "Protected Terms" section at top of glossary page
- Shows all terms with `neverTranslate: true`
- Quick-add shortcut: enter brand name → automatically creates "never translate" entries for all configured locale pairs
- Prominent visual treatment (shield icon, different color)

**Translation editor integration:**
- Source text: glossary-matched terms underlined in blue
- Tooltip on hover: shows required translation or "Never translate" badge
- Target text: if a glossary rule is violated, show yellow warning underline
- Glossary panel: collapsible sidebar showing all active glossary rules for this locale pair

## 4. Third-Party App Content Translation

### Problem

Popular Shopify apps (Judge.me reviews, Pagefly page builder, Klaviyo forms, Yotpo reviews, GemPages) inject content via JavaScript after the initial page load. Translation apps that work through Shopify's Translation API miss this content entirely, leaving storefronts with mixed-language content. A product page might have its title and description translated, but customer reviews below remain in the original language.

### Technical Approach

**Theme extension enhancement:**
- Extend existing `langshop-image-swap` MutationObserver or create companion script in theme extension
- Monitor DOM for new text nodes injected by third-party scripts
- Identify untranslated content by comparing with known translated content or by heuristics

**Content detection strategy:**

```
Page loads → Theme extension initializes
    │
    ▼
MutationObserver watches for DOM changes
    │  Filter: childList and characterData mutations
    │  Ignore: style, attribute-only, and script changes
    ▼
New text node detected
    │
    ├── Check: is it within a configured selector? (e.g., .jdgm-rev__body)
    │   │
    │   ├── YES → collect for translation
    │   └── NO → ignore
    │
    ▼
Batch collected text (debounce: 500ms after last mutation)
    │
    ▼
Send to App Proxy: POST /apps/langshop/translate-content
    │  Body: { texts: [...], locale: "fr", selectors: [...] }
    ▼
Server: translate via provider (use cached translations if available)
    │
    ▼
Return translations → inject into DOM
    │
    ▼
Cache in localStorage: langshop-3p-{page}-{locale}
    │  TTL: 5 minutes
```

**Configuration:**
- Merchant selects which third-party apps/selectors to translate in settings
- Pre-configured selectors for popular apps:
  - Judge.me: `.jdgm-rev__body`, `.jdgm-rev__title`, `.jdgm-question__text`
  - Pagefly: `.pf-content`, `.pf-text`
  - GemPages: `.gp-text`, `.gp-heading`
  - Yotpo: `.yotpo-review-content`, `.yotpo-question-content`
- Custom selector input for any other app
- Enable/disable toggle per app

**Caching:**
- Translated content cached in localStorage per page URL + locale
- TTL: 5 minutes (same as image swap cache)
- Cache key: `langshop-3p-{pagePathHash}-{locale}`
- On cache hit: apply translations immediately (no network request)

**Limitations (documented clearly to merchant):**
- Shadow DOM: content inside shadow DOM roots cannot be accessed
- Iframes: cross-origin iframes cannot be read or modified
- Canvas/SVG text: cannot be translated
- Dynamic content that changes frequently (live chat, real-time feeds) may flash between languages
- Rate limits: high-traffic pages with many third-party injections may hit App Proxy rate limits

### UX Design

**Settings integration:**
- "Third-Party Content" section in Settings or dedicated sub-page
- Toggle per supported app (Judge.me, Pagefly, GemPages, Yotpo)
- Custom selector input: "Add custom selector" with CSS selector syntax
- Test button: "Preview" → shows what content would be detected on a sample page URL

**Auto-detect:**
- Theme extension reports detected third-party apps back to admin dashboard
- Dashboard shows: "We detected Judge.me reviews on your product pages. Enable translation?"
- One-click enable from detection notification

**Coverage indicator:**
- Analytics page shows third-party content section
- "3rd-party content detected on X pages"
- "Y% of detected content is translated"
- Breakdown by app/selector

**Limitations communication:**
- Settings page includes "Supported Apps" section with clear compatibility notes
- "Works with: Judge.me, Pagefly, GemPages, Yotpo"
- "Limited support: Apps using shadow DOM or iframes"
- "Not supported: Live chat widgets, embedded iframes from other domains"
- Tooltip explanations for why certain apps can't be supported

---

**See also:** [API Design](api-design.md) for provider interface · [Data Model](data-model.md) for models per differentiator · [Features](features.md) for feature IDs
