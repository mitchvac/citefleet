export function BrandLogo({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/favicon.png"
      srcSet="/favicon.png 64w, /apple-touch-icon.png 180w"
      sizes={`${size}px`}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={`block shrink-0 object-contain ${className}`.trim()}
    />
  );
}
