import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThinkSales Pro",
    short_name: "ThinkSales",
    description: "Sales, inventory, accounting, and operations in one workspace.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0b3b91",
    orientation: "any",
    icons: [
      { src: "/thinksales-logo.jpeg", sizes: "192x192", type: "image/jpeg", purpose: "any" },
      { src: "/thinksales-logo.jpeg", sizes: "512x512", type: "image/jpeg", purpose: "any" },
    ],
  };
}
