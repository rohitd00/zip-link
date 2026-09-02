import { MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";
import { CopyButton } from "../../components/CopyButton";
import { StatusBadge } from "../../components/StatusBadge";

export interface LinkListItemData {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
  expiresAt: string | null;
  state: "active" | "expired";
  totalClicks: number;
}

export function LinkListItem({ link }: { link: LinkListItemData }) {
  const createdAtLabel = new Date(link.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <li className="group rounded-[var(--radius-control)] border border-transparent px-3 py-4 transition-colors hover:border-border hover:bg-surface-subtle/60 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/links/${link.shortCode}`}
              className="text-sm font-semibold text-accent hover:text-accent-hover hover:underline"
            >
              {link.shortUrl}
            </Link>
            <CopyButton valueToCopy={link.shortUrl} />
            <StatusBadge status={link.state} />
          </div>
          <p className="mt-1 truncate text-sm text-text-muted" title={link.longUrl}>
            {link.longUrl}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">Created {createdAtLabel}</p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-text tabular-nums">
            <MousePointerClick className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            {link.totalClicks.toLocaleString()} clicks
          </p>
          <Link
            to={`/links/${link.shortCode}`}
            className="text-sm font-medium text-text-muted transition-colors hover:text-accent"
            aria-label={`View details for ${link.shortUrl}`}
          >
            Details →
          </Link>
        </div>
      </div>
    </li>
  );
}
