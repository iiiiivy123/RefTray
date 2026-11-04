# Pinterest bounded public-page validation — 2026-11-04

Code: source worker commit `4514b592ab6cc5afe9bea4f61deb10b1ed2f8b2d`, merged from review `98de3f2`; Pinterest adapter/helper identical to reviewed implementation.

Environment: installed Chrome, Playwright bundled runtime, headless fresh nonpersistent context. No user profile/window, app settings, user library, image downloads or retries. One navigation per Pin, navigation timeout 25 seconds; observation after DOMContentLoaded was 2 seconds.

| Page | Actual HTTP | Loaded result | Extractor result |
| --- | --- | --- | --- |
| User Pin 849843392234259030 | 200 | Login/signup wall, zero image nodes; 4 JSON scripts | zero images, blocked-state-media warning |
| Independently observed canonical Pin 304204149853900213 | 200 | Login/signup wall, zero image nodes; 4 JSON scripts; no exact-ID own-images object found in inspected state | zero images |

First Pin metadata canonical/og:url points to a different Pin, `https://au.pinterest.com/pin/blue-and-white-character-design--304204149853900213/`; the displayed location remained the requested user Pin. The extractor did not adopt that different Pin's OG image. Second Pin metadata uses this same slug canonical, while the current identity helper intentionally only supports the approved numeric Pin and nested visual-search routes.

Both pages recorded an aborted `ct.pinterest.com/ct.html` subframe request. This is not a main-document failure or a 403. No main navigation error occurred.

Evidence files: `result.json` is the first user Pin capture; `304204149853900213/result.json` is the second capture. The first capture records only the adapter's state warning, not its triggering state's media fields; do not infer whether that Pin is a real video from this warning alone. The second capture includes the exact-ID state search projection.

Conclusion: public-page access is login-gated in this fresh browser context. The current adapter safely returns no images for both sampled pages. Live source deduplication, original media decode, and actual nested visual-search rendering remain **unverified**. No source changes are justified from these gated results. Existing offline P1/P2 regression evidence remains separate. No further navigation was attempted.

`run.cjs` is a manual evidence utility, not part of offline tests; rerunning it performs one public navigation and requires explicit validation scope.
