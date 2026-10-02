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
  if (!user) throw redirect({ to: '/entrar' });
  if (!user.twoFactorEnabled) throw redirect({ to: '/configurar-2fa' });
  return user;
}

/** The app: needs a session with 2FA set up and the alta del Emisor complete. */
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const user = await requireActiveUser();
    const { step } = await fetchOnboarding();
    if (step !== 'completed') throw redirect({ to: '/alta' });
    return { user };
  },
  component: HomePage,
});

/** Alta del Emisor: resumable wizard, reachable until it is complete. */
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/alta',
  beforeLoad: async () => {
    await requireActiveUser();
    const { step } = await fetchOnboarding();
    if (step === 'completed') throw redirect({ to: '/' });
  },
  component: OnboardingPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entrar',
  validateSearch: z.object({ motivo: z.enum(['caducada', 'restablecida']).optional() }),
  component: LoginPage,
});

const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitacion/$token',
  component: InvitationPage,
});

const setUpTwoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configurar-2fa',
  beforeLoad: async () => {
    const user = await currentUser();
    if (!user) throw redirect({ to: '/entrar' });
    if (user.twoFactorEnabled) throw redirect({ to: '/' });
  },
  component: SetUpTwoFactorPage,
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recuperar',
  component: ForgotPasswordPage,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restablecer',
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
