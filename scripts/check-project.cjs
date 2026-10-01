const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const files = [];
function visit(folder) {
  for (const name of fs.readdirSync(folder)) {
    const file = path.join(folder, name);
    if (fs.statSync(file).isDirectory()) visit(file);
    else if (/\.(ts|tsx)$/.test(file)) files.push(file);
  }
}
visit(path.join(root, 'src'));
files.push(path.join(root, 'App.tsx'), path.join(root, 'index.ts'));
let problems = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  for (const diag of result.diagnostics || []) {
    problems++;
    console.error(`${file}: ${ts.flattenDiagnosticMessageText(diag.messageText, '\n')}`);
  }
  for (const [, relative] of source.matchAll(/(?:from\s*|import\s*\()['"](\.[^'"\)]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), relative);
    if (!['.ts', '.tsx', '.js', '.json', ''].some(ext => fs.existsSync(target + ext))) {
      problems++; console.error(`Missing relative import: ${file} -> ${relative}`);
    }
  }
}
for (const filename of ['package.json', 'app.json', 'database.rules.json']) JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(root,'database.rules.json'),'utf8')).rules;
if (rules.deviceData.$vehicleId['.write'] !== false) {problems++;console.error('Client-side hardware writes MUST be denied');}
if (!rules.vehicleMembers || !rules.joinRequests || !rules.requests) {problems++;console.error('Missing required access-control collections');}
console.log(`Checked ${files.length} TS/TSX files, relative imports, JSON configuration and critical rules. Problems: ${problems}`);
process.exit(problems ? 1 : 0);
