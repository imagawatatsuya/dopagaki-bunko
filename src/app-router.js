import { parseHashRoute, parseSearchRouteIntent } from './router.js?v=20260720203109';

export function createAppRouter({
  getRenderers,
  scrollToPageTop,
  ensureAozoraCatalogReady,
  applySearchRouteIntent
}) {
  return function route() {
    const hash = location.hash || '#/';
    const routeState = parseHashRoute(hash);
    const renderers = getRenderers();

    if (routeState.path.startsWith('#/fragment/')) {
      scrollToPageTop();
      renderers.renderFragment(decodeURIComponent(routeState.path.replace('#/fragment/', '')), {
        returnTo: routeState.params.get('returnTo') || ''
      });
      return;
    }

    if (routeState.path.startsWith('#/work/')) {
      renderers.renderWorkPage(decodeURIComponent(routeState.path.replace('#/work/', '')), {
        from: routeState.params.get('from'),
        visible: routeState.params.get('visible'),
        focus: routeState.params.get('focus') || ''
      });
      return;
    }

    if (routeState.path.startsWith('#/collection/')) {
      renderers.renderCollectionPage(decodeURIComponent(routeState.path.replace('#/collection/', '')), {
        workId: routeState.params.get('workId') || ''
      });
      return;
    }

    switch (routeState.path) {
      case '#/library':
        scrollToPageTop();
        renderers.renderLibrary({
          tab: routeState.params.get('tab') || ''
        });
        break;
      case '#/search':
        applySearchRouteIntent(parseSearchRouteIntent(hash));
        scrollToPageTop();
        renderers.renderSearch();
        void ensureAozoraCatalogReady();
        break;
      case '#/settings':
        scrollToPageTop();
        renderers.renderSettings();
        break;
      case '#/':
      default:
        if (!routeState.params.get('focus')) {
          scrollToPageTop();
        }
        renderers.renderHome({
          focusFragmentId: routeState.params.get('focus') || ''
        });
        break;
    }
  };
}
