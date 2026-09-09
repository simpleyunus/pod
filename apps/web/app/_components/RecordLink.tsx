'use client';

import { useRouter } from 'next/navigation';

// Records reference each other constantly — a trip names a vehicle and a
// driver, an incident names both, a work order names a vehicle. Rendering
// those as plain text makes every table a dead end and forces users back to
// the sidebar to go anywhere. This turns them into one-click jumps while
// keeping the table's typographic weight.
export default function RecordLink({
  href,
  children,
  muted,
  stopPropagation = true,
}: {
  href: string | null | undefined;
  children: React.ReactNode;
  /** Secondary reference — same affordance, quieter colour. */
  muted?: boolean;
  /** Table rows often have their own onClick; don't fire both. */
  stopPropagation?: boolean;
}) {
  const router = useRouter();
  if (!href) return <span style={{ color: '#98A0AC' }}>—</span>;

  return (
    <a
      href={href}
      onClick={(e) => {
        // Let cmd/ctrl-click and middle-click open a new tab as normal.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (stopPropagation) e.stopPropagation();
        router.push(href);
      }}
      className="pod-record-link"
      style={{
        color: muted ? '#616875' : '#171B26',
        fontWeight: muted ? 400 : 500,
        textDecoration: 'none',
        borderBottom: '1px solid transparent',
      }}
    >
      {children}
    </a>
  );
}
