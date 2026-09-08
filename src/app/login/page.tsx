import Link from "next/link";
import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-gold">
            ElonHub OS
          </span>
        </div>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text">Sign in</h1>
        <p className="mb-8 text-sm text-text-dim">Elon Hub's internal operating system.</p>

        {error && (
          <div className="mb-5 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={signIn} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-faint">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-faint">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-gold px-4 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-gold-bright"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-sm text-text-faint">
          No account yet?{" "}
          <Link href="/signup" className="text-gold-bright hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
