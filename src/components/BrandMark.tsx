import { Link } from "@tanstack/react-router";

import logo from "@/assets/vellum-logo.png";

export function BrandMark({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <img
        src={logo}
        alt="Vellum"
        width={816}
        height={816}
        className="size-7 object-contain"
      />
      <span className="font-display text-[15px] font-semibold tracking-tight">Vellum</span>
      <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">/ study</span>
    </Link>
  );
}
