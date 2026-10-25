# Rename guide — kookaburra-api → kookaburra-backend

This is a **repository/package/folder rename only**. The underlying service remains a NestJS REST API. API paths and database names must stay unchanged for the current Phase 02 setup.

## Already done manually

- Rename the GitHub repository from `kookaburra-api` to `kookaburra-backend` in **Settings → General → Repository name**.
- Rename the local repository folder to `C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend`.

## Apply the overlay to the renamed folder

```powershell
cd "C:\Users\zubaer.ahmed\Desktop\git\kookaburra-backend"
tar xzf "C:\Users\zubaer.ahmed\Downloads\kookaburra-backend-repository-rename-20261025.tar.gz"
```

## Verify or update the Git remote (not editable by a tar overlay)

```powershell
git remote -v
```

If the `origin` URL still ends in `kookaburra-api` or `kookaburra-api.git`, update just that repository suffix. This PowerShell expression preserves your GitHub account/organization and SSH versus HTTPS scheme:

```powershell
git remote set-url origin ((git remote get-url origin) -replace 'kookaburra-api(?=\.git$|$)', 'kookaburra-backend')
git remote -v
```

If `origin` is missing or points elsewhere, do **not** run the replace command blindly; configure the actual renamed repository URL instead. Repository rename usually retains Git history, branches and issues, but CI/deployment webhooks and external Git remotes should be checked.

## Validate the project

```powershell
node -p "require('./package.json').name"
npm pkg get name
npm run check
npm run test:api:visual:smoke
```

Expected package name: `kookaburra-backend`. Reinstalling dependencies or running `npm install` is **not** necessary solely because the package name changed; dependency versions are identical. The existing `package-lock.json` was updated consistently.

## Keep these intact

| Setting | Keep |
| --- | --- |
| Local dev database | `kookaburra-api-dev` |
| Isolated local API test database | `kookaburra_api_test` |
| REST API routes | `/v1/health`, `/v1/auth/...`, `/v1/admin/auth/...` |
| Browser integration env variable in the storefront | `NEXT_PUBLIC_KOOKABURRA_API_URL` |
| App server and Swagger ports | Same as before (normally `4000`, visual tests `4101` / `4102`) |
| Prisma migration history | Unchanged |

In particular, `scripts/run-api-dev-inspect.cjs` deliberately checks for database `kookaburra-api-dev`; changing that string while leaving the actual PostgreSQL DB untouched will break `npm run test:api:visual:dev`. The `kookaburra_api_test` checks prevent security tests from touching the development database.

## Check integrations outside the source ZIP

The uploaded source archive does not include your `.git` directory, ignored `.env` files, Windows user scripts or online CI/CD settings. Verify manually as applicable:

- GitHub Actions workflows, branch protection, GitHub webhooks, repository secrets and package registries.
- Vercel / hosting project linked repository, Root Directory, build/start commands and environment variables.
- Local PowerShell scripts (e.g., your ZIP backup script): make sure their source/root path points to `kookaburra-backend` if hard-coded.
- VS Code workspace files, external API clients, local shortcuts, Postman environments and documentation links.
- Do not rename PostgreSQL databases unless you independently plan and test a database migration and update every `.env`/safety gate.

**Safety:** Back up before changing external integrations; never commit `.env`, JWT secrets or local Playwright HTML reports/traces.
