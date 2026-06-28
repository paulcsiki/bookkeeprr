import { describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { TorznabSearchRoot, TorznabCapsRoot } from '@/server/integrations/torznab/schemas';

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

describe('Torznab schemas', () => {
  it('parses a search response with torznab:attr + enclosure', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title>Atomic Habits James Clear</title>
        <guid>abc123</guid>
        <link>magnet:?xt=urn:btih:DEAD</link>
        <pubDate>Mon, 02 Jun 2025 10:00:00 +0000</pubDate>
        <enclosure url="http://t/x.torrent" length="123456" type="application/x-bittorrent"/>
        <torznab:attr name="seeders" value="10"/>
        <torznab:attr name="peers" value="12"/>
        <torznab:attr name="size" value="123456"/>
        <torznab:attr name="infohash" value="DEAD"/>
        <torznab:attr name="category" value="7020"/>
      </item>
    </channel></rss>`;
    const parsed = TorznabSearchRoot.safeParse(parser.parse(xml));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const channel = parsed.data.rss.channel;
      // An empty <channel> parses to "" (string); a populated one is an object.
      const items = typeof channel === 'string' ? undefined : channel.item;
      expect(Array.isArray(items) ? items.length : 1).toBe(1);
    }
  });

  it('parses a caps response with categories + subcats', () => {
    const xml = `<?xml version="1.0"?><caps><categories>
      <category id="7000" name="Books"><subcat id="7020" name="EBook"/><subcat id="7030" name="Comics"/></category>
      <category id="3000" name="Audio"><subcat id="3030" name="Audiobook"/></category>
    </categories></caps>`;
    const parsed = TorznabCapsRoot.safeParse(parser.parse(xml));
    expect(parsed.success).toBe(true);
  });
});
