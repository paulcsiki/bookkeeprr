import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FolderSearch } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { SearchTrigger } from './SearchTrigger';
import { Breadcrumbs } from './Breadcrumbs';

export function TopBar(): React.JSX.Element {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="outline">
          <Link href="/library/import">
            <FolderSearch className="mr-1 h-4 w-4" />
            Scan
          </Link>
        </Button>
        <SearchTrigger />
        <AccountMenu />
      </div>
    </header>
  );
}
