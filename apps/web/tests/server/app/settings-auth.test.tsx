/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagTokenInput } from '@/app/(app)/settings/auth/TagTokenInput';

describe('TagTokenInput', () => {
  it('renders one chip per token', () => {
    render(<TagTokenInput id="t" label="Tags" value={['a', 'b']} onChange={() => {}} />);
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
  });

  it('adds a token on Enter and clears the input', () => {
    let captured: string[] = [];
    render(
      <TagTokenInput
        id="t"
        label="Tags"
        value={['existing']}
        onChange={(next) => {
          captured = next;
        }}
      />,
    );
    const input = screen.getByLabelText('Tags') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new-token' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(captured).toEqual(['existing', 'new-token']);
  });

  it('removes a token on chip click', () => {
    let captured: string[] = [];
    render(
      <TagTokenInput
        id="t"
        label="Tags"
        value={['a', 'b']}
        onChange={(next) => {
          captured = next;
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Remove a'));
    expect(captured).toEqual(['b']);
  });
});
