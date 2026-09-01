import { useState } from "react";
import { Button } from "./Button";

const COPIED_LABEL_DURATION_MILLISECONDS = 2000;

/**
 * A copy-to-clipboard button that briefly shows "Copied" instead of
 * popping up a separate toast, per Section 7.4 of the design
 * specification. Falls back to a helpful message if the clipboard API is
 * unavailable or blocked, rather than failing silently.
 */
export function CopyButton({ valueToCopy }: { valueToCopy: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopyClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(valueToCopy);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    setTimeout(() => setCopyState("idle"), COPIED_LABEL_DURATION_MILLISECONDS);
  }

  const buttonLabel = getButtonLabel(copyState);

  return (
    <Button variant="secondary" onClick={handleCopyClick}>
      {buttonLabel}
    </Button>
  );
}

function getButtonLabel(copyState: "idle" | "copied" | "failed"): string {
  if (copyState === "copied") {
    return "Copied";
  }

  if (copyState === "failed") {
    return "Couldn't copy";
  }

  return "Copy";
}
