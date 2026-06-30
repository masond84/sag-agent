interface PresenceExpandButtonProps {
  expanded: boolean;
  onClick: () => void;
}

export function PresenceExpandButton({ expanded, onClick }: PresenceExpandButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={expanded ? "Exit expanded presence view" : "Expand presence view"}
      title={expanded ? "Exit expanded view" : "Expand presence"}
      className="rounded-md border border-sag-border bg-white/[0.04] p-1.5 text-sag-muted transition hover:bg-white/[0.08] hover:text-sag-text"
    >
      {expanded ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M5 1H1v4M13 5V1H9M9 13h4V9M1 9v4h4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
