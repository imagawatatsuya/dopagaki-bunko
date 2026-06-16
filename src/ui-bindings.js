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
