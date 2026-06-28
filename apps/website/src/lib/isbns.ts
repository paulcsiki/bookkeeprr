// ISBN constants for Open Library covers, used in the hero showcase and other places.
// Sourced from the design prototype.

export const VINLAND_ISBN = '9781612624204';
export const RE_ZERO_ISBN = '9780316315302';
export const SAGA_ISBN = '9781607066019';
export const PROJECT_HAIL_MARY_ISBN = '9780593135204';
export const THREE_BODY_PROBLEM_ISBN = '9780765382030';
export const BERSERK_ISBN = '9781506711980';
export const CHAINSAW_MAN_ISBN = '9781974709939';
export const WITCH_HAT_ATELIER_ISBN = '9781632367709';
export const SPICE_AND_WOLF_ISBN = '9780759531048';
export const MONSTRESS_ISBN = '9781632157096';
export const PIRANESI_ISBN = '9781635575637';
export const KAFKA_ON_THE_SHORE_ISBN = '9781400079278';
export const TOKYO_GHOUL_ISBN = '9781421580364';

// Hero showcase grid covers (order matters for visual layout — 3×2 grid)
export const HERO_GRID_ISBNS: Array<{
  isbn: string;
  type: 'manga' | 'novel' | 'comic' | 'ebook' | 'audio';
  title: string;
  hue: number;
}> = [
  { isbn: VINLAND_ISBN, type: 'manga', title: 'Vinland Saga', hue: 12 },
  { isbn: RE_ZERO_ISBN, type: 'novel', title: 'Re:Zero', hue: 220 },
  { isbn: SAGA_ISBN, type: 'comic', title: 'Saga', hue: 60 },
  { isbn: PROJECT_HAIL_MARY_ISBN, type: 'ebook', title: 'Project Hail Mary', hue: 150 },
  { isbn: THREE_BODY_PROBLEM_ISBN, type: 'audio', title: 'Three-Body Problem', hue: 300 },
  { isbn: BERSERK_ISBN, type: 'manga', title: 'Berserk', hue: 340 },
];
