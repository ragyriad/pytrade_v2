import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="app-main flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
    </main>
  );
}
