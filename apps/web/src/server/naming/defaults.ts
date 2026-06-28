// Re-export of the pure per-content-type naming defaults now living in
// `@bookkeeprr/logic`. The media `ContentType` union is sourced from
// `@bookkeeprr/types` in web code; the defaults map is keyed by the same union
// (inlined identically in the logic package).
export {
  NAMING_KEYS,
  NAMING_DEFAULTS,
  NAMING_KEYS_BY_TYPE,
  NAMING_DEFAULTS_BY_TYPE,
  type NamingKey,
} from '@bookkeeprr/logic';
