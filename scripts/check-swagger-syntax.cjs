'use strict'

// tsconfig.json intentionally includes only src/, so the backend typecheck
// does not detect syntax errors in the Playwright Swagger test helper.
// Validate test files before launching an expensive browser + PostgreSQL run.
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const testDir = path.join(root, 'swagger-ui-tests')
const files = fs
  .readdirSync(testDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => path.join(testDir, file))

const program = ts.createProgram(files, {
  noEmit: true,
  noResolve: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  skipLibCheck: true,
})

// TypeScript classifies await-outside-async as TS1308 (a semantic diagnostic),
// so checking only parseDiagnostics/transpileModule is not sufficient.
const errors = []
for (const source of program.getSourceFiles()) {
  if (!source.fileName.startsWith(testDir)) continue
  errors.push(...source.parseDiagnostics)
}
errors.push(...program.getSemanticDiagnostics().filter((d) => d.code === 1308))

if (errors.length > 0) {
  for (const d of errors) {
    const file = d.file?.fileName ?? '(unknown file)'
    const position =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : null
    const where = position
      ? `:${position.line + 1}:${position.character + 1}`
      : ''
    process.stderr.write(
      `${path.relative(root, file)}${where} TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}\n`,
    )
  }
  process.exit(1)
}
process.stdout.write(
  `Swagger TypeScript syntax/async-context OK (${files.length} files)\n`,
)
