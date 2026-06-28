import { Globe, Clock, Check, BookOpen, Zap } from 'lucide-react';
import { SectionHead, StatTile, fmtHrs, compactNum, PERIOD_NOTE } from '@/components/dashboard';
import { ZeroCaption } from './WidgetEmpty';
import type { ServerTotals } from '@/server/db/dashboard-agg';
import type { StatsPeriod } from '@/server/db/reading-stats-agg';

type Props = { server: ServerTotals; period: StatsPeriod };

/**
 * Across-your-server totals: four aggregate tiles (time, books, units, active
 * readers) summed over the household. A fully-inactive period renders the tiles
 * at 0 in muted color with a caption; the member count always reflects the real
 * roster.
 */
export function ServerWidget({ server, period }: Props): React.JSX.Element {
  const empty = server.minutes <= 0 && server.booksFinished <= 0 && server.units <= 0;
  const muted = empty ? '--color-muted-foreground' : undefined;
  const note = PERIOD_NOTE[period];

  return (
    <section>
      <SectionHead
        icon={Globe}
        title={`Across your server · ${server.totalMembers} ${
          server.totalMembers === 1 ? 'member' : 'members'
        }`}
      />
      {/* Container-query grid (see PersonalWidget): 2-up when the card is narrow,
          4-up once wide enough that the longer server labels don't clip. */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3.5 @xl:grid-cols-4">
        <StatTile
          icon={Clock}
          label={`Total time · ${note}`}
          value={compactNum(fmtHrs(server.minutes))}
          unit="hours"
          accentVar={muted}
        />
        <StatTile
          icon={Check}
          label={`Books finished · ${note}`}
          value={server.booksFinished}
          unit="books"
          accentVar={muted}
        />
        <StatTile
          icon={BookOpen}
          label="Units read"
          value={compactNum(server.units)}
          unit="ch/vol"
          accentVar={muted}
        />
        <StatTile
          icon={Zap}
          label="Active readers"
          value={`${server.activeReaders}/${server.totalMembers}`}
          unit={note}
          accentVar={empty ? muted : '--color-ok'}
        />
        </div>
      </div>
      {empty && <ZeroCaption>No reading recorded across the server {note}.</ZeroCaption>}
    </section>
  );
}
