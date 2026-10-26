# NBE Flight Converters

Live app: https://nbe-afms-daily.web.app/

GitHub Pages mirror: https://houssem-elheni.github.io/nbe-afms-daily/

This static app has two tools:

- Daily Flight Schedule converts a one-day AFMS pair report into the NBE workbook format.
- Report Converter aligns arrivals with their paired departures for ExportResults workbooks of any duration. Unmatched flights remain visible.

The conversion runs in the browser. Uploaded workbooks are not sent to a server.

## Winter 2026/2027 Callsigns

The Daily Flight Schedule export uses the 51 flight allocations from the supplied TUI and EasyJet sheets for 25 October 2026 through 27 March 2027, inclusive. The EasyJet sheet has an inconsistent printed end year; the winter 2026/2027 period follows the TUI heading. The handwritten correction for EZY5624 is `EZY85YK`.

Mappings support BY/TOM, TB/JAF, DS/EZS, and EZY. Each arrival/departure uses its own scheduled date, falling back to the report date when missing. During winter, these airlines' allocations override source suffixes; unlisted flights use their commercial number. Earlier reports retain the previous allocations. After the winter period, no expired allocation is added; only an explicitly supplied suffix is retained.

Run the callsign regression checks with `node --test tests/*.test.cjs`. The Firebase deployment workflow runs them before publishing.

GitHub Pages publishes the `main` branch from the repository root. Push updated static files to `main` to update the mirror, then run the Firebase workflow below to update the main app.

## Firebase Hosting

The manual [Deploy to Firebase Hosting](https://github.com/houssem-elheni/nbe-afms-daily/actions/workflows/firebase-deploy.yml) workflow targets only `nbe-afms-daily.web.app` in the `dtnh-roster-engine` project.

It uses the repository Actions secret `FIREBASE_SERVICE_ACCOUNT_NBE_AFMS_DEPLOY` for a dedicated service account with the **Firebase Hosting Admin** role (`roles/firebasehosting.admin`) on `dtnh-roster-engine`. Run the workflow from GitHub Actions after publishing source updates. Do not commit or paste the key into an issue or chat. The existing `dtnh-flight-compare-reader` service account receives HTTP 403 on Hosting deploy and should remain read-only.
