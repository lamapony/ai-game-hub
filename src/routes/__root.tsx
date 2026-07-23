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

const publicOrigin =
  import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ai-game-hub-tau.vercel.app";
const shareImageUrl = `${publicOrigin}/og/ai-game-hub-share.jpg`;

// Keep the public landing readable when a privacy/reader browser drops external stylesheets.
// The authored stylesheet remains the source of truth and is loaded after this fallback.
const criticalLandingCss = `
  :root { color-scheme: light; }
  html, body { margin: 0; min-width: 320px; background: #112f2c; }
  body { color: #112f2c; font-family: Arial, Helvetica, sans-serif; }
  .agh-landing, .agh-landing * { box-sizing: border-box; }
  .agh-landing { min-height: 100vh; overflow-x: hidden; background: #fbe6a0; color: #112f2c; }
  .agh-landing a { color: inherit; text-decoration: none; }
  .agh-landing button, .agh-landing input { font: inherit; }
  .agh-masthead { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 76px; padding: 18px 4vw; border-bottom: 2px solid #112f2c; background: #fbe6a0; }
  .agh-brand { display: flex; align-items: flex-start; gap: 14px; }
  .agh-brand-name, .agh-display, .agh-venue-options strong, .agh-create-row > div > strong, .agh-footer strong { font-family: "Arial Narrow", Arial, sans-serif; font-weight: 800; text-transform: uppercase; }
  .agh-brand-name { font-size: 25px; line-height: .9; }
  .agh-brand-role { max-width: 128px; font-size: 10px; font-weight: 700; line-height: 1.05; }
  .agh-entry-nav { display: flex; gap: 24px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .agh-entry-nav a { padding: 8px 0; }
  .agh-hero { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, .75fr); gap: 36px; min-height: 650px; padding: 8vh 4vw 0; background: #fbe6a0; }
  .agh-hero-title-block { align-self: center; padding: 16px 0 36px; }
  .agh-hero-title { margin: 0; max-width: 920px; font-size: clamp(76px, 12vw, 190px); line-height: .9; }
  .agh-hero-venue-line { margin: 28px 0 0; font-size: 13px; font-weight: 800; }
  .agh-hero-copy { align-self: end; padding-bottom: 34px; }
  .agh-hero-copy > p { max-width: 420px; margin: 0; font-size: 19px; font-weight: 600; line-height: 1.25; }
  .agh-hero-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 30px 0 0; }
  .agh-hero-facts dt { font-size: 10px; font-weight: 800; text-transform: uppercase; }
  .agh-hero-facts dd { margin: 4px 0 0; font-size: 14px; font-weight: 700; }
  .agh-primary-link { grid-column: 2; display: flex; align-items: center; justify-content: space-between; min-height: 82px; padding: 20px 30px; background: #112f2c; color: #fbe6a0 !important; font-size: 35px; font-weight: 800; text-transform: uppercase; }
  .agh-story-track { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; min-height: 58px; margin: 32px -4vw 0; padding: 14px 4vw; background: #f48067; font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .agh-resume { display: grid; grid-template-columns: 1fr 1.4fr auto; align-items: center; gap: 24px; padding: 20px 4vw; background: #f48067; border-bottom: 2px solid #112f2c; }
  .agh-resume div { display: flex; flex-direction: column; gap: 4px; }
  .agh-resume span, .agh-resume p { margin: 0; font-size: 12px; font-weight: 700; }
  .agh-resume strong { font-size: 17px; }
  .agh-resume button { border: 0; padding: 12px 18px; background: #112f2c; color: #fbe6a0; font-weight: 800; }
  .agh-setup { background: #fbe6a0; border-bottom: 2px solid #112f2c; }
  .agh-setup-heading { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, .6fr); align-items: end; gap: 36px; padding: 8vh 4vw 5vh; }
  .agh-setup-heading h2, .agh-join-copy h2 { margin: 0; font-size: clamp(64px, 10vw, 150px); line-height: .92; }
  .agh-setup-heading p { max-width: 420px; margin: 0; font-size: 18px; font-weight: 600; line-height: 1.25; }
  .agh-venue-fieldset, .agh-duration-fieldset { min-width: 0; margin: 0; border: 0; padding: 0; }
  .agh-venue-fieldset legend, .agh-duration-fieldset legend, .agh-text-control > span, .agh-crowd-control b, .agh-story-control b { display: block; padding: 0 4vw 12px; font-size: 11px; font-weight: 800; }
  .agh-venue-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 2px solid #112f2c; border-bottom: 2px solid #112f2c; }
  .agh-venue-options button { display: flex; min-height: 184px; flex-direction: column; align-items: flex-start; gap: 10px; padding: 22px 2.5vw; border: 0; border-right: 2px solid #fbe6a0; background: #112f2c; color: #fbe6a0; text-align: left; cursor: pointer; }
  .agh-venue-options button:last-child { border-right: 0; }
  .agh-venue-options button.is-selected { box-shadow: inset 0 0 0 4px #f48067; }
  .agh-venue-number { font-size: 12px; font-weight: 900; }
  .agh-venue-options strong { max-width: 250px; font-size: clamp(27px, 3vw, 48px); line-height: .9; }
  .agh-venue-options strong + span { max-width: 290px; font-size: 13px; font-weight: 600; line-height: 1.3; }
  .agh-setup-controls { display: grid; grid-template-columns: 1.15fr 1fr 1.2fr; border-bottom: 2px solid #112f2c; }
  .agh-duration-fieldset, .agh-text-control, .agh-crowd-control { min-height: 170px; padding-top: 22px; border-right: 2px solid #112f2c; }
  .agh-crowd-control { border-right: 0; }
  .agh-duration-fieldset > div { display: grid; grid-template-columns: repeat(3, 1fr); padding: 8px 2.5vw 24px; }
  .agh-duration-fieldset button { min-height: 82px; border: 2px solid #112f2c; border-right: 0; background: transparent; color: #112f2c; cursor: pointer; }
  .agh-duration-fieldset button:last-child { border-right: 2px solid #112f2c; }
  .agh-duration-fieldset button.is-selected { background: #112f2c; color: #fbe6a0; }
  .agh-duration-fieldset button strong { display: block; font-size: 38px; }
  .agh-duration-fieldset button span { font-size: 10px; font-weight: 800; }
  .agh-text-control, .agh-crowd-control { display: block; }
  .agh-text-control input { width: calc(100% - 5vw); margin: 18px 2.5vw 24px; border: 0; border-bottom: 3px solid #112f2c; border-radius: 0; padding: 7px 0 10px; background: transparent; color: #112f2c; font-size: 33px; font-weight: 700; }
  .agh-crowd-control > span, .agh-story-control > span { display: flex; justify-content: space-between; gap: 12px; }
  .agh-crowd-control > span strong { padding-right: 2.5vw; font-size: 35px; }
  .agh-crowd-control input { width: calc(100% - 5vw); margin: 30px 2.5vw 0; accent-color: #f48067; }
  .agh-crowd-control > small { display: flex; justify-content: space-between; margin: 6px 2.5vw 0; font-size: 10px; font-weight: 800; }
  .agh-story-control { display: block; padding: 24px 4vw 30px; background: #f48067; border-bottom: 2px solid #112f2c; }
  .agh-story-control > span > small { font-size: 11px; font-weight: 800; }
  .agh-story-control input { width: 100%; margin-top: 18px; border: 0; border-bottom: 3px solid #112f2c; padding: 8px 0 12px; background: transparent; color: #112f2c; font-size: 22px; font-weight: 700; }
  .agh-story-control > small { display: block; max-width: 760px; margin-top: 10px; font-size: 11px; font-weight: 700; line-height: 1.35; }
  .agh-create-row { display: grid; grid-template-columns: .8fr 1.2fr; align-items: stretch; gap: 36px; padding: 36px 4vw; }
  .agh-create-row > div { display: flex; flex-direction: column; justify-content: center; gap: 6px; }
  .agh-create-row > div > span { font-size: 11px; font-weight: 800; }
  .agh-create-row > div > strong { font-size: clamp(30px, 4vw, 58px); line-height: .9; }
  .agh-create-row > div > small { font-size: 11px; font-weight: 700; }
  .agh-create-row > button, .agh-join-form > button { min-height: 112px; border: 0; padding: 20px 30px; background: #112f2c; color: #fbe6a0; font-size: clamp(30px, 4vw, 60px); font-weight: 800; text-transform: uppercase; cursor: pointer; }
  .agh-create-row > button:disabled, .agh-join-form > button:disabled { cursor: not-allowed; opacity: .55; }
  .agh-join { display: grid; grid-template-columns: .75fr 1.25fr; align-items: center; gap: 50px; padding: 8vh 4vw; background: #f48067; border-bottom: 2px solid #112f2c; }
  .agh-join-copy p { max-width: 420px; margin: 18px 0 0; font-size: 16px; font-weight: 700; line-height: 1.25; }
  .agh-join-form { display: grid; grid-template-columns: 1fr .7fr; align-items: start; }
  .agh-join-form > input { min-width: 0; height: 112px; border: 3px solid #112f2c; border-right: 0; padding: 8px 20px; background: #fbe6a0; color: #112f2c; font-size: clamp(48px, 6vw, 90px); font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .agh-join-form > button { min-height: 112px; }
  .agh-join-form > p { grid-column: 1 / -1; margin: 10px 0 0; font-size: 11px; font-weight: 800; }
  .agh-footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 110px; padding: 26px 4vw; background: #112f2c; color: #fbe6a0; }
  .agh-footer strong { font-size: clamp(34px, 4vw, 64px); line-height: .8; }
  .agh-footer span { max-width: 420px; font-size: 12px; font-weight: 700; text-align: right; }
  @media (max-width: 900px) {
    .agh-hero, .agh-setup-heading, .agh-join { grid-template-columns: 1fr; }
    .agh-hero { min-height: 0; padding-top: 52px; }
    .agh-hero-copy, .agh-primary-link { grid-column: 1; }
    .agh-hero-copy { padding-bottom: 0; }
    .agh-primary-link { margin-top: 28px; }
    .agh-story-track { margin-top: 40px; }
    .agh-venue-options { grid-template-columns: repeat(2, 1fr); }
    .agh-venue-options button:nth-child(2) { border-right: 0; }
    .agh-venue-options button:nth-child(-n + 2) { border-bottom: 2px solid #fbe6a0; }
    .agh-setup-controls, .agh-create-row { grid-template-columns: 1fr; }
    .agh-duration-fieldset, .agh-text-control { border-right: 0; border-bottom: 2px solid #112f2c; }
    .agh-create-row { gap: 24px; }
  }
  @media (max-width: 560px) {
    .agh-masthead, .agh-resume, .agh-footer { align-items: flex-start; flex-direction: column; }
    .agh-entry-nav { width: 100%; justify-content: space-between; }
    .agh-hero-title { font-size: clamp(62px, 18vw, 100px); }
    .agh-hero-facts { gap: 8px; }
    .agh-venue-options { grid-template-columns: 1fr; }
    .agh-venue-options button, .agh-venue-options button:nth-child(2) { min-height: 145px; border-right: 0; border-bottom: 2px solid #fbe6a0; }
    .agh-venue-options button:last-child { border-bottom: 0; }
    .agh-join-form { grid-template-columns: 1fr; }
    .agh-join-form > input { border-right: 3px solid #112f2c; }
    .agh-join-form > button { margin-top: 10px; }
    .agh-footer span { text-align: left; }
  }
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page doesn&apos;t exist — check the link or head back home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back home
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
            Back home
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
          "A tactile party scene with a map, camera, recorder and cards on a dark green table",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: shareImageUrl },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: criticalLandingCss }} />
        <HeadContent />
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
