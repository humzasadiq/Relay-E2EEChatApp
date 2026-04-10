import Link from "next/link";
import { RelayLogo } from "../_components/relay-logo";
import { AuthForm } from "../_components/auth-form";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <RelayLogo size={52} />
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
        </div>

        <AuthForm mode="signup" />

        <p className="text-xs text-center text-muted">
          Already have one?{" "}
          <Link
            href="/login"
            className="text-primary underline underline-offset-4"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
