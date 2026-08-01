export const DEFAULT_STOREFRONT_REELS = [
  {
    id: "reel-1",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-1.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZpH3I5zHhG/",
  },
  {
    id: "reel-2",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-2.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZmkorVTpo6/",
  },
  {
    id: "reel-3",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-3.mp4",
    instagramUrl: "https://www.instagram.com/reel/DZj_Ohlz1MO/",
  },
  {
    id: "reel-4",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-4.mp4",
    instagramUrl: "https://www.instagram.com/p/DZwhemdTEO_/",
  },
  {
    id: "reel-5",
    videoUrl: "https://images.urbanaana.com/urban-aana/reels/reel-5.mp4",
    instagramUrl: "https://www.instagram.com/p/DaR85YJTCxh/",
  },
];

export function normalizeStorefrontReels(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list
    .map((item, index) => ({
      id: String(item?.id || item?.name || `reel-${index + 1}`),
      videoUrl: String(item?.videoUrl || item?.url || "").trim(),
      altText: String(item?.altText || "").trim(),
      instagramUrl: String(item?.instagramUrl || "").trim(),
    }))
    .filter((item) => item.videoUrl);
}
