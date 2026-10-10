#!/usr/bin/env node
'use strict';

/**
 * Parse every repository Markdown equation with pinned MathJax.
 * Checks actual MathJax error nodes, not mathematical correctness.
 * Invocation:
 * npm install --no-save --prefix "$RUNNER_TEMP/naari-mathjax" mathjax-full@3.2.2
 * NODE_PATH="$RUNNER_TEMP/naari-mathjax/node_modules" node this-file.cjs
 */
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { CHTML } = require('mathjax-full/js/output/chtml.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');

const root = path.resolve(__dirname, '..');
const audit = path.join(root, 'formal-verification-and-mathematical-proofs',
  'validate_repository_math.py');
const equations = JSON.parse(execFileSync(process.env.PYTHON || 'python',
  [audit, '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 10485760 }));

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const packages = AllPackages.filter(n => n !== 'noerrors' && n !== 'noundefined');
const document = mathjax.document('', {
  InputJax: new TeX({ packages, maxBuffer: 50000 }),
  OutputJax: new CHTML({ fontURL: '' }),
});
const failures = [];
for (const item of equations) {
  try {
    const html = adaptor.outerHTML(document.convert(item.tex, {
      display: item.mode === 'display',
    }));
    if (html.includes('mjx-merror') || html.includes('data-mjx-error')) {
      const diagnostic = html.match(/data-mjx-error="([^"]+)"/)?.[1] ||
        'MathJax generated an merror element';
      failures.push(item.path + ':' + item.line + ' [' + item.mode +
        '] ' + diagnostic);
    }
  } catch (error) {
    failures.push(item.path + ':' + item.line + ' [' + item.mode +
      '] ' + String(error.message || error));
  }
}
const negativeControl = adaptor.outerHTML(document.convert(
  String.raw`\intentionallyUndefinedNAARIMacro{x}`, { display: true }));
if (!negativeControl.includes('mjx-merror')) {
  failures.push('MathJax negative control failed: unknown macro accepted');
}
if (failures.length) {
  console.error('MathJax rendering parser failures:\n' + failures.join('\n'));
  process.exit(1);
}
const blocks = equations.filter(x => x.mode === 'display').length;
console.log('MathJax rendering parse PASS: ' + equations.length +
  ' expressions (' + blocks + ' displayed, ' +
  (equations.length - blocks) +
  ' inline); no merror nodes; unknown-macro negative control rejected');
