import AboutSection from "@/components/storefront/AboutSection";

export const metadata = {
  title: "About Us",
  description:
    "Urban Aana — redefining street culture through authentic design and uncompromising quality. Premium streetwear inspired by Kerala and modern urban culture.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <AboutSection />
    </main>
  );
}
