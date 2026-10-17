import { LoginForm } from '@/components/auth/login-form';

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            Active Operations
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Administrator sign in</h1>
          <p className="mt-2 text-sm text-slate-300">
            Use your staff email and password. Mobile phone OTP accounts do not receive dashboard
            access unless provisioned by a Super Admin.
          </p>
        </div>
        <LoginForm nextPath={params.next} sessionError={params.error === 'session'} />
      </div>
    </div>
  );
}
