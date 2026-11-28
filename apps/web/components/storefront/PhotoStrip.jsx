import ParallaxImage from "./ParallaxImage";

/** The Urban Aana community shoot, shown on the homepage and the About page. */
export const COMMUNITY_PHOTOS = [
  ["/images/about/about-what-we-make-1.webp", "Two people in red oversized Urban Aana tees on a city street"],
  ["/images/about/about-community-3.webp", "Back of the Urban Aana Indian Elephant oversized tee, worn in a forest"],
  ["/images/about/about-what-we-make-2.webp", "Close-up of the Urban Aana Keralathinayi oversized tee"],
];

/** Three photos, full width and edge to edge, with thin gaps and a gentle parallax. */
export default function PhotoStrip({ photos = COMMUNITY_PHOTOS, className = "" }) {
  return (
    <div className={`grid w-full grid-cols-3 gap-1 ${className}`.trim()}>
      {photos.map(([src, alt]) => (
        <ParallaxImage key={src} src={src} alt={alt} sizes="33vw" className="aspect-[4/5] bg-gray-100" />
      ))}
    </div>
  );
}
