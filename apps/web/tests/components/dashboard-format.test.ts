import { describe, expect, it } from 'vitest';
import { fmtMins, fmtHrs, compactNum, fmtDelta } from '@/components/dashboard/format';

describe('fmtMins', () => {
  it('renders sub-hour values in minutes', () => {
    expect(fmtMins(0)).toEqual({ v: '0', u: 'm' });
    expect(fmtMins(45)).toEqual({ v: '45', u: 'm' });
    expect(fmtMins(59)).toEqual({ v: '59', u: 'm' });
  });

  it('renders compound hours+minutes under 100h', () => {
    expect(fmtMins(60)).toEqual({ v: '1h', u: '' });
    expect(fmtMins(90)).toEqual({ v: '1h 30m', u: '' });
    expect(fmtMins(125)).toEqual({ v: '2h 5m', u: '' });
  });

  it('collapses to whole hours at/over 100h', () => {
    expect(fmtMins(6000)).toEqual({ v: '100', u: 'h' });
    expect(fmtMins(7230)).toEqual({ v: '120', u: 'h' });
  });

  it('clamps negatives to zero', () => {
    expect(fmtMins(-10)).toEqual({ v: '0', u: 'm' });
  });
});

describe('fmtHrs', () => {
  it('rounds minutes to whole hours', () => {
    expect(fmtHrs(0)).toBe(0);
    expect(fmtHrs(30)).toBe(1);
    expect(fmtHrs(89)).toBe(1);
    expect(fmtHrs(90)).toBe(2);
    expect(fmtHrs(-50)).toBe(0);
  });
});

describe('compactNum', () => {
  it('passes small numbers through', () => {
    expect(compactNum(0)).toBe('0');
    expect(compactNum(999)).toBe('999');
  });

  it('compacts thousands with one decimal, dropping trailing .0', () => {
    expect(compactNum(1000)).toBe('1k');
    expect(compactNum(1234)).toBe('1.2k');
    expect(compactNum(12000)).toBe('12k');
  });

  it('clamps negatives', () => {
    expect(compactNum(-5)).toBe('0');
  });
});

describe('fmtDelta', () => {
  it('signs and rounds the percentage', () => {
    expect(fmtDelta(12)).toBe('+12%');
    expect(fmtDelta(0)).toBe('+0%');
    expect(fmtDelta(-4.6)).toBe('-5%');
  });
});
