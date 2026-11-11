// Check on popup open. Chrome handles proxy routing and offline errors.
// Only the official repository is contacted; no page or collection data is sent.
const RefTrayUpdates = (() => {
  const day = 24 * 60 * 60 * 1000;
  const latestUrl = 'https://api.github.com/repos/iiiiivy123/inspiration-collector/releases/latest';

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
    if (!(Date.now() < releaseCheck.nextCheck)) {
      let retryAt=Date.now()+3600000;
      try {
        const response = await fetch(latestUrl, {credentials:'omit',referrerPolicy:'no-referrer',
          signal:AbortSignal.timeout(5000),headers:{Accept:'application/vnd.github+json'}});
        if (!response.ok) {
          if(response.status===403||response.status===429){
            const reset=Number(response.headers?.get('x-ratelimit-reset'))*1000;
            const delay=response.headers?.get('retry-after');
            const after=delay && /^\d+$/.test(delay)?Date.now()+Number(delay)*1000:Date.parse(delay||'');
            const deadline=Math.max(reset||0,after||0);
            if(Number.isFinite(deadline)&&deadline>Date.now())retryAt=deadline;
          }
          throw new Error('HTTP ' + response.status);
        }
        const release = await response.json();
        if (release.draft || release.prerelease || !versionParts(release.tag_name)) {
          throw new Error('Unexpected release metadata');
        }
        latest = {version:release.tag_name,notes:String(release.body || release.name || '').slice(0,1200)};
        await storage.set({releaseCheck:{latest,nextCheck:Date.now()+day}});
      } catch (error) {
        await storage.set({releaseCheck:{latest:latest || null,nextCheck:retryAt,
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
