import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="app-main flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </main>
  );
}
