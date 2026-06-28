import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedDb, type SeedHandle } from '../helpers/seed';
import { expectShape } from '../../helpers/assert-spec';
import { ErrorResponse } from '@/server/openapi/schemas/common';
import { NamingGetResponse, SettingsOkResponse } from '@/server/openapi/schemas/settings';
import { NAMING_DEFAULTS, namingSetting } from '@/server/db/settings/naming';
import { GET, PUT } from '@/app/api/settings/naming/route';
import { insertUser } from '@/server/db/users';
import { createSession } from '@/server/db/sessions';
import { hashPassword } from '@/server/auth/password';

let h: SeedHandle;
beforeEach(async () => {
  h = await seedDb();
});
afterEach(() => h.cleanup());

async function adminCookie(): Promise<string> {
  const admin = await insertUser({
    username: 'admin',
    passwordHash: await hashPassword('hunter22'),
    role: 'admin',
    mustChangePassword: false,
  });
  const s = await createSession({ userId: admin.id, userAgent: null, ipAddress: null });
  return `bookkeeprr_session=${s.token}`;
}

describe('GET/PUT /api/settings/naming', () => {
  it('GET returns defaults when nothing set', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.templates).toEqual(NAMING_DEFAULTS);
  });

  it('PUT validates each template per content-type', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ templates: { volume: '{chapter}' } }),
      }),
    );
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'PUT /api/settings/naming (400)');
  });

  it('PUT roundtrips valid templates', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          templates: {
            series_folder: 'S {series_title}',
            volume: '{series_title} - v{volume:000}.{ext}',
          },
        }),
      }),
    );
    expect(res.status).toBe(200);
    await expectShape(SettingsOkResponse, res, 'PUT /api/settings/naming');
    const after = await GET();
    const body = await after.json();
    expect(body.templates.series_folder).toBe('S {series_title}');
    expect(body.templates.volume).toBe('{series_title} - v{volume:000}.{ext}');
    // unchanged keys keep defaults
    expect(body.templates.chapter).toBe(NAMING_DEFAULTS.chapter);
  });
});

describe('GET/PUT /api/settings/naming — per-contentType', () => {
  it('GET without contentType defaults to manga (back-compat)', async () => {
    const res = await GET(new Request('http://t/api/settings/naming'));
    expect(res.status).toBe(200);
    await expectShape(NamingGetResponse, res, 'GET /api/settings/naming');
    const body = await res.json();
    expect(body.contentType).toBe('manga');
    expect(body.templates.volume).toBe('{series_title} - v{volume:00} [{group}].{ext}');
  });

  it('GET with contentType=ebook returns ebook templates (placeholder = manga defaults in M9)', async () => {
    const res = await GET(new Request('http://t/api/settings/naming?contentType=ebook'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contentType).toBe('ebook');
    expect(body.templates.volume).toBe('{series_title} - v{volume:00} [{group}].{ext}');
  });

  it('PUT with contentType=audiobook stores under naming.audiobook.*', async () => {
    const cookie = await adminCookie();
    const res = await PUT(
      new Request('http://t/api/settings/naming?contentType=audiobook', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ templates: { series_folder: 'AB-{series_title}' } }),
      }),
    );
    expect(res.status).toBe(200);
    // Verify directly via DAL
    expect(await namingSetting('audiobook', 'series_folder').get()).toBe('AB-{series_title}');
    expect(await namingSetting('manga', 'series_folder').get()).toBe('{group_path}/{series_title}');
  });

  it('GET with bogus contentType returns 400', async () => {
    const res = await GET(new Request('http://t/api/settings/naming?contentType=novel'));
    expect(res.status).toBe(400);
    await expectShape(ErrorResponse, res, 'GET /api/settings/naming (400)');
  });
});
