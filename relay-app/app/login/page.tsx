import Link from "next/link";
import { RelayLogo } from "../_components/relay-logo";
import { AuthForm } from "../_components/auth-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <RelayLogo size={52} />
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
        </div>

        <AuthForm mode="login" />

        <p className="text-xs text-center text-muted">
          No account?{" "}
          <Link
            href="/signup"
            className="text-primary underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
