import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { tierFor } from "@/lib/billing";
import SignIn from "@/components/SignIn";
import Upgrade from "@/components/Upgrade";
import LaunchJob from "@/components/LaunchJob";

export default async function AppPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return (
      <main>
        <SignIn />
      </main>
    );
  }

  const tier = tierFor(getDb(), email);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <h1 className="text-2xl font-bold">Signed in as {email}</h1>
      <p className="mt-1 text-neutral-400">Plan: {tier}</p>
      <div className="mt-6 max-w-md space-y-8">
        <LaunchJob />
        <Upgrade />
      </div>
    </main>
  );
}
