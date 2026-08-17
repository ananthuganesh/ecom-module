import { notFound } from "next/navigation";

export default function DevOnlyLayout({ children }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
