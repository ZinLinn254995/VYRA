export type PublicRoute = 'workspace' | 'welcome' | 'login' | 'signup' | 'forgot-password' | 'reset-password' | 'onboarding';

export function navigateVYRA(route: PublicRoute) {
  const url = route === 'workspace'
    ? window.location.pathname
    : route === 'reset-password'
      ? `${window.location.pathname}?auth=reset`
      : `${window.location.pathname}#/${route}`;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
