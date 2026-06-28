export const fonts = {
  display: {
    medium: 'SpaceGrotesk-Medium' as const,
    semibold: 'SpaceGrotesk-SemiBold' as const,
    bold: 'SpaceGrotesk-Bold' as const,
  },
  sans: {
    regular: 'Geist-Regular' as const,
    medium: 'Geist-Medium' as const,
    semibold: 'Geist-SemiBold' as const,
    bold: 'Geist-Bold' as const,
  },
  mono: {
    regular: 'GeistMono-Regular' as const,
    medium: 'GeistMono-Medium' as const,
  },
} as const;

export const text = {
  displayLg: { fontFamily: fonts.display.bold, fontSize: 32, lineHeight: 38 },
  displayMd: { fontFamily: fonts.display.semibold, fontSize: 22, lineHeight: 28 },
  displaySm: { fontFamily: fonts.display.medium, fontSize: 16, lineHeight: 20 },
  body: { fontFamily: fonts.sans.regular, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.sans.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sans.medium, fontSize: 13, lineHeight: 16 },
  button: { fontFamily: fonts.sans.semibold, fontSize: 15, lineHeight: 20 },
  mono: { fontFamily: fonts.mono.regular, fontSize: 12, lineHeight: 16 },
  monoSm: { fontFamily: fonts.mono.regular, fontSize: 11, lineHeight: 14 },
} as const;
