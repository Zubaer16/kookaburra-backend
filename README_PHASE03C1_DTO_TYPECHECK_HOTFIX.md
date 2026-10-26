# Phase 03C-1 — Media DTO TypeScript hotfix

Corrects `TS2769` in `src/media/media.dto.spec.ts` by making the DTO validation helper generic over an object constructor (`ClassConstructor<T>`) instead of passing a union of unrelated DTO constructors into `plainToInstance`. All existing validation assertions are preserved.

No runtime API changes, migrations, credentials, or database resets.

PowerShell (from repository root):

```powershell
tar -xzf "$env:USERPROFILE\Downloads\kookaburra-backend-03c1-dto-typecheck-hotfix-20261026.tar.gz" -C .
npm run check
```

After passing check, run the existing API smoke, DB, security, and Swagger suites against the already migrated isolated test database.
