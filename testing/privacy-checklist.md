# Privacy Checklist

- Confirm no API route accepts or stores raw image blobs or video recordings.
- Confirm the database contains only derived metrics and profile/settings records.
- Confirm password hashes are stored instead of plain-text passwords.
- Confirm refresh tokens are hashed at rest and can be revoked on logout.
- Confirm analytics queries always filter by the authenticated user id.
- Confirm webcam-denied flows still work without forcing camera access.
