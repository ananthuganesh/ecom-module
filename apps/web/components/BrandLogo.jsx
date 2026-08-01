import Image from "next/image";
import Link from "next/link";

/**
 * Urban Aana wordmark — shown as provided (no filters / no chip).
 */
export default function BrandLogo({
  href = "/",
  className = "",
  height = 28,
  priority = false,
}) {
  const width = Math.round((height * 130) / 59);

  const img = (
    <Image
      src="/urban/Logo.png"
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
