/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileSection } from '@/app/(app)/account/components/ProfileSection';

const me = { id: 1, username: 'owner@example.com', email: 'owner@example.com', displayName: null, role: 'admin' as const, avatarUrl: null, authSource: 'local' };

describe('ProfileSection', () => {
  it('renders Display name + Email fields and a disabled Save until dirty', () => {
    render(<ProfileSection me={me} />);
    expect(document.querySelector('#profile-display-name')).toBeTruthy();
    expect(document.querySelector('#profile-email')).toBeTruthy();
    const save = screen.getByRole('button', { name: /Save changes/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('enables Save when a field changes and Discard reverts it', () => {
    render(<ProfileSection me={me} />);
    const name = document.querySelector('#profile-display-name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Owner' } });
    const save = screen.getByRole('button', { name: /Save changes/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect((document.querySelector('#profile-display-name') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: /Save changes/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
