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

export function bindCollectionActions(root, onRemove) {
  root.querySelectorAll('[data-collection-action="remove"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await onRemove(button.dataset.collectionKind, button.dataset.recordId);
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

export function bindLibraryWorkActions(root, onDeleteWork) {
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
      void onDeleteWork(deleteButton.dataset.workId);
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
  const input = root.querySelector('[data-search-input="aozora-zip"]');
  const catalogQueryInput = root.querySelector('[data-search-input="catalog-query"]');
  const dropzone = root.querySelector('[data-dropzone="aozora-zip"]');

  if (input) {
    input.addEventListener('change', async (event) => {
      await onSelectFile(event.target.files?.[0] ?? null);
      event.target.value = '';
    });
  }

  if (dropzone) {
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
        query: catalogQueryInput?.value ?? ''
      });
    });
  });
}

export function bindSettingsInteractions(root, { onAction, onImportFile }) {
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
}
