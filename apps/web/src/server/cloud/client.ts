import type { JWK } from 'jose';
import { signTenantJWT, signRegistrationJWT } from './jwt';

export interface RegisterArgs {
  fqdn: string;
  installUuid: string;
  acceptedEulaVersion: string;
  acceptedPrivacyVersion: string;
}

export interface RegisterResult {
  tenantId: string;
  jwkKid: string;
}

export interface ExchangeResult {
  accessToken: string;
  expiresAt: string;
}

export interface PushArgs {
  accessToken: string;
  deviceTokens: string[];
  payload: {
    title: string;
    body: string;
    deepLink?: string;
    data?: Record<string, string>;
  };
}

export interface PushResultRow {
  deviceToken: string;
  status: string;
  messageId?: string;
  error?: string;
}

export interface DeleteResult {
  deletedAt: string;
  devicesRemoved: number;
}

export interface TermsResult {
  eulaVersion: string;
  eulaUrl: string;
  privacyVersion: string;
  privacyUrl: string;
  effectiveAt: string;
}

async function postJSON<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

interface RegisterResponseBody {
  tenant_id: string;
  jwk_kid: string;
}

interface ExchangeResponseBody {
  access_token: string;
  expires_at: string;
}

interface DeleteResponseBody {
  deleted_at: string;
  devices_removed: number;
}

interface TermsResponseBody {
  eula_version: string;
  eula_url: string;
  privacy_version: string;
  privacy_url: string;
  effective_at: string;
}

export class CloudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly configDir: string,
  ) {}

  async register(args: RegisterArgs): Promise<RegisterResult> {
    const jwt = await signRegistrationJWT(this.configDir, {
      iss: args.fqdn,
      sub: args.installUuid,
    });
    const body = await postJSON<RegisterResponseBody>(
      `${this.baseUrl}/v1/tenants/register`,
      {
        accepted_eula_version: args.acceptedEulaVersion,
        accepted_privacy_version: args.acceptedPrivacyVersion,
        accepted_at: new Date().toISOString(),
      },
      { Authorization: `Bearer ${jwt}` },
    );
    return { tenantId: body.tenant_id, jwkKid: body.jwk_kid };
  }

  async exchange(args: { fqdn: string; installUuid: string }): Promise<ExchangeResult> {
    const jwt = await signTenantJWT(this.configDir, {
      iss: args.fqdn,
      sub: args.installUuid,
    });
    const body = await postJSON<ExchangeResponseBody>(
      `${this.baseUrl}/v1/auth/exchange`,
      {},
      { Authorization: `Bearer ${jwt}` },
    );
    return { accessToken: body.access_token, expiresAt: body.expires_at };
  }

  async registerDevice(args: {
    tenantId: string;
    accessToken: string;
    deviceToken: string;
    platform: 'ios' | 'android';
  }): Promise<{ deviceId: string }> {
    const body = await postJSON<{ device_id: string }>(
      `${this.baseUrl}/v1/tenants/${args.tenantId}/devices`,
      { device_token: args.deviceToken, platform: args.platform },
      { Authorization: `Bearer ${args.accessToken}` },
    );
    return { deviceId: body.device_id };
  }

  async unregisterDevice(args: {
    tenantId: string;
    accessToken: string;
    deviceToken: string;
  }): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/v1/tenants/${args.tenantId}/devices/${encodeURIComponent(args.deviceToken)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${args.accessToken}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`unregister device: HTTP ${res.status}`);
    }
  }

  async push(args: PushArgs): Promise<{ results: PushResultRow[] }> {
    interface PushResponseBody {
      results: Array<{
        device_token: string;
        status: string;
        message_id?: string;
        error?: string;
      }>;
    }
    const body = await postJSON<PushResponseBody>(
      `${this.baseUrl}/v1/push`,
      {
        device_tokens: args.deviceTokens,
        payload: {
          title: args.payload.title,
          body: args.payload.body,
          deep_link: args.payload.deepLink ?? '',
          data: args.payload.data ?? {},
        },
      },
      { Authorization: `Bearer ${args.accessToken}` },
    );
    return {
      results: body.results.map((r) => ({
        deviceToken: r.device_token,
        status: r.status,
        messageId: r.message_id,
        error: r.error,
      })),
    };
  }

  /**
   * Rotate the tenant's signing key. The caller must sign the bearer JWT with
   * the OLD private key (since the cloud still has the OLD public_jwk on
   * record); the body advertises the NEW public_jwk that should replace it.
   *
   * Returns the new kid that the cloud has stored for the tenant.
   */
  async rotateKey(args: {
    tenantId: string;
    oldKeyJwt: string;
    newPublicJwk: JWK;
  }): Promise<{ kid: string }> {
    const res = await fetch(`${this.baseUrl}/v1/tenants/${args.tenantId}/key`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${args.oldKeyJwt}`,
      },
      body: JSON.stringify({ public_jwk: args.newPublicJwk }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`rotate key: HTTP ${res.status}: ${text}`);
    }
    const body = (await res.json()) as { kid: string };
    return { kid: body.kid };
  }

  async delete(args: {
    fqdn: string;
    installUuid: string;
    tenantId: string;
  }): Promise<DeleteResult> {
    const jwt = await signTenantJWT(this.configDir, {
      iss: args.fqdn,
      sub: args.installUuid,
    });
    const res = await fetch(`${this.baseUrl}/v1/tenants/${args.tenantId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) throw new Error(`delete tenant: HTTP ${res.status}`);
    const body = (await res.json()) as DeleteResponseBody;
    return { deletedAt: body.deleted_at, devicesRemoved: body.devices_removed };
  }

  async getTerms(): Promise<TermsResult> {
    const res = await fetch(`${this.baseUrl}/v1/terms`);
    if (!res.ok) throw new Error(`get terms: HTTP ${res.status}`);
    const body = (await res.json()) as TermsResponseBody;
    return {
      eulaVersion: body.eula_version,
      eulaUrl: body.eula_url,
      privacyVersion: body.privacy_version,
      privacyUrl: body.privacy_url,
      effectiveAt: body.effective_at,
    };
  }

  async getTermsDoc(kind: 'eula' | 'privacy', version: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/terms/${kind}/${version}`);
    if (!res.ok) throw new Error(`get terms doc: HTTP ${res.status}`);
    return res.text();
  }
}
