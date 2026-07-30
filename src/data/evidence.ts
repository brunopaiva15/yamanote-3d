/** Niveau de confiance attaché aux données opérationnelles susceptibles d'évoluer. */
export type DataConfidence = 'confirmed' | 'high' | 'estimated' | 'unverified';

/** Valeur runtime accompagnée de sa provenance, sans imposer ce wrapper aux consommateurs. */
export interface SourcedValue<T> {
  value: T;
  confidence: DataConfidence;
  checkedAt?: string;
  sourceNote?: string;
}
