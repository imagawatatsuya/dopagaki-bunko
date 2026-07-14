export function bindReaderScaleControls(root, onSelectScale) {
  root.querySelectorAll('[data-reader-scale]').forEach((button) => {
    button.addEventListener('click', () => {
      onSelectScale(button.dataset.readerScale);
    });
  });
}

export function bindDetailActions(root, onAction) {
  root.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.action, button.dataset.fragmentId);
    });
  });
}

export function bindCollectionActions(root, onAction) {
  root.querySelectorAll('[data-collection-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.collectionKind, button.dataset.recordId, button.dataset.collectionAction);
    });
  });
}

export function bindWorkOverlayActions(root, onCycleMarker) {
  root.querySelectorAll('[data-work-action="cycle-marker"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await onCycleMarker(button.dataset.fragmentId);
    });
  });
}

export function bindWorkHeaderActions(root, onAction) {
  root.querySelectorAll('[data-work-header-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.workHeaderAction);
    });
  });
}

export function bindWorkStateActions(root, onAction) {
  root.querySelectorAll('[data-work-state-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.workStateAction);
    });
  });
}

export function bindLibraryWorkActions(root, onAction) {
  const menus = [...root.querySelectorAll('[data-library-menu]')];
  let openMenu = null;

  function closeMenu(menu) {
    if (!menu) {
      return;
    }

    menu.classList.remove('is-open');
    const button = menu.querySelector('[data-library-action="toggle-menu"]');
    button?.setAttribute('aria-expanded', 'false');
    if (openMenu === menu) {
      openMenu = null;
    }
  }

  function openMenuFor(menu) {
    if (openMenu && openMenu !== menu) {
      closeMenu(openMenu);
    }

    menu.classList.add('is-open');
    const button = menu.querySelector('[data-library-action="toggle-menu"]');
    button?.setAttribute('aria-expanded', 'true');
    openMenu = menu;
  }

  const handleClick = (event) => {
    const toggleButton = event.target.closest('[data-library-action="toggle-menu"]');
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const menu = toggleButton.closest('[data-library-menu]');
      if (!menu) {
        return;
      }

      if (menu.classList.contains('is-open')) {
        closeMenu(menu);
      } else {
        openMenuFor(menu);
      }
      return;
    }

    const deleteButton = event.target.closest('[data-library-action="delete-work"]');
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(deleteButton.closest('[data-library-menu]'));
      void onAction('delete-work', deleteButton.dataset.workId);
      return;
    }

    const unreadButton = event.target.closest('[data-library-action="mark-unread"]');
    if (unreadButton) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(unreadButton.closest('[data-library-menu]'));
      void onAction('mark-unread', unreadButton.dataset.workId);
      return;
    }

    if (openMenu && !event.target.closest('[data-library-menu]')) {
      closeMenu(openMenu);
    }
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape' && openMenu) {
      closeMenu(openMenu);
    }
  };

  root.addEventListener('click', handleClick);
  root.addEventListener('keydown', handleKeydown);

  const linkCleanups = [];
  menus.forEach((menu) => {
    const link = menu.querySelector('.panel-link-library-work');
    if (!link) {
      return;
    }

    const handleLinkClick = () => {
      closeMenu(menu);
    };
    link.addEventListener('click', handleLinkClick);
    linkCleanups.push(() => {
      link.removeEventListener('click', handleLinkClick);
    });
  });

  return () => {
    root.removeEventListener('click', handleClick);
    root.removeEventListener('keydown', handleKeydown);
    linkCleanups.forEach((cleanup) => cleanup());
  };
}

export function bindSearchInteractions(root, { onSelectFile, onDropFile, onAction }) {
  const input = root.querySelector('[data-search-input="aozora-file"]');
  const catalogQueryInput = root.querySelector('[data-search-input="catalog-query"]');
  const remoteImportUrlInput = root.querySelector('[data-search-input="remote-import-url"]');
  const importTextInput = root.querySelector('[data-search-input="import-text"]');
  const converterBaseUrlInput = root.querySelector('[data-search-input="converter-base-url"]');
  const dropzone = root.querySelector('[data-dropzone="aozora-zip"]');

  if (input) {
    input.addEventListener('change', async (event) => {
      await onSelectFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }

  if (dropzone) {
    dropzone.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      input?.click();
    });
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-dragover');
    });
    dropzone.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
      await onDropFile(event.dataTransfer?.files?.[0] ?? null);
    });
  }

  if (catalogQueryInput) {
    catalogQueryInput.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      await onAction('search-aozora-catalog', {
        query: catalogQueryInput.value
      });
    });
  }

  root.querySelectorAll('[data-search-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.searchAction, {
        query: catalogQueryInput?.value ?? '',
        remoteImportUrl: remoteImportUrlInput ? remoteImportUrlInput.value : undefined,
        pastedText: importTextInput ? importTextInput.value : undefined,
        baseUrl: converterBaseUrlInput ? converterBaseUrlInput.value : undefined
      });
    });
  });
}

export function bindSettingsInteractions(root, { onAction, onImportFile, onTextExportFile = async () => {}, onTextDriveExportFile = async () => {} }) {
  root.querySelectorAll('[data-settings-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onAction(button.dataset.settingsAction);
    });
  });

  const importInput = root.querySelector('[data-settings-input="import-json"]');
  if (importInput) {
    importInput.addEventListener('change', async (event) => {
      await onImportFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }

  const textExportInput = root.querySelector('[data-settings-input="export-texts-json"]');
  if (textExportInput) {
    textExportInput.addEventListener('change', async (event) => {
      await onTextExportFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }

  const textDriveExportInput = root.querySelector('[data-settings-input="export-texts-drive-json"]');
  if (textDriveExportInput) {
    textDriveExportInput.addEventListener('change', async (event) => {
      await onTextDriveExportFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }
}

export function focusFragmentCard(root, fragmentId) {
  if (!fragmentId) {
    return;
  }

  const selector = `[data-fragment-id="${CSS.escape(fragmentId)}"]`;
  const element = root.querySelector(selector);
  if (!element) {
    return;
  }

  const headerBottom = root.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
  const elementTop = window.scrollY + element.getBoundingClientRect().top;
  const targetTop = Math.max(0, elementTop - headerBottom - 8);
  window.scrollTo({ top: targetTop, left: 0, behavior: 'auto' });
  element.classList.add('is-focused-fragment');
  setTimeout(() => {
    element.classList.remove('is-focused-fragment');
  }, 1800);
}

export function updateWorkOverlayButton(button, overlayState, ariaLabel) {
  button.classList.remove('is-idle', 'is-bookmark', 'is-like');
  button.classList.add(`is-${overlayState}`);
  button.setAttribute('aria-pressed', overlayState === 'idle' ? 'false' : 'true');
  button.setAttribute('aria-label', ariaLabel);
}

export function bindWorkHeaderProgress(root, totalTextFragments, getRemainingPercent, onActiveIndexChange = null) {
  const currentNode = root.querySelector('[data-work-progress-current]');
  const totalNode = root.querySelector('[data-work-progress-total]');
  const remainingNode = root.querySelector('[data-work-progress-remaining]');
  const initialCards = root.querySelectorAll('[data-work-fragment-index]');

  if (!currentNode || !totalNode || !remainingNode || initialCards.length === 0) {
    return null;
  }

  totalNode.textContent = String(totalTextFragments);

  const readCurrentIndex = () => {
    const cards = root.querySelectorAll('[data-work-fragment-index]');
    if (cards.length === 0) {
      return;
    }
    const headerBottom = root.querySelector('.page-header')?.getBoundingClientRect().bottom ?? 0;
    let activeIndex = Number(cards[0].dataset.workFragmentIndex || 1);

    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const index = Number(card.dataset.workFragmentIndex || activeIndex);

      if (rect.top <= headerBottom + 12) {
        activeIndex = index;
        continue;
      }

      const distance = rect.top - (headerBottom + 12);
      if (distance < Math.max(rect.height * 0.5, 80)) {
        activeIndex = index;
      }
      break;
    }

    currentNode.textContent = String(activeIndex);
    remainingNode.textContent = String(getRemainingPercent(activeIndex, totalTextFragments));
    onActiveIndexChange?.(activeIndex);
  };

  let frameRequested = false;
  const scheduleUpdate = () => {
    if (frameRequested) {
      return;
    }
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      readCurrentIndex();
    });
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  scheduleUpdate();

  return () => {
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
  };
}

export function bindWorkAutoLoad(root, { enabled, shownTextCount, totalTextFragments, onIntersect }) {
  if (!enabled || shownTextCount >= totalTextFragments) {
    return null;
  }

  const sentinel = root.querySelector('[data-work-auto-load-sentinel]');
  if (!sentinel) {
    return null;
  }

  let triggered = false;
  let frameRequested = false;
  let lastScrollY = window.scrollY;
  const cleanup = () => {
    window.removeEventListener('scroll', handleScroll);
  };
  const checkSentinel = () => {
    frameRequested = false;
    if (triggered || !sentinel.isConnected) {
      return;
    }
    const rect = sentinel.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (rect.top > viewportHeight + 320 || rect.bottom < 0) {
      return;
    }
    triggered = true;
    cleanup();
    onIntersect();
  };
  const handleScroll = () => {
    const currentScrollY = window.scrollY;
    const movingDown = currentScrollY > lastScrollY + 2;
    lastScrollY = currentScrollY;
    if (!movingDown || frameRequested || triggered) {
      return;
    }
    frameRequested = true;
    requestAnimationFrame(checkSentinel);
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  return cleanup;
}
