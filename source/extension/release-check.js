// Check on popup open through the same backend used by Settings and installation.
// No separate GitHub API quota, external host permission or background scheduler.
const RefTrayUpdates = (() => {
  const day = 24 * 60 * 60 * 1000;

  function versionParts(value) {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
    return match && match.slice(1).map(Number);
  }

  function newer(remote, local) {
    const next = versionParts(remote), current = versionParts(local);
    if (!next || !current) return false;
    for (let index = 0; index < next.length; index++) {
      if (next[index] !== current[index]) return next[index] > current[index];
    }
    return false;
  }

  async function check(currentVersion) {
    const storage = chrome.storage.local;
    const {releaseCheck = {}, releaseIgnored, releaseLater} =
      await storage.get(['releaseCheck', 'releaseIgnored', 'releaseLater']);
    let latest = releaseCheck.latest;
    if (releaseCheck.source !== 'backend-feed' || !(Date.now() < releaseCheck.nextCheck)) {
      let retryAt=Date.now()+3600000;
      try {
        const release = await Hub.api('/updates/check');
        if (typeof release.available !== 'boolean' || release.available && !versionParts(release.version)) {
          throw new Error('Unexpected release metadata');
        }
        latest = release.available ? {version:'v'+release.version.replace(/^v/,''),notes:String(release.notes || '').slice(0,1200)} : null;
        await storage.set({releaseCheck:{source:'backend-feed',latest,nextCheck:Date.now()+day}});
      } catch (error) {
        if(Number.isFinite(error.retryAt))retryAt=Math.max(retryAt,error.retryAt);
        await storage.set({releaseCheck:{source:'backend-feed',latest:latest || null,nextCheck:retryAt,
          error:String(error.message).slice(0,120)}});
      }
    }
    if (latest && newer(latest.version,currentVersion) && latest.version !== releaseIgnored &&
        !(latest.version === releaseLater?.version && Date.now() < releaseLater.until)) return latest;
    return null;
  }

  async function notify(currentVersion, isBusy) {
    const release = await check(currentVersion);
    if (!release || isBusy() || document.querySelector('dialog[open]')) return;
    const panel = document.querySelector('#release-notice');
    panel.querySelector('strong').textContent = UI.t('发现新版')+' '+release.version;
    panel.querySelector('p').textContent = release.notes;
    const update=panel.querySelector('[data-update]');
    if(update)update.dataset.version=release.version;
    panel.querySelector('[data-later]').onclick = async () => {
      panel.close();
      await chrome.storage.local.set({releaseLater:{version:release.version,until:Date.now()+day}});
    };
    panel.querySelector('[data-ignore]').onclick = async () => {
      panel.close();
      await chrome.storage.local.set({releaseIgnored:release.version});
    };
    panel.show();
  }
  return {check,notify,newer};
})();
