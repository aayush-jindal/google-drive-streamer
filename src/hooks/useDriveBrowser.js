import { useState, useCallback, useRef } from 'react';

/**
 * Manages Drive folder navigation state.
 * Fetches file listings from the /api/list-files serverless function.
 * breadcrumbs: [{ id, name }, ...]  — first entry is always My Drive root.
 */
export function useDriveBrowser() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);

  const breadcrumbsRef = useRef(breadcrumbs);
  breadcrumbsRef.current = breadcrumbs;

  const loadFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/list-files?folderId=${encodeURIComponent(folderId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }
      const items = await res.json();
      setFiles(items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const initialize = useCallback(() => {
    setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
    loadFolder('root');
  }, [loadFolder]);

  /** Navigate into a subfolder. */
  const navigateTo = useCallback(
    (folder) => {
      setBreadcrumbs((prev) => {
        // Guard against double-navigation (e.g. keydown + click firing together)
        if (prev[prev.length - 1]?.id === folder.id) return prev;
        return [...prev, { id: folder.id, name: folder.name }];
      });
      loadFolder(folder.id);
    },
    [loadFolder],
  );

  /**
   * Go up one level.
   * Returns true if navigation happened, false if already at root.
   */
  const navigateBack = useCallback(() => {
    const crumbs = breadcrumbsRef.current;
    if (crumbs.length <= 1) return false;
    const newCrumbs = crumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    loadFolder(newCrumbs[newCrumbs.length - 1].id);
    return true;
  }, [loadFolder]);

  /** Jump to a specific breadcrumb by index. */
  const navigateToCrumb = useCallback(
    (index) => {
      const crumbs = breadcrumbsRef.current;
      const newCrumbs = crumbs.slice(0, index + 1);
      setBreadcrumbs(newCrumbs);
      loadFolder(newCrumbs[newCrumbs.length - 1].id);
    },
    [loadFolder],
  );

  return {
    files,
    loading,
    error,
    breadcrumbs,
    initialize,
    navigateTo,
    navigateBack,
    navigateToCrumb,
  };
}
