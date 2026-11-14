import type { SVGProps } from "react";

type Glyph = (props: SVGProps<SVGSVGElement>) => React.ReactNode;

export function Image(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="7" width="22" height="20" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h17a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2h-2" />
      <circle cx="10" cy="13" r="2" />
      <path d="m4 23 6-6 5 5 4-4 6 6" />
    </svg>
  );
}

export function Checkmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m5 12 5 5L19 7" />
    </svg>
  );
}

export function ChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Icon({ icon: Glyph, size = 32, className }: { icon: Glyph; size?: number; className?: string }) {
  return <Glyph width={size} height={size} className={className} aria-hidden="true" />;
}
