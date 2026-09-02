import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { TextField } from "../components/TextField";
import { CreateLinkForm } from "../features/links/CreateLinkForm";
import { LinkListItem } from "../features/links/LinkListItem";
import { useLinkList } from "../features/links/useLinkList";

export function DashboardHomePage() {
  const {
    links,
    loadingState,
    searchQuery,
    setSearchQuery,
    hasMore,
    isLoadingMore,
    loadMore,
    prependCreatedLink,
    retry,
  } = useLinkList();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-text">Your links</h1>
        <p className="mt-1 text-sm text-text-muted">
          Create a short link and see how people use it.
        </p>
      </div>

      <CreateLinkForm onLinkCreated={prependCreatedLink} />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-text">Your links</h2>
          <div className="w-full sm:w-64">
            <TextField
              label="Search links"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by code or destination"
            />
          </div>
        </div>

        <div className="mt-4">
          {loadingState === "loading" && <LinkListSkeleton />}

          {loadingState === "error" && (
            <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center shadow-[var(--shadow-card)]">
              <p className="text-sm text-text-muted">Couldn't load your links.</p>
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" onClick={retry}>
                  Try again
                </Button>
              </div>
            </div>
          )}

          {loadingState === "loaded" && links.length === 0 && (
            <EmptyState
              title="No links yet"
              description="Create your first short link above. You'll see its clicks here after people open it."
            />
          )}

          {loadingState === "loaded" && links.length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-border bg-surface px-3 shadow-[var(--shadow-card)] sm:px-4">
              <ul>
                {links.map((link) => (
                  <LinkListItem key={link.shortCode} link={link} />
                ))}
              </ul>
            </div>
          )}

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" isLoading={isLoadingMore} onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkListSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      aria-busy="true"
      aria-label="Loading your links"
    >
      {[0, 1, 2].map((rowIndex) => (
        <div key={rowIndex} className="h-14 animate-pulse rounded bg-surface-subtle" />
      ))}
    </div>
  );
}
