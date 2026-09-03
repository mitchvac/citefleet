export function BrandLogo({
  size = 36,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="CiteFleet"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`.trim()}
    />
  );
}
