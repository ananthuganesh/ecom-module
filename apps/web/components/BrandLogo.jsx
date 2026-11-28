import Image from "next/image";
import Link from "next/link";

/**
 * Urban Aana wordmark.
 * - variant="light" → for light backgrounds (dark AANA)
 * - variant="dark"  → for dark backgrounds (white AANA)
 */
export default function BrandLogo({
  href = "/",
  className = "",
  height = 28,
  priority = false,
  variant = "light",
}) {
  const width = Math.round((height * 1558) / 708);
  const src = variant === "dark" ? "/urban/logo-dark.png" : "/urban/logo.png";

  const img = (
    <Image
      src={src}
      alt="Urban Aana"
      width={width}
      height={height}
      priority={priority}
      className={`object-contain ${className}`.trim()}
      style={{ height, width: "auto" }}
    />
  );

  if (!href) return img;
  return (
    <Link href={href} className="inline-flex items-center shrink-0" aria-label="Urban Aana home">
      {img}
    </Link>
  );
}
