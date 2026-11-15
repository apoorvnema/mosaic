// The MV3 service worker. It will own the context menus, the capture command and
// flushing the offline queue to the relay. For now it only proves the wiring.
chrome.runtime.onInstalled.addListener((details) => {
  console.info(`[mosaic] extension ${details.reason}`);
});

export {};
