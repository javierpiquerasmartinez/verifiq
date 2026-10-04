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
import { DraftPage, NewDraftPage } from './pages/Draft';
import { DraftPreviewPage } from './pages/DraftPreview';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { HomePage } from './pages/Home';
import { InvitationPage } from './pages/Invitation';
import { LoginPage } from './pages/Login';
import { OnboardingPage } from './pages/Onboarding';
import { NewRecipientPage, RecipientPage } from './pages/Recipient';
import { RecipientsPage } from './pages/Recipients';
import { RepresentationStepPage } from './pages/RepresentationStep';
import { ResetPasswordPage } from './pages/ResetPassword';
import { SettingsPage } from './pages/Settings';
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
async function requireOnboardedUser() {
  const user = await requireActiveUser();
  const { step } = await fetchOnboarding();
  if (step !== 'completed') throw redirect({ to: '/onboarding' });
  return { user };
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: requireOnboardedUser,
  component: HomePage,
});

const newDraftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts/new',
  beforeLoad: requireOnboardedUser,
  component: NewDraftPage,
});

const draftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts/$draftId',
  beforeLoad: requireOnboardedUser,
  component: DraftPage,
});

const draftPreviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/drafts/$draftId/preview',
  beforeLoad: requireOnboardedUser,
  component: DraftPreviewPage,
});

const recipientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipients',
  beforeLoad: requireOnboardedUser,
  component: RecipientsPage,
});

const newRecipientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipients/new',
  beforeLoad: requireOnboardedUser,
  component: NewRecipientPage,
});

const recipientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipients/$recipientId',
  beforeLoad: requireOnboardedUser,
  component: RecipientPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  beforeLoad: requireOnboardedUser,
  component: SettingsPage,
});

/** Onboarding step 5: signing the Representation, reachable any time after onboarding. */
const representationStepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding/representation',
  beforeLoad: requireOnboardedUser,
  component: RepresentationStepPage,
});

/** Issuer onboarding: resumable wizard, reachable until it is complete. */
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  beforeLoad: async () => {
    await requireActiveUser();
    const { step } = await fetchOnboarding();
    if (step === 'completed') throw redirect({ to: '/onboarding/representation' });
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
  newDraftRoute,
  draftRoute,
  draftPreviewRoute,
  recipientsRoute,
  newRecipientRoute,
  recipientRoute,
  settingsRoute,
  onboardingRoute,
  representationStepRoute,
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
