export interface ThirdPartyPresets {
  judgeme?: boolean;
  pagefly?: boolean;
  gempages?: boolean;
  yotpo?: boolean;
}

export interface ThirdPartyConfigShape {
  presets: ThirdPartyPresets;
  customSelectors: string[];
}

export const DEFAULT_THIRD_PARTY_CONFIG: ThirdPartyConfigShape = {
  presets: { judgeme: false, pagefly: false, gempages: false, yotpo: false },
  customSelectors: [],
};

export const THIRD_PARTY_SELECTOR_MAP: Record<string, string[]> = {
  judgeme: [".jdgm-rev-widg", ".jdgm-prev-badge", ".jdgm-all-reviews"],
  pagefly: ["[data-pf-type]", ".pf-text"],
  gempages: ["[data-gp-block]"],
  yotpo: [".yotpo-review", "[data-yotpo]"],
};
