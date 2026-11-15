import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Think Digital Solutions",
    short_name: "Think Digital Solutions",
    description: "Sales, inventory, accounting, and operations in one workspace.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0b3b91",
    orientation: "any",
    icons: [
      { src: "/thinksales-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
