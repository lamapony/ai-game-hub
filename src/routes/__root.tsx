import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { eventProfile } from "@/lib/event-profile";

import appCss from "../styles.css?url";
import criticalLandingCss from "../styles/landing-critical.css?raw";

const publicOrigin =
  import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ai-game-hub-tau.vercel.app";
const shareImageUrl = `${publicOrigin}/og/dimas-fest-share.jpg`;
const displayFontHref = "/assets/fonts/lemurmure-regular.woff2";

// The full stylesheet is large enough to hold up the hero title on a slow phone.
// Paint the landing from the inline sheet, then apply the full sheet without blocking LCP.
const deferredStylesheetBoot = `
  (function () {
    var link = document.getElementById("agh-app-css");
    if (!link) return;
    var apply = function () { link.media = "all"; };
    if (link.sheet) apply();
    else link.addEventListener("load", apply, { once: true });
  })();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&apos;t exist. Check the link or head back home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to {eventProfile.title}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error("Root route error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Page failed to load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Back to {eventProfile.title}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: eventProfile.seo.title },
      {
        name: "description",
        content: eventProfile.seo.description,
      },
      { name: "theme-color", content: "#0c2a1c" },
      { name: "application-name", content: eventProfile.title },
      { name: "apple-mobile-web-app-title", content: eventProfile.title },
      { property: "og:site_name", content: eventProfile.title },
      { property: "og:title", content: eventProfile.title },
      {
        property: "og:description",
        content: eventProfile.seo.ogDescription,
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: publicOrigin },
      { property: "og:image", content: shareImageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      {
        property: "og:image:alt",
        content:
          "DIMAS fest. A tactile party scene with a map, camera, recorder and cards on a dark green table",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: shareImageUrl },
    ],
    links: [
      {
        rel: "preload",
        href: displayFontHref,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icons/dimas-fest-180.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const link = document.getElementById("agh-app-css");
    if (link instanceof HTMLLinkElement) link.media = "all";
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <style
          id="agh-critical-fallback"
          dangerouslySetInnerHTML={{ __html: criticalLandingCss }}
        />
        <link id="agh-app-css" rel="stylesheet" href={appCss} media="print" />
        <script dangerouslySetInnerHTML={{ __html: deferredStylesheetBoot }} />
        <noscript>
          <link rel="stylesheet" href={appCss} />
        </noscript>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
