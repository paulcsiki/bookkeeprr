import { Grid3x3 } from 'lucide-react';
import type { ContentType } from '@bookkeeprr/types';
import { Card, CardHead, Donut, fmtHrs, PERIOD_NOTE } from '@/components/dashboard';
import type { DonutSegment } from '@/components/dashboard';
import { ZeroCaption } from './WidgetEmpty';
import type { FormatMixView } from '../../../app/(app)/dashboard/data';
import type { StatsPeriod } from '@/server/db/reading-stats-agg';

const TYPE_ORDER: ContentType[] = ['manga', 'comic', 'light_novel', 'ebook', 'audiobook'];

type Props = { format: FormatMixView; period: StatsPeriod };

/**
 * By-format donut: reading time split across the five content types. An empty
 * period renders the hollow track ring, a `0` center, and all-0% legend so the
 * widget keeps the populated donut's footprint.
 */
export function FormatWidget({ format, period }: Props): React.JSX.Element {
  const segments: DonutSegment[] = TYPE_ORDER.map((type) => ({
    type,
    value: format.byType[type] ?? 0,
  }));
  const hours = fmtHrs(format.totalMinutes);
  const empty = format.totalMinutes <= 0;

  return (
    <Card fill>
      <CardHead icon={Grid3x3} title={`By format · ${PERIOD_NOTE[period]}`} />
      <div className="flex flex-1 flex-col justify-center py-2">
        <Donut
          segments={segments}
          size={150}
          thickness={20}
          centerLabel={
            <span className={empty ? 'text-muted-foreground' : undefined}>{hours}</span>
          }
          centerSub="HOURS"
        />
        {empty && <ZeroCaption>Nothing to break down yet {PERIOD_NOTE[period]}.</ZeroCaption>}
      </div>
    </Card>
  );
}
