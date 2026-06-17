export interface Product {
  id: string
  name: string
  bg_color: string
  features: string[]
  image_urls: string[]
  created_at: string
}

export interface LearnedPattern {
  id: string
  headline_pattern: string
  trust_factors: string
  layout_order: string
  copy_tone: string
  differentiation: string
  created_at: string
}

export interface GenerateResult {
  headline: string
  intro: string
  features: string[]
  ingredients: string
  storage: string
  cta: string
  htmlFull: string
}
