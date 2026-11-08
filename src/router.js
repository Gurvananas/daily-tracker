// Minimal hash router glue so views can ask for a re-render without importing app.js.

let renderer = null;

export const setRenderer = (fn) => {
  renderer = fn;
};

/** Re-render the current route, keeping the scroll position. */
export const rerender = () => renderer?.({ keepScroll: true });

export const navigate = (hash) => {
  if (location.hash === hash) rerender();
  else location.hash = hash;
};
