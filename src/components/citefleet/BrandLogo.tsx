import logoUrl from "@/assets/citefleet-logo.png";

export function BrandLogo({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={`block shrink-0 object-contain ${className}`.trim()}
    />
  );
}
