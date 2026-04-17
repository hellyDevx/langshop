// Provider config for instantiation
export interface ProviderConfig {
  apiKey: string;
  projectId?: string;
}

// Provider interface (all providers must implement)
export interface TranslationProvider {
  translate(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]>;
  validateApiKey(): Promise<boolean>;
  getSupportedLanguages(): Promise<Language[]>;
}

// Language option
export interface Language {
  label: string;
  value: string;
}

// AI provider extended request (Phase 4, define interface now)
export interface AITranslationContext {
  resourceType?: string;
  category?: string;
  tags?: string[];
  collection?: string;
}

export interface BrandVoice {
  tone: string;
  style: string;
  instructions: string;
}

export interface GlossaryRule {
  sourceTerm: string;
  targetTerm: string;
  caseSensitive: boolean;
  neverTranslate: boolean;
}
