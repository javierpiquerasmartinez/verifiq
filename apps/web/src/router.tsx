import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { currentUser } from './auth-client';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { HomePage } from './pages/Home';
import { InvitationPage } from './pages/Invitation';
import { LoginPage } from './pages/Login';
import { ResetPasswordPage } from './pages/ResetPassword';
import { SetUpTwoFactorPage } from './pages/SetUpTwoFactor';

const rootRoute = createRootRoute({ component: Outlet });

/** The app: needs a session with 2FA set up. */
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: async () => {
    const user = await currentUser();
    if (!user) throw redirect({ to: '/entrar' });
    if (!user.twoFactorEnabled) throw redirect({ to: '/configurar-2fa' });
    return { user };
  },
  component: HomePage,
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
