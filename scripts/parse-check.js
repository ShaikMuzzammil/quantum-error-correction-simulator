// Parse-check every TSX/TS file under src/ with the real TypeScript parser.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk('src');
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // parseDiagnostics is internal but reliable for syntax errors
  const diags = sf.parseDiagnostics || [];
  if (diags.length) {
    bad++;
    console.log(`\n✗ ${f}`);
    for (const d of diags.slice(0, 4)) {
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
      console.log(`   line ${line + 1}:${character + 1} — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
    }
  }
}
console.log(bad === 0 ? `\n✅ ALL ${files.length} files parse cleanly` : `\n❌ ${bad} file(s) with syntax errors`);
process.exit(bad === 0 ? 0 : 1);
