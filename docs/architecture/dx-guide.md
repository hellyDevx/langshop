# Developer Experience Guide

## 1. Folder Structure (V1 Target)

```
app/
├── routes/                            # Remix routes (thin controllers)
│   ├── app.jsx                        # App layout with NavMenu
│   ├── app._index.tsx                 # Dashboard
│   ├── app.onboarding.tsx             # Guided setup wizard
│   ├── app.resources.$type._index.tsx # Resource list
│   ├── app.resources.$type.$id.tsx    # Translation editor
│   ├── app.auto-translate.tsx         # Job management
│   ├── app.auto-translate.$jobId.tsx  # Job detail
│   ├── app.markets.tsx               # Markets overview
│   ├── app.markets.$marketId.tsx      # Market detail
│   ├── app.images._index.tsx          # Image gallery
│   ├── app.images.$resourceId.tsx     # Image editor
│   ├── app.glossary.tsx               # Glossary management
│   ├── app.glossary.import.tsx        # CSV import
│   ├── app.analytics.tsx              # Translation analytics
│   ├── app.analytics.usage.tsx        # Usage tracking
│   ├── app.settings.tsx               # Provider config
│   ├── app.settings.brand-voice.tsx   # Brand voice config
│   ├── app.alerts.tsx                 # Alert center
│   ├── api.image-gallery.tsx          # Public API (App Proxy)
│   ├── api.translation-status.tsx     # SSE for job progress
│   ├── auth.$.tsx                     # Auth callback
│   ├── auth.login/route.tsx           # Login page
│   ├── webhooks.app.uninstalled.tsx   # Uninstall cleanup
│   ├── webhooks.app.scopes_update.tsx # Scope update
│   ├── webhooks.products.update.tsx   # Auto-sync trigger
│   └── webhooks.collections.update.tsx # Auto-sync trigger
├── services/                          # Business logic (all .server.ts)
│   ├── translation.server.ts
│   ├── translatable-resources.server.ts
│   ├── markets.server.ts
│   ├── auto-translate.server.ts
│   ├── image-translation.server.ts
│   ├── glossary.server.ts
│   ├── brand-voice.server.ts
│   ├── analytics.server.ts
│   ├── alerts.server.ts
│   ├── content-sync.server.ts
│   └── providers/
│       ├── provider-interface.server.ts  # Factory + shared interface
│       ├── google.server.ts              # Google Translate adapter
│       ├── deepl.server.ts               # DeepL adapter
│       └── ai-provider.server.ts         # Claude/OpenAI adapter
├── graphql/                           # GraphQL query/mutation definitions
│   ├── queries/
│   │   ├── markets.ts
│   │   ├── shopLocales.ts
│   │   ├── translatableResource.ts
│   │   ├── translatableResources.ts
│   │   ├── translatableResourcesWithTranslations.ts
│   │   └── nestedTranslatableResources.ts
│   └── mutations/
│       ├── translationsRegister.ts
│       └── translationsRemove.ts
├── components/                        # Reusable React components
│   ├── TranslationEditor.tsx          # Side-by-side editor (extracted from route)
│   ├── ResourceList.tsx               # Generic resource list table
│   ├── StatusBadge.tsx                # Translation status badge
│   ├── LocaleSelector.tsx             # Locale dropdown
│   └── MarketSelector.tsx             # Market dropdown
├── utils/                             # Pure utility functions
│   ├── locale-utils.ts                # Locale display names, formatting
│   ├── resource-type-map.ts           # Resource type configuration
│   └── content-hash.ts               # SHA-256 for content diffing
├── types/                             # TypeScript type definitions
│   ├── shopify.ts                     # Shopify GraphQL response types
│   ├── translation.ts                 # Translation domain types
│   └── provider.ts                    # Provider interface types
├── hooks/                             # React hooks
│   ├── useTranslation.ts             # Translation state management
│   └── useJobProgress.ts             # SSE-based job progress
├── shopify.server.ts                  # Shopify app config
├── db.server.ts                       # Prisma client
└── root.tsx                           # Root layout

extensions/
├── langshop-image-swap/               # Image swap theme extension
└── langshop-switcher/                 # Language switcher theme extension

prisma/
├── schema.prisma                      # Database schema
└── migrations/                        # Migration history

docs/
└── architecture/                      # This documentation
```

## 2. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| **Files (general)** | kebab-case | `auto-translate.server.ts` |
| **Route files** | dot-notation (Remix convention) | `app.resources.$type._index.tsx` |
| **Components** | PascalCase | `TranslationEditor.tsx` |
| **Functions** | camelCase | `fetchTranslatableResources()` |
| **Types/Interfaces** | PascalCase, descriptive | `TranslatableResource`, `TranslationJobStatus` |
| **GraphQL queries** | PascalCase query name | `TranslatableResources` |
| **GraphQL exports** | SCREAMING_SNAKE_CASE | `TRANSLATABLE_RESOURCES_QUERY` |
| **Database fields** | camelCase (Prisma convention) | `sourceLocale`, `createdAt` |
| **CSS classes** | kebab-case with `langshop-` prefix | `langshop-image-swap`, `langshop-switcher` |
| **Environment variables** | SCREAMING_SNAKE_CASE | `SHOPIFY_API_KEY` |

## 3. Code Conventions

### Routes Are Thin Controllers

Routes handle: authentication, request parsing, calling services, formatting responses.

```typescript
// ✅ Correct: route calls service
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const resources = await fetchTranslatableResources(admin, "PRODUCT", "fr", cursor);
  return json({ resources });
}

// ❌ Wrong: route contains business logic
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(QUERY, { variables });
  const data = response.data.translatableResources.edges.map(/* transform logic */);
  // ... more business logic
}
```

### Services Contain ALL Business Logic

Services own: data fetching, transformation, validation, provider orchestration, caching.

```typescript
// ✅ Correct: service encapsulates logic
export async function fetchTranslatableResources(admin, type, locale, cursor) {
  const response = await admin.graphql(TRANSLATABLE_RESOURCES_QUERY, {
    variables: { resourceType: type, first: 25, after: cursor }
  });
  // Transform, validate, return typed result
}

// ❌ Wrong: service imports from route
import { something } from "../routes/app._index";
```

### Import Direction

```
Routes → Services → GraphQL definitions
Routes → Services → Database (Prisma)
Routes → Services → Providers
Routes → Components (UI only)
Routes → Hooks
Components → Hooks
Utils ← (imported by anyone, imports nothing from app)
Types ← (imported by anyone, imports nothing from app)
```

Services never import from routes. Routes never import from GraphQL or Prisma directly.

### TypeScript Rules

- No `any` type — use explicit types or `unknown` with type guards
- All service function parameters and return types explicitly typed
- GraphQL responses typed in `app/types/shopify.ts`
- Prefer `interface` for object shapes, `type` for unions and intersections
- Use `as const` for string literal arrays (e.g., status values)

### Error Handling

- Services throw typed errors → routes catch and format for UI
- Shopify API errors: check `userErrors` array in GraphQL responses
- Provider errors: catch, log to DB, create alert, continue processing
- Never swallow errors silently — every error path produces a merchant-visible result

### Async/Await

- Use `async/await` everywhere — no raw `.then()` chains or callbacks
- Parallel operations: `Promise.all()` or `Promise.allSettled()` where appropriate
- Sequential operations: simple `await` in sequence

## 4. Component Extraction Rules

### When to Extract

Extract a component from a route when:
1. It's used in **2+ routes**, OR
2. It exceeds **100 lines of JSX** in a single route

### Component Rules

- Components live in `app/components/`
- Components are **pure UI** — props in, events out
- No data fetching inside components — data comes from route loaders via props
- No direct Prisma or GraphQL imports
- Use Polaris components as building blocks; compose into app-specific components

### Extraction Candidates (Current Codebase)

| Component | Extract From | Used In | Reason |
|-----------|-------------|---------|--------|
| `TranslationEditor` | `app.resources.$type.$id.jsx` (606 lines) | Translation editor, bulk edit | >100 lines |
| `ResourceList` | `app.resources.$type._index.jsx` | Resource list, market detail | 2+ routes |
| `StatusBadge` | Multiple routes | Resource list, job list, dashboard | 2+ routes |
| `LocaleSelector` | Multiple routes | Editor, auto-translate, analytics | 2+ routes |
| `MarketSelector` | Multiple routes | Editor, auto-translate, market detail | 2+ routes |

## 5. Testing Strategy

### Unit Tests: Services and Utils

Test business logic in isolation. Mock external dependencies (Shopify API, Prisma).

```typescript
// glossary.server.test.ts
describe("applyGlossary", () => {
  it("wraps never-translate terms in placeholders", () => {
    const text = "Check out Nike Air Max";
    const terms = [{ sourceTerm: "Nike", neverTranslate: true }, { sourceTerm: "Air Max", neverTranslate: true }];
    const result = applyGlossary(text, terms, "pre");
    expect(result).toBe("Check out {{BRAND_0}} {{BRAND_1}}");
  });
});
```

### Integration Tests: Routes

Test loader/action with mocked Shopify admin API. Verify correct service calls and response shapes.

```typescript
// app.glossary.test.ts
describe("glossary route", () => {
  it("loader returns paginated terms", async () => {
    const response = await loader({ request: mockRequest(), params: {} });
    const data = await response.json();
    expect(data.terms).toHaveLength(25);
    expect(data.pageInfo.hasNextPage).toBe(true);
  });
});
```

### E2E Tests

Manual testing on a development store for V1. No automated E2E framework yet.

**Test checklist for each feature:**
- Happy path works
- Empty state renders correctly
- Error state shows actionable message
- Pagination works (forward and backward)
- Loading skeleton appears before data loads

### Test File Naming

Test files live alongside their source: `{module}.test.ts`

```
services/glossary.server.ts
services/glossary.server.test.ts
utils/content-hash.ts
utils/content-hash.test.ts
```

### Framework

Vitest (included in Remix template). Configuration in `vitest.config.ts`.

## 6. Local Development Setup

### Prerequisites

- Node.js 20.19+
- pnpm (package manager)
- Shopify CLI (`npm install -g @shopify/cli`)
- A Shopify Partner account with a development store

### Setup Steps

```bash
# 1. Clone the repository
git clone <repo-url>
cd langshop

# 2. Install dependencies
pnpm install

# 3. Run database migrations
pnpm prisma migrate dev

# 4. Start the development server
pnpm dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHOPIFY_API_KEY` | Yes | App API key from Shopify Partners |
| `SHOPIFY_API_SECRET` | Yes | App API secret from Shopify Partners |
| `SCOPES` | Yes | OAuth scopes (e.g., `read_translations,write_translations,read_products,...`) |

These are configured in `shopify.app.toml` and `.env` (for local development).

### Development Store

Configure in `shopify.app.toml`:
```toml
[app]
name = "LangShop"

[auth]
redirect_urls = ["https://{host}/auth/callback"]
```

Run `shopify app dev` to connect to your development store with ngrok tunnel.

### Database

- Development: SQLite at `prisma/dev.sqlite`
- Production target: PostgreSQL (connection string via `DATABASE_URL`)
- View database: `pnpm prisma studio` opens a visual editor at `localhost:5555`

## 7. Extension Points

### Adding a New Translation Provider

1. Create `app/services/providers/{name}.server.ts`
2. Implement the `TranslationProvider` interface:
   ```typescript
   export interface TranslationProvider {
     translate(texts: string[], sourceLang: string, targetLang: string): Promise<string[]>;
     validateApiKey(apiKey: string): Promise<boolean>;
     getSupportedLanguages(): Promise<Language[]>;
   }
   ```
3. Add to factory in `provider-interface.server.ts`:
   ```typescript
   case "new-provider":
     return new NewProvider(apiKey);
   ```
4. Add provider option to UI dropdown in `app.settings.tsx` and `app.auto-translate.tsx`

### Adding a New Resource Type

1. Add entry to `app/utils/resource-type-map.ts`:
   ```typescript
   PRODUCT_OPTION: {
     type: "PRODUCT_OPTION",
     displayName: "Product Options",
     description: "Product option names like Size, Color",
     icon: "...",
   }
   ```
2. No other code changes needed — the generic resource handler supports all Shopify `TranslatableResourceType` values

### Adding a New Webhook

1. Create route file: `app/routes/webhooks.{topic}.tsx`
2. Implement handler:
   ```typescript
   import { authenticate } from "../shopify.server";
   export async function action({ request }: ActionFunctionArgs) {
     const { topic, payload, shop } = await authenticate.webhook(request);
     // Handle webhook
     return new Response(null, { status: 200 });
   }
   ```
3. Register in `shopify.app.toml`:
   ```toml
   [[webhooks.subscriptions]]
   topics = ["topic/name"]
   uri = "/webhooks/topic/name"
   ```

### Adding a New Analytics Metric

1. Add calculation function to `app/services/analytics.server.ts`
2. Add to loader in `app/routes/app.analytics.tsx`
3. Add UI component in the analytics page

---

**See also:** [Architecture](architecture.md) for layer responsibilities · [Execution Plan](execution-plan.md) for migration order
