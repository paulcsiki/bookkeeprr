import { z } from 'zod';
import { defineSetting } from '../settings';

export const malClientIdSetting = defineSetting('mal.client_id', z.string(), '');

export function isMalConfigured(clientId: string): boolean {
  return clientId.length > 0;
}
