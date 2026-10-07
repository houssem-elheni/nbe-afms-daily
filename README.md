# NBE Flight Converters

Live app: https://houssem-elheni.github.io/nbe-afms-daily/

This static app has two tools:

- Daily Flight Schedule converts a one-day AFMS pair report into the NBE workbook format.
- Report Converter aligns arrivals with their paired departures for ExportResults workbooks of any duration. Unmatched flights remain visible.

The conversion runs in the browser. Uploaded workbooks are not sent to a server.

GitHub Pages publishes the `main` branch from the repository root. Push updated static files to `main` to publish a new version.

## Firebase Hosting

The manual [Deploy to Firebase Hosting](https://github.com/houssem-elheni/nbe-afms-daily/actions/workflows/firebase-deploy.yml) workflow targets only `nbe-afms-daily.web.app` in the `dtnh-roster-engine` project.

It requires a dedicated Google service account with the **Firebase Hosting Admin** role (`roles/firebasehosting.admin`) on `dtnh-roster-engine`. Create a JSON key for that account and save the entire JSON as the repository Actions secret `FIREBASE_SERVICE_ACCOUNT_NBE_AFMS_DEPLOY`. Do not commit or paste the key into an issue or chat. Then run the workflow from GitHub Actions. The existing `dtnh-flight-compare-reader` service account receives HTTP 403 on Hosting deploy and should remain read-only.
