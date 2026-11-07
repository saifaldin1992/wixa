// public/shared.js is written for the browser (it sets window.WIXA). On the server the global object stands in for window.
globalThis.window ??= globalThis;
