import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { fetchOnboarding } from './api';
import { currentUser } from './auth-client';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { HomePage } from './pages/Home';
import { InvitationPage } from './pages/Invitation';
import { LoginPage } from './pages/Login';
import { OnboardingPage } from './pages/Onboarding';
import { ResetPasswordPage } from './pages/ResetPassword';
import { SetUpTwoFactorPage } from './pages/SetUpTwoFactor';

const rootRoute = createRootRoute({ component: Outlet });

/** A session with 2FA set up, or a redirect to what is missing. */
async function requireActiveUser() {
  const user = await currentUser();
  if (!user) throw redirect({ to: '/sign-in' });
  if (!user.twoFactorEnabled) throw redirect({ to: '/set-up-2fa' });
  return user;
}

/** The app: needs a session with 2FA set up and the issuer onboarding complete. */
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const user = await requireActiveUser();
    const { step } = await fetchOnboarding();
    if (step !== 'completed') throw redirect({ to: '/onboarding' });
    return { user };
  },
  component: HomePage,
});

/** Issuer onboarding: resumable wizard, reachable until it is complete. */
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  beforeLoad: async () => {
    await requireActiveUser();
    const { step } = await fetchOnboarding();
    if (step === 'completed') throw redirect({ to: '/' });
  },
  component: OnboardingPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: z.object({ reason: z.enum(['expired', 'reset']).optional() }),
  component: LoginPage,
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitation/$token',
  component: InvitationPage,
});

const setUpTwoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/set-up-2fa',
  beforeLoad: async () => {
    const user = await currentUser();
    if (!user) throw redirect({ to: '/sign-in' });
    if (user.twoFactorEnabled) throw redirect({ to: '/' });
  },
  component: SetUpTwoFactorPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  onboardingRoute,
  loginRoute,
  invitationRoute,
  setUpTwoFactorRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
