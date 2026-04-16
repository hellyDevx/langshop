# UX Flows

## 1. Navigation Structure

Polaris `NavMenu` items with logical grouping:

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

**Nav items in order:**
1. Dashboard — overview stats, quick actions
2. Resources — browse and translate content
3. Markets — market-level translation management
4. Images — image swap management
5. Auto-Translate — job creation and monitoring
6. Glossary — terminology management
7. Analytics — coverage and usage dashboards
8. Alerts — notification center (with badge count)
9. Settings — provider config, brand voice

## 2. Flow 1: Onboarding (New Install)

**Entry:** First visit after app install → redirect to `app.onboarding`

### Step 1: Welcome

- Detect primary locale from Shopify
- Display published locales and configured markets
- Show store product count and estimated translation scope
- **CTA:** "Let's set up your translations"

### Step 2: Select Target Languages

- Pre-select languages based on market configuration
- Show market → language mapping
- Allow deselection of languages merchant doesn't want to translate
- Show estimated translation volume per language
- **CTA:** "Next: Choose Translation Provider"

### Step 3: Choose Translation Provider

- Card layout showing available providers:
  - **Google Translate** — Free tier available, 128 languages
  - **DeepL** — Higher quality, 30+ languages
  - **AI (Claude/OpenAI)** — Context-aware, brand voice support (requires API key)
- If merchant already has API keys configured, show them as ready
- API key input fields for each provider
- **CTA:** "Next: Brand Voice (Optional)" / "Skip"

### Step 4: Brand Voice (Optional)

- Tone selector: Professional, Casual, Playful, Formal, Friendly
- Style selector: Concise, Descriptive, Technical, Conversational
- Free-text instructions box: "Tell the AI about your brand..."
- Brand name protection: add terms that should never be translated
- **CTA:** "Next: Initial Translation" / "Skip"

### Step 5: Initial Auto-Translate (Optional)

- Recommend translating priority resources first (products, then collections, then pages)
- Show estimated time and cost per provider
- Checkbox to select which resource types to include
- **CTA:** "Start Translating" / "Skip to Dashboard"

### Step 6: Dashboard

- Redirect to `app._index` with a success banner: "Setup complete! Translation is in progress."
- If initial translate was started, show job progress

**Design:** Polaris wizard pattern — progress bar at top, back/next buttons, "Skip" on optional steps (4, 5). Each step saves to `OnboardingState` so merchants can resume if they leave.

## 3. Flow 2: Manual Translation

### Entry → Resource Selection

1. **Dashboard** → click resource type card or nav item "Resources"
2. **Resource list** (`app.resources.$type._index`) — paginated table of resources
   - Columns: Name/Title, Status Badge (Translated/Partial/Not Translated), Last Updated
   - Filter: by status (all, translated, untranslated, partial)
   - Search: by name/title
   - Pagination: cursor-based, 25 per page

### Translation Editor

3. Click resource → **Translation editor** (`app.resources.$type.$id`)
4. **Layout:** Side-by-side two-column
   - **Left column (read-only):** Source content in primary locale
   - **Right column (editable):** Target translation
5. **Top bar:**
   - Locale selector dropdown (target language)
   - Market selector dropdown (if multiple markets for this locale)
   - Status badge for current locale
6. **Fields:** Each translatable field shown as a labeled text input or textarea
   - Short fields (title, handle): `TextField`
   - Long fields (description, body_html): `TextField` with `multiline`
   - Glossary-matched terms highlighted with blue underline in source, tooltip shows target term
7. **Nested resources:** Product options, variants, metafields shown as expandable `Collapsible` sections below main fields
8. **Save:** Explicit "Save" button → calls `translationsRegister` → green toast "Translation saved"
9. **Error:** Red `Banner` with specific field + error message
10. **Auto-save drafts:** (P2) Save to localStorage as merchant types, restore on page reload

## 4. Flow 3: Bulk Translation

### Selection

1. **Resource list** → checkbox to select individual resources
2. "Select all" checkbox in header (selects current page)
3. If all selected → banner: "All 25 resources on this page selected. Select all 342 resources?"

### Bulk Action

4. Bulk action bar appears: **"Auto-translate selected"** button
5. **Modal** opens:
   - Provider selector (Google/DeepL/AI)
   - Target locale(s) — multi-select
   - Market scope (optional)
   - "Apply glossary rules" checkbox (if glossary has terms for this locale pair)
   - Estimated translation count and cost
6. **Confirm** → creates `TranslationJob`
7. **Redirect** to job detail page (`app.auto-translate.$jobId`)

### Job Progress

8. **Job detail:** Progress bar, per-resource status table
   - Status column: ✅ Success / ❌ Failed / ⏳ Pending
   - Expandable error details for failed entries
   - "Retry Failed" button for entries that can be retried
   - Real-time updates via SSE (or polling fallback)

## 5. Flow 4: Auto-Translate Job Management

### Job Creation

1. **Auto-Translate page** (`app.auto-translate`) → "New Job" button
2. **Form:**
   - Resource type selector
   - Target locale(s) — multi-select
   - Market scope (optional, dropdown)
   - Provider selector
   - "Apply glossary" toggle
   - "Translate only untranslated" toggle (default: on)
3. **Submit** → create job → redirect to job detail

### Job List

4. **Table:** Sortable by status, created date, provider
   - Columns: Status Badge, Resource Type, Target Locale, Provider, Progress (N/M), Created, Actions
   - Status: Pending (gray), Running (blue, animated), Completed (green), Failed (red), Partially Failed (yellow)
   - Actions: View Detail, Retry Failed, Cancel (if running)

### Job Detail

5. **Header:** Job metadata (type, locale, provider, timestamps)
6. **Progress bar:** `completedItems / totalItems` with percentage
7. **Entry table:** Per-field status (filterable by status)
8. **Error log:** Expandable section showing failed entries with error messages
9. **Real-time:** SSE connection for live progress updates

## 6. Flow 5: Image Management

### Image Gallery

1. **Images page** (`app.images._index`) → product grid with thumbnails
   - Each card: product image, product title, locale badge count
   - Filter by: has image swaps, no image swaps
   - Search by product title

### Image Editor

2. Click product → **Image editor** (`app.images.$resourceId`)
3. **Layout:** Product images in a grid
4. For each image:
   - Original image thumbnail
   - Locale dropdown → select target locale
   - Upload zone: drag-and-drop or file picker for replacement image
   - Preview: show original and replacement side by side
   - Save / Remove buttons
5. **Market scope:** If markets are configured, show market selector alongside locale
6. **Locale toggle:** Quick-switch between locales to preview all image swaps for this product

### Bulk Image (P2)

7. Select multiple images → "Assign replacement" → upload one image for all selected
8. Select multiple locales → apply same replacement across locales

## 7. Flow 6: Glossary Management

### Term List

1. **Glossary page** (`app.glossary`) → data table of terms
   - Columns: Source Term, Target Term, Locale Pair, Case Sensitive, Never Translate, Actions
   - Filter by locale pair (dropdown)
   - Search by term
   - Pagination: cursor-based

### Add Term

2. "Add Term" button → inline form or modal:
   - Source locale + Target locale (dropdowns)
   - Source term (text input)
   - Target term (text input, disabled if "Never Translate" is on)
   - Case sensitive toggle
   - Never translate toggle (for brand names)
3. Save → validates uniqueness → adds to table

### Import CSV

4. "Import" button → navigates to `app.glossary.import`
5. **Upload:** Drag-and-drop zone for CSV file
6. **Preview:** Table showing parsed rows with validation:
   - Green rows: valid, ready to import
   - Red rows: validation errors (duplicate, missing fields)
   - Error message per row
7. **Confirm:** "Import N valid terms" button → bulk upsert
8. **Result:** Success banner with count, redirect to glossary list

### Export CSV

9. "Export" button → downloads CSV file with all terms (or filtered subset)
10. CSV columns: `source_term,target_term,source_locale,target_locale,case_sensitive,never_translate`

### Brand Protection

11. "Protected Terms" section at top of glossary page
12. Shows all terms with `neverTranslate: true`
13. Quick-add: just enter the brand name, it creates entries for all configured locale pairs

### Enforcement Indicator

14. In translation editor: glossary-matched terms in source text get blue underline
15. Tooltip on hover shows the required translation
16. If a glossary term is violated in the translation, show yellow warning

## 8. Flow 7: Analytics Dashboard

### Coverage Overview

1. **Analytics page** (`app.analytics`) → coverage overview
2. **Donut charts:** One per locale showing overall translation percentage
3. **Coverage table:** Rows = resource types, columns = locales, cells = percentage with color coding
   - Green (>90%), Yellow (50-90%), Red (<50%), Gray (no resources)
4. **Market dimension:** Toggle to view coverage per market instead of per locale

### Drill-Down

5. Click locale in donut chart → filtered view showing per-resource-type breakdown
6. Click resource type → navigate to resource list filtered to untranslated items

### Stale Translations

7. **Stale section:** Banner showing count of potentially stale translations
8. "View stale translations" → list of resources where source changed but translation didn't
9. Bulk action: "Re-translate stale" → creates auto-translate job for stale items only

### Usage

10. "Usage" tab → navigates to `app.analytics.usage`
11. **Bar chart:** API calls per provider per day (filterable by date range)
12. **Totals table:** Per-provider totals (characters, requests, estimated cost)
13. **Date picker:** Select date range for chart and totals
14. **Cost estimate:** Based on provider pricing (Google: $20/M chars, DeepL: $25/M chars, etc.)

## 9. Flow 8: Alert Management

### Alert Center

1. **Alerts page** (`app.alerts`) — nav item shows badge with active count
2. **Alert cards:** Sorted by severity (critical first), then recency
   - **Critical (red):** Job failures, provider errors
   - **Warning (yellow):** Stale translations, quota approaching limit
   - **Info (blue):** Job completed, sync detected changes
3. Each card shows:
   - Alert type icon
   - Message text
   - Timestamp
   - Link to affected resource/job (if applicable)
   - "Dismiss" button

### Bulk Actions

4. "Dismiss All" button → confirm modal → dismiss all active alerts
5. Filter by type (dropdown): All, Failures, Stale, Quota, Job

### Nav Badge

6. Nav item "Alerts" shows badge count of undismissed alerts
7. Badge updates on page load (loader fetches `getActiveAlertCount`)

## 10. Empty States

Every page has a Polaris `EmptyState` for when there's no data to show:

| Page | Heading | Description | CTA |
|------|---------|-------------|-----|
| Resource list | "No {type} found" | "Your store doesn't have any {type} yet, or they aren't translatable." | — |
| Translation editor | "No translations yet" | "Get started by translating your first fields." | — |
| Glossary | "No glossary terms" | "Add glossary terms to ensure consistent translations across all your content." | "Add your first term" |
| Alerts | "All clear!" | "No translation issues detected. We'll notify you if anything needs attention." | — |
| Auto-translate jobs | "No translation jobs" | "Create your first auto-translate job to translate content in bulk." | "Create job" |
| Analytics | "No translation data" | "Translation analytics will appear here once you start translating content." | "Go to Resources" |
| Images | "No image swaps" | "Upload locale-specific images to show the right visuals for each market." | "Set up image swaps" |

## 11. Loading States

Skeleton loading patterns for each page type:

| Page Type | Skeleton Pattern |
|-----------|-----------------|
| Dashboard | `SkeletonPage` with 4 `SkeletonBodyText` stat cards in a grid |
| Resource list | `SkeletonPage` + `SkeletonDisplayText` (title) + 5x `SkeletonBodyText` rows |
| Translation editor | Two-column layout: left `SkeletonBodyText` (3 fields) + right `SkeletonBodyText` (3 fields) |
| Job detail | `SkeletonDisplayText` (header) + `SkeletonBodyText` (progress bar) + 5x row skeletons |
| Analytics | `SkeletonPage` + placeholder circles (donut charts) + `SkeletonBodyText` table |
| Settings form | `SkeletonPage` + 3x `SkeletonBodyText` (form fields) |

**Pattern:** Every page renders its skeleton immediately and replaces it when data loads. No blank screens, no spinners without structure.

---

**See also:** [Features](features.md) for feature IDs referenced in flows · [API Design](api-design.md) for route-to-flow mapping
