import { HandshakeResponse } from '@/api/schemas/handshake';

describe('HandshakeResponse push_enabled', () => {
  it('parses minimal response with push_enabled=false', () => {
    const result = HandshakeResponse.parse({
      server_version: '1.0.0',
      supported_auth_modes: ['password'],
      brand: 'bookkeeprr',
      push_enabled: false,
    });
    expect(result.push_enabled).toBe(false);
  });

  it('parses response with push_enabled=true', () => {
    const result = HandshakeResponse.parse({
      server_version: '1.0.0',
      supported_auth_modes: ['password'],
      brand: 'bookkeeprr',
      push_enabled: true,
    });
    expect(result.push_enabled).toBe(true);
  });

  it('defaults push_enabled to false when missing (backward-compat with older servers)', () => {
    const result = HandshakeResponse.parse({
      server_version: '1.0.0',
      supported_auth_modes: ['password'],
      brand: 'bookkeeprr',
    });
    expect(result.push_enabled).toBe(false);
  });
});
