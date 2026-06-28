export type CoverPoolEntry = { isbn: string; hue: number; title: string };

/**
 * Covers for the sign-in CoverWall (§18). Vendored locally under
 * apps/web/public/covers/{isbn}.webp (compressed) so the wall loads fast and
 * the browser caches them — see the long-lived Cache-Control header for
 * /covers in apps/web/next.config.ts. 120 unique covers, enough to
 * fill large screens without repeats.
 */
export const COVER_POOL: ReadonlyArray<CoverPoolEntry> = [
  { isbn: '9781612624204', hue: 12 , title: 'Vinland Saga' },
  { isbn: '9780316315302', hue: 220, title: 'Re:Zero' },
  { isbn: '9781607066019', hue: 60 , title: 'Saga' },
  { isbn: '9780593135204', hue: 150, title: 'Project Hail Mary' },
  { isbn: '9780765382030', hue: 300, title: 'Three-Body Problem' },
  { isbn: '9781506711980', hue: 340, title: 'Berserk' },
  { isbn: '9781974709939', hue: 0  , title: 'Chainsaw Man' },
  { isbn: '9780759531048', hue: 30 , title: 'Spice & Wolf' },
  { isbn: '9781632157096', hue: 280, title: 'Monstress' },
  { isbn: '9781635575637', hue: 200, title: 'Piranesi' },
  { isbn: '9781400079278', hue: 170, title: 'Kafka on the Shore' },
  { isbn: '9781632367709', hue: 250, title: 'Witch Hat Atelier' },
  { isbn: '9781421506630', hue: 18 , title: 'Death Note' },
  { isbn: '9780316055437', hue: 95 , title: 'Mistborn' },
  { isbn: '9780553573404', hue: 40 , title: 'A Game of Thrones' },
  { isbn: '9780441013593', hue: 130, title: 'Dune' },
  { isbn: '9780547928227', hue: 110, title: 'The Hobbit' },
  { isbn: '9781947194557', hue: 320, title: 'Goodbye, Eri' },
  { isbn: '9780062024039', hue: 10 , title: 'Divergent' },
  { isbn: '9780385537858', hue: 260, title: 'The Circle' },
  { isbn: '9781563892271', hue: 265, title: 'The Sandman' },
  { isbn: '9780063021426', hue: 95 , title: 'Babel' },
  { isbn: '9781974700523', hue: 5  , title: 'Demon Slayer' },
  { isbn: '9781974710027', hue: 310, title: 'Jujutsu Kaisen' },
  { isbn: '9781421582696', hue: 135, title: 'My Hero Academia' },
  { isbn: '9781974715466', hue: 200, title: 'Spy × Family' },
  { isbn: '9781612620244', hue: 210, title: 'Attack on Titan' },
  { isbn: '9781421580364', hue: 285, title: 'Tokyo Ghoul' },
  { isbn: '9781591169208', hue: 45 , title: 'Fullmetal Alchemist' },
  { isbn: '9781569319000', hue: 25 , title: 'Naruto' },
  { isbn: '9781569319017', hue: 15 , title: 'One Piece' },
  { isbn: '9781591164418', hue: 190, title: 'Bleach' },
  { isbn: '9781506709871', hue: 160, title: 'Mob Psycho 100' },
  { isbn: '9781632360564', hue: 205, title: 'A Silent Voice' },
  { isbn: '9780316073875', hue: 75 , title: 'Yotsuba&!' },
  { isbn: '9781935429005', hue: 0  , title: 'Akira' },
  { isbn: '9780765326355', hue: 235, title: 'The Way of Kings' },
  { isbn: '9780756404741', hue: 40 , title: 'The Name of the Wind' },
  { isbn: '9780451524935', hue: 0  , title: '1984' },
  { isbn: '9780060850524', hue: 120, title: 'Brave New World' },
  { isbn: '9780307387899', hue: 30 , title: 'The Road' },
  { isbn: '9780553380958', hue: 160, title: 'Snow Crash' },
  { isbn: '9780553293357', hue: 260, title: 'Foundation' },
  { isbn: '9780553283686', hue: 290, title: 'Hyperion' },
  { isbn: '9780316452502', hue: 150, title: 'Children of Time' },
  { isbn: '9780316229296', hue: 15 , title: 'The Fifth Season' },
  { isbn: '9780547773742', hue: 210, title: 'A Wizard of Earthsea' },
  { isbn: '9780930289232', hue: 50 , title: 'Watchmen' },
  { isbn: '9781401208417', hue: 350, title: 'V for Vendetta' },
  { isbn: '9780375714573', hue: 0  , title: 'Persepolis' },
  { isbn: '9781600103841', hue: 265, title: 'Locke & Key' },
  { isbn: '9781632156747', hue: 300, title: 'Paper Girls' },
  { isbn: '9781401229696', hue: 90 , title: 'Sweet Tooth' },
  { isbn: '9780441478125', hue: 250, title: 'Left Hand of Darkness' },
  { isbn: '9780062572233', hue: 200, title: 'American Gods' },
  { isbn: '9780374299231', hue: 180, title: 'Sourdough' },
  { isbn: '9789877478433', hue: 0  , title: 'Heartstopper, Volume 1' },
  { isbn: '9788682186021', hue: 6  , title: 'Heartstopper, Volume 2' },
  { isbn: '9781444952773', hue: 11 , title: 'Heartstopper, Volume 3' },
  { isbn: '9781444972467', hue: 17 , title: 'Heartstopper, Volume 4' },
  { isbn: '9780545852500', hue: 23 , title: 'Guts' },
  { isbn: '9788376867809', hue: 28 , title: 'Dog Man and Cat Kid' },
  { isbn: '9781536400373', hue: 34 , title: 'Dog Man Unleashed' },
  { isbn: '9781338807486', hue: 39 , title: 'Heartstopper, Volume Five' },
  { isbn: '9781338680461', hue: 45 , title: 'Dog Man' },
  { isbn: '9780613027823', hue: 51 , title: 'Understanding Comics' },
  { isbn: '9781421516554', hue: 56 , title: 'Naruto' },
  { isbn: '9780062691200', hue: 62 , title: 'New Kid' },
  { isbn: '9781524887490', hue: 68 , title: 'Big Nate' },
  { isbn: '9782723488525', hue: 73 , title: 'ONE PIECE 1' },
  { isbn: '9784088802640', hue: 79 , title: 'My Hero Academia, Vol. 1' },
  { isbn: '9780606366267', hue: 84 , title: 'The Angel Experiment' },
  { isbn: '9781415661055', hue: 90 , title: 'Death Note, Vol. 1' },
  { isbn: '9788575327302', hue: 96 , title: 'Uzumaki' },
  { isbn: '9780545349277', hue: 101, title: 'The Brightest Night' },
  { isbn: '9781591163657', hue: 107, title: 'Naruto, Vol. 1' },
  { isbn: '9781593070205', hue: 113, title: 'Berserk, Vol. 1' },
  { isbn: '9781421502731', hue: 118, title: 'Dragon Ball Z; Thank You' },
  { isbn: '9789570853049', hue: 124, title: 'On Tyranny' },
  { isbn: '9781419735042', hue: 129, title: 'Avatar' },
  { isbn: '9780099538363', hue: 135, title: 'Maximum Ride. The Manga 1' },
  { isbn: '9781846054747', hue: 141, title: 'Witch & wizard' },
  { isbn: '9781421565989', hue: 146, title: 'Battle royale' },
  { isbn: '9788846208835', hue: 152, title: '4th of July' },
  { isbn: '9781935429746', hue: 158, title: 'Sailor Moon, Vol. 1' },
  { isbn: '9780593871966', hue: 163, title: 'Lore Olympus' },
  { isbn: '9781421511795', hue: 169, title: 'Bleach' },
  { isbn: '9788380963481', hue: 174, title: 'My Hero Academia, Vol. 2' },
  { isbn: '9781441718563', hue: 180, title: 'Thumbelina' },
  { isbn: '9786055678357', hue: 186, title: 'Amulet' },
  { isbn: '9781250317469', hue: 191, title: 'Best Friends' },
  { isbn: '9784766110357', hue: 197, title: 'How to Draw Manga' },
  { isbn: '9781421590561', hue: 203, title: 'Tomie' },
  { isbn: '9783551742339', hue: 208, title: 'Attack On Titan, Vol. 1' },
  { isbn: '9788380963498', hue: 214, title: 'My Hero Academia, Vol. 3' },
  { isbn: '9781428700529', hue: 219, title: 'Death Note, Vol. 8' },
  { isbn: '9781250317551', hue: 225, title: 'Friends Forever' },
  { isbn: '9788365122957', hue: 231, title: 'The Lost Warrior' },
  { isbn: '9781974745548', hue: 236, title: 'Boruto' },
  { isbn: '9788467932560', hue: 242, title: 'Akira, Vol. 1' },
  { isbn: '9788382250299', hue: 248, title: 'Twisted Ones' },
  { isbn: '9780606415224', hue: 253, title: 'The Fourth Closet' },
  { isbn: '9780613563338', hue: 259, title: 'Dragon Ball Z (Dragon Ball Z' },
  { isbn: '9780606105682', hue: 264, title: 'Escape from the Forest' },
  { isbn: '9781421526539', hue: 270, title: 'Naruto Uzumaki Naruto' },
  { isbn: '9780063351745', hue: 276, title: 'The Rise of Scourge' },
  { isbn: '9780316608060', hue: 281, title: 'Vampire Mountain' },
  { isbn: '9780061547928', hue: 287, title: 'Into the Woods' },
  { isbn: '9780358468295', hue: 293, title: 'Hooky' },
  { isbn: '9781421598468', hue: 298, title: 'Smashed' },
  { isbn: '9781974717118', hue: 304, title: 'Jujutsu Kaisen, Vol. 7' },
  { isbn: '9784088736310', hue: 309, title: 'Death Note, Vol. 2' },
  { isbn: '9781569313831', hue: 315, title: 'Pokemon Tales, Volume 1' },
  { isbn: '9781569715284', hue: 321, title: 'Akira, Vol. 6' },
  { isbn: '9781569715253', hue: 326, title: 'Akira, Vol. 3' },
  { isbn: '9784061037120', hue: 332, title: 'Akira, Vol. 2' },
  { isbn: '9788483570456', hue: 338, title: 'Death Note, Vol. 3' },
  { isbn: '9781569314951', hue: 343, title: 'Dragon Ball vol 13' },
  { isbn: '9781421506272', hue: 349, title: 'Death Note, Vol. 6' },
  { isbn: '9781338601336', hue: 354, title: 'Dog Man' },
];

/**
 * Local, cached path to a vendored cover image. Only valid for ISBNs in
 * COVER_POOL (the sign-in wall) — those are the covers shipped under
 * apps/web/public/covers/.
 */
export function coverUrl(isbn: string): string {
  return `/covers/${isbn}.webp`;
}

/**
 * Remote OpenLibrary cover URL for an arbitrary ISBN. Used where the ISBN
 * isn't known at build time (e.g. Discover search results), so it can't be
 * vendored. For the fixed sign-in wall, prefer the vendored {@link coverUrl}.
 */
export function openLibraryCoverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
}
