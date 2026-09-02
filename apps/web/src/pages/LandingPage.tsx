import { BarChart3, Gauge, Globe2, Link2, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";

const FEATURES = [
  {
    icon: Zap,
    title: "Cache-first redirects",
    description:
      "Redis-backed redirects that resolve in milliseconds, with a safe PostgreSQL fallback — never wrong, only occasionally slower.",
  },
  {
    icon: BarChart3,
    title: "Real click analytics",
    description:
      "A live timeline, top referrers, device/browser split, and approximate geography for every link — queryable over any date range.",
  },
  {
    icon: Gauge,
    title: "Analytics never slows a redirect",
    description:
      "Click enrichment runs on a separate queue and worker. Your visitor's redirect ships before that work even starts.",
  },
  {
    icon: Lock,
    title: "Privacy-conscious by design",
    description:
      "Raw visitor IPs are never stored — only an HMAC hash. City-level geography is suppressed below a small event threshold.",
  },
  {
    icon: Link2,
    title: "Custom aliases, smart dedupe",
    description:
      "Pick your own short code or let one be generated. Shortening the same destination twice returns your existing link.",
  },
  {
    icon: ShieldCheck,
    title: "Built for production",
    description:
      "Structured logs, rate limiting, health checks, and a fully containerized deployment — verified end to end, not assumed.",
  },
];

const STEPS = [
  {
    title: "Paste your link",
    description: "Drop in any long URL. Add a custom alias or an expiry date if you want one.",
  },
  {
    title: "Share the short link",
    description: "Your ZipLink URL works everywhere — social bios, emails, print, anywhere.",
  },
  {
    title: "Watch it get clicked",
    description: "See clicks arrive in real time, broken down by referrer, device, and location.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-[15px] font-semibold text-text">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            ZipLink
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-subtle hover:text-text"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-control)] bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-colors hover:bg-accent-hover"
            >
              Sign up free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <div className="mx-auto mb-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Short links with real analytics behind them
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-text sm:text-5xl">
            Shorten links. Track every click.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-text-muted sm:text-lg">
            ZipLink turns long URLs into short, shareable links — and shows you exactly who's
            clicking them, without ever slowing the redirect down to do it.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-accent px-6 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-colors hover:bg-accent-hover"
            >
              Create your free account
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-6 py-2.5 text-sm font-medium text-text shadow-[var(--shadow-card)] transition-colors hover:bg-surface-subtle"
            >
              Try it without an account
            </Link>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            No credit card required. Anonymous link creation works too — accounts just make it
            easier to keep track of everything in one place.
          </p>
        </section>

        <section className="border-y border-border bg-surface-subtle/40 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-text">
              Everything you need to run links seriously
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <feature.icon className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold text-text">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-text-muted">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-text">
            How it works
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-text">{step.title}</h3>
                <p className="mt-1.5 text-sm text-text-muted">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-surface-subtle/40 py-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 text-center sm:px-6">
            <Globe2 className="h-8 w-8 text-accent" aria-hidden="true" />
            <h2 className="text-2xl font-semibold tracking-tight text-text">
              Ready to see where your clicks come from?
            </h2>
            <p className="text-sm text-text-muted">
              Create a free account to keep every link you make organized in one dashboard.
            </p>
            <Link
              to="/signup"
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-accent px-6 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-card)] transition-colors hover:bg-accent-hover"
            >
              Sign up free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-text-muted sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} ZipLink</span>
          <Link to="/dashboard" className="hover:text-text">
            Continue without an account →
          </Link>
        </div>
      </footer>
    </div>
  );
}
