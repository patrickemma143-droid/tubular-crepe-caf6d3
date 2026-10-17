/** FarmOS mark: a milk can on a green tile. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1F5130" />
      <path d="M24 14h16v5l4 5v24a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V24l4-5z" fill="#F5F7F1" />
      <rect x="22" y="11" width="20" height="5" rx="2.5" fill="#F5F7F1" />
      <path d="M20 31h24v6H20z" fill="#2F7A43" />
    </svg>
  );
}
