import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Globe2,
  LineChart,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Share2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import { BreakdownCard } from "../components/BreakdownCard";
import { Button } from "../components/Button";
import { ClicksChart } from "../components/ClicksChart";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import { MetricCard } from "../components/MetricCard";
import { RangeSelector, type RangePreset } from "../components/RangeSelector";
import { StatusBadge } from "../components/StatusBadge";
import { buildRangeForPreset } from "../features/analytics/dateRangeHelpers";
import { useLinkAnalytics } from "../features/analytics/useLinkAnalytics";
import type { GetLinkDetailResponseData } from "@shared/contracts/linkRequests";

type LinkOverviewState =
  | { status: "loading" }
  | { status: "loaded"; link: GetLinkDetailResponseData }
  | { status: "not_found" }
  | { status: "error" };

export function LinkDetailPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [overviewState, setOverviewState] = useState<LinkOverviewState>({ status: "loading" });
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // A preset range (e.g. "30 days") always means "the 30 days ending now."
  // Recomputing this anchor moves that window's end forward so the Refresh
  // button can actually reach clicks that happened after the page loaded,
  // instead of silently re-requesting the exact same frozen window.
  const [rangeAnchorTime, setRangeAnchorTime] = useState(() => new Date());

  const shortCode = code ?? "";

  useEffect(() => {
    let isCancelled = false;

    apiClient
      .getLinkDetail(shortCode)
      .then((response) => {
        if (!isCancelled) {
          setOverviewState({ status: "loaded", link: response.data });
        }
      })
      .catch((thrownError: unknown) => {
        if (isCancelled) {
          return;
        }

        const isNotFound =
          typeof thrownError === "object" &&
          thrownError !== null &&
          "httpStatus" in thrownError &&
          (thrownError as { httpStatus: number }).httpStatus === 404;

        setOverviewState({ status: isNotFound ? "not_found" : "error" });
      });

    return () => {
      isCancelled = true;
    };
  }, [shortCode]);

  const activeRange = useMemo(() => {
    if (rangePreset === "custom") {
      if (customFrom.length === 0 || customTo.length === 0) {
        return null;
      }

      return {
        from: new Date(customFrom).toISOString(),
        to: new Date(customTo).toISOString(),
      };
    }

    return buildRangeForPreset(rangePreset, rangeAnchorTime);
  }, [rangePreset, customFrom, customTo, rangeAnchorTime]);

  const fallbackRange = useMemo(() => buildRangeForPreset("30d", rangeAnchorTime), [rangeAnchorTime]);
  const { analytics, loadingState, isRefreshing, refresh } = useLinkAnalytics(
    shortCode,
    activeRange ?? fallbackRange,
  );

  function handleRefreshClick(): void {
    // A custom range has fixed, user-chosen boundaries that refreshing
    // should not move; only a preset range's end advances to "now."
    if (rangePreset !== "custom") {
      setRangeAnchorTime(new Date());
    }

    refresh();
  }

  async function handleConfirmDelete(): Promise<void> {
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await apiClient.deleteLink(shortCode);
      navigate("/", { state: { deletedShortCode: shortCode } });
    } catch {
      setDeleteError("Couldn't delete this link. Please try again.");
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  }

  if (overviewState.status === "loading") {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }

  if (overviewState.status === "not_found") {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-text">This link is unavailable</p>
        <p className="mt-1 text-sm text-text-muted">
          It may have been removed, or you may not have access to it.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
          Back to your links
        </Link>
      </div>
    );
  }

  if (overviewState.status === "error") {
    return <p className="text-sm text-danger">Couldn't load this link. Please try again.</p>;
  }

  const { link } = overviewState;
  const isExpired = link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          All links
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="break-all text-xl font-bold tracking-tight text-text">{link.shortUrl}</h1>
          <CopyButton valueToCopy={link.shortUrl} />
          <StatusBadge status={isExpired ? "expired" : "active"} />
        </div>

        <a
          href={link.longUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1 block break-all text-sm text-text-muted hover:text-text"
        >
          {link.longUrl}
        </a>
        <p className="mt-1 text-xs text-text-muted">
          Created {new Date(link.createdAt).toLocaleDateString()} ·{" "}
          {link.expiresAt === null
            ? "No expiry"
            : `Expires ${new Date(link.expiresAt).toLocaleString()}`}
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-text">Analytics</h2>
          <div className="flex items-center gap-2">
            <RangeSelector selectedPreset={rangePreset} onSelectPreset={setRangePreset} />
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing || loadingState === "loading"}
              aria-label="Refresh analytics"
              title="Refresh analytics"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-text-muted shadow-[var(--shadow-card)] transition-colors hover:border-border-strong hover:bg-surface-subtle hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-muted">Recent clicks may take a moment to appear.</p>

        {rangePreset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text">From</span>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm shadow-[var(--shadow-card)] outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text">To</span>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="min-h-11 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm shadow-[var(--shadow-card)] outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
              />
            </label>
          </div>
        )}

        <div className="mt-4">
          {loadingState === "loading" && (
            <div
              className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-subtle"
              aria-busy="true"
              aria-label="Loading analytics"
            />
          )}

          {loadingState === "error" && (
            <p className="text-sm text-danger">Couldn't load analytics for this range.</p>
          )}

          {loadingState === "loaded" && analytics !== null && (
            <AnalyticsContent analytics={analytics} />
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-danger/25 bg-danger-soft/40 p-5">
        <h2 className="text-sm font-semibold text-danger">Delete link</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">This stops the short URL from redirecting.</p>
          <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
            Delete link
          </Button>
        </div>
        {deleteError !== null && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete this link?"
        description={`${link.shortUrl} will stop redirecting. Historical analytics may remain private.`}
        confirmLabel="Delete link"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />
    </div>
  );
}

function AnalyticsContent({
  analytics,
}: {
  analytics: NonNullable<ReturnType<typeof useLinkAnalytics>["analytics"]>;
}) {
  if (analytics.totalClicks === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-text">No clicks in this period</p>
        <p className="mt-1 text-sm text-text-muted">
          When someone opens this short link, their visit will appear here shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <MetricCard
          label="Total clicks"
          value={analytics.totalClicks}
          icon={MousePointerClick}
          supportingText={`${new Date(analytics.range.from).toLocaleDateString()} – ${new Date(
            analytics.range.to,
          ).toLocaleDateString()}`}
        />
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 text-text">
            <LineChart className="h-4 w-4 text-text-muted" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Clicks over time</h3>
          </div>
          <div className="mt-3">
            <ClicksChart timeline={analytics.timeline} timezone={analytics.range.timezone} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BreakdownCard title="Top referrers" icon={Share2} rows={analytics.referrers} />
        <BreakdownCard title="Devices" icon={Monitor} rows={analytics.devices} />
        <BreakdownCard title="Browsers" icon={Globe2} rows={analytics.browsers} />
        <BreakdownCard
          title="Geography"
          icon={Globe2}
          rows={analytics.geography.map((row) => ({
            name: row.city === null ? row.country : `${row.city}, ${row.country}`,
            clickCount: row.clickCount,
          }))}
        />
      </div>

      <p className="text-xs text-text-muted">
        Location is approximate. We do not display individual visitor identities.
      </p>
    </div>
  );
}
