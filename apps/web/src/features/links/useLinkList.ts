import { useCallback, useEffect, useRef, useState } from "react";
import type { CreateLinkResponseData } from "@shared/contracts/linkRequests";
import { apiClient } from "../../api/apiClient";
import type { LinkListItemData } from "./LinkListItem";

export type LinkListLoadingState = "loading" | "loaded" | "error";

const SEARCH_DEBOUNCE_MILLISECONDS = 300;

/**
 * Owns the owned-links list state: initial load, debounced search, cursor
 * pagination, and prepending a link the owner just created so the list
 * updates without a full refetch. No global state library is used here —
 * this is the one page that reads this data, so a plain hook is enough,
 * per Rule G-02's "do not introduce a global state library unless
 * concrete interaction complexity proves it necessary."
 */
export function useLinkList() {
  const [links, setLinks] = useState<LinkListItemData[]>([]);
  const [loadingState, setLoadingState] = useState<LinkListLoadingState>("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const latestRequestId = useRef(0);

  const fetchFirstPage = useCallback((query: string) => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;

    setLoadingState("loading");

    apiClient
      .listLinks({ cursor: null, query: query.length > 0 ? query : null })
      .then((result) => {
        if (latestRequestId.current !== requestId) {
          return; // A newer search request already started; ignore this stale one.
        }

        setLinks(result.data);
        setNextCursor(result.page.nextCursor);
        setLoadingState("loaded");
      })
      .catch(() => {
        if (latestRequestId.current === requestId) {
          setLoadingState("error");
        }
      });
  }, []);

  useEffect(() => {
    const debounceHandle = setTimeout(() => {
      fetchFirstPage(searchQuery);
    }, SEARCH_DEBOUNCE_MILLISECONDS);

    return () => clearTimeout(debounceHandle);
  }, [searchQuery, fetchFirstPage]);

  async function loadMore(): Promise<void> {
    if (nextCursor === null || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const result = await apiClient.listLinks({
        cursor: nextCursor,
        query: searchQuery.length > 0 ? searchQuery : null,
      });

      setLinks((currentLinks) => [...currentLinks, ...result.data]);
      setNextCursor(result.page.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function prependCreatedLink(createdLink: CreateLinkResponseData): void {
    setLinks((currentLinks) => {
      const withoutDuplicate = currentLinks.filter(
        (link) => link.shortCode !== createdLink.shortCode,
      );

      const newListItem: LinkListItemData = {
        shortCode: createdLink.shortCode,
        shortUrl: createdLink.shortUrl,
        longUrl: createdLink.longUrl,
        createdAt: createdLink.createdAt,
        expiresAt: createdLink.expiresAt,
        state: "active",
        totalClicks: 0,
      };

      return [newListItem, ...withoutDuplicate];
    });
  }

  return {
    links,
    loadingState,
    searchQuery,
    setSearchQuery,
    hasMore: nextCursor !== null,
    isLoadingMore,
    loadMore,
    prependCreatedLink,
    retry: () => fetchFirstPage(searchQuery),
  };
}
