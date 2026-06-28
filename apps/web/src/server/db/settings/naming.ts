import { z } from 'zod';
import { defineSetting, type SettingAccessor } from '../settings';
import type { ContentType } from '@/server/content-type';
import {
  NAMING_KEYS_BY_TYPE,
  NAMING_DEFAULTS_BY_TYPE,
  NAMING_KEYS,
  NAMING_DEFAULTS,
  type NamingKey,
} from '@/server/naming/defaults';

export {
  NAMING_KEYS_BY_TYPE,
  NAMING_DEFAULTS_BY_TYPE,
  NAMING_KEYS,
  NAMING_DEFAULTS,
  type NamingKey,
};

export function namingSetting(contentType: ContentType, key: NamingKey): SettingAccessor<string> {
  return defineSetting(
    `naming.${contentType}.${key}`,
    z.string(),
    NAMING_DEFAULTS_BY_TYPE[contentType][key],
  );
}

export async function getAllNamingTemplates(
  contentType: ContentType,
): Promise<Record<NamingKey, string>> {
  const result = {} as Record<NamingKey, string>;
  for (const key of NAMING_KEYS_BY_TYPE[contentType]) {
    result[key] = await namingSetting(contentType, key).get();
  }
  return result;
}

export async function setAllNamingTemplates(
  contentType: ContentType,
  values: Partial<Record<NamingKey, string>>,
): Promise<void> {
  for (const key of NAMING_KEYS_BY_TYPE[contentType]) {
    const v = values[key];
    if (typeof v === 'string') {
      await namingSetting(contentType, key).set(v);
    }
  }
}
