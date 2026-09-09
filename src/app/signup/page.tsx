import Link from "next/link";
import { signUp } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-gold">
            ElonHub OS
          </span>
        </div>

        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text">Create your account</h1>
        <p className="mb-8 text-sm text-text-dim">
          The first account created becomes the workspace admin.
        </p>

        {error && (
          <div className="mb-5 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <form action={signUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="full_name" className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-faint">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              autoComplete="name"
              className="rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>
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
              className="rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-gold"
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
              minLength={8}
              autoComplete="new-password"
              className="rounded-lg border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-lg bg-gold-bright px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-text-faint">
          Already have an account?{" "}
          <Link href="/login" className="text-gold-bright hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
