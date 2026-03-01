'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SignupForm, type SignupResult } from '@/components/auth/signup-form';

/**
 * Owner signup page.
 *
 * Hosts the SignupForm, stores the user session in localStorage (dev pattern —
 * replace with Better Auth session management once auth is integrated), and
 * redirects to /dashboard after successful signup.
 */
export default function SignupPage() {
  const router = useRouter();

  const handleSuccess = useCallback(
    (data: SignupResult) => {
      // TODO: Replace localStorage with Better Auth session once auth is integrated.
      localStorage.setItem('dev_user_id', data.userId);
      localStorage.setItem('dev_organization_id', data.organizationId);
      localStorage.setItem('dev_user_role', data.role);

      router.push('/dashboard');
    },
    [router],
  );

  const handleSignInClick = useCallback(() => {
    router.push('/login');
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">QA Suite</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom AI-native QA Suite for Fruition
        </p>
      </div>

      <SignupForm onSuccess={handleSuccess} onSignInClick={handleSignInClick} />
    </main>
  );
}
