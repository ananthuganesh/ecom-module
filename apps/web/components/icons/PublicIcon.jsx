"use client";

/**
 * Renders an SVG from /public/icons via CSS mask so it inherits text color (currentColor).
 * Pass `name` without the .svg extension, e.g. "icon-cart".
 */
export default function PublicIcon({
  name,
  className = "size-[18px]",
  style,
  size,
  active: _active,
  strokeWidth: _strokeWidth,
  ...props
}) {
  const sizeStyle =
    typeof size === "number"
      ? { width: size, height: size }
      : typeof size === "string"
        ? { width: size, height: size }
        : null;

  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        WebkitMask: `url(/icons/${name}.svg) center / contain no-repeat`,
        mask: `url(/icons/${name}.svg) center / contain no-repeat`,
        ...sizeStyle,
        ...style,
      }}
      {...props}
    />
  );
}

/** Factory matching lucide component API. */
export function createPublicIcon(name) {
  function Icon(props) {
    return <PublicIcon name={name} {...props} />;
  }
  Icon.displayName = name;
  return Icon;
}
