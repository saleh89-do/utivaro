import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

function element(value = '') {
  const listeners = new Map();
  return {
    value, textContent: '', disabled: false, hidden: false, style: {},
    setAttribute() {},
    addEventListener(name, callback) { listeners.set(name, callback); },
    fire(name) { listeners.get(name)?.({target:this}); },
    focus() {}
  };
}

function toolsPage(ids, pathname) {
  const fields = Object.fromEntries(ids.map(([id,value]) => [id, element(value)]));
  const document = {
    getElementById: id => fields[id] || null,
    dispatchEvent() {}
  };
  const sandbox = {document, location:{pathname}, CustomEvent:class {}, console};
  sandbox.window = sandbox;
  sandbox.UtivaroCore = {
    finite: (raw,name) => { const value = Number(raw); if (!raw || !Number.isFinite(value)) throw new Error('Invalid ' + name); return value; },
    formatNumber: n => String(n),
    jsonTokens: raw => JSON.parse(raw),
    formatJSON: (raw,space) => JSON.stringify(JSON.parse(raw),null,space)
  };
  vm.createContext(sandbox);
  vm.runInContext(read('assets/utivaro-tools.js'),sandbox);
  return {fields,sandbox};
}

test('Changing each percentage input invalidates its displayed result', () => {
  const {fields,sandbox} = toolsPage([
    ['percentageRate','25'],['percentageValue','200'],['percentageResult',''],
    ['partValue','1'],['wholeValue','4'],['ratioResult',''],
    ['oldValue','100'],['newValue','120'],['changeResult','']
  ],'/tools/percentage-calculator');
  sandbox.calculatePercentage();
  assert.equal(fields.percentageResult.textContent,'50');
  fields.percentageValue.value='100'; fields.percentageValue.fire('input');
  assert.equal(fields.percentageResult.textContent,'—');
  sandbox.calculatePercentageRatio();
  assert.equal(fields.ratioResult.textContent,'25%');
  fields.wholeValue.value='2'; fields.wholeValue.fire('input');
  assert.equal(fields.ratioResult.textContent,'—');
  sandbox.calculatePercentageChange();
  assert.equal(fields.changeResult.textContent,'20% increase');
  fields.oldValue.value='80'; fields.oldValue.fire('input');
  assert.equal(fields.changeResult.textContent,'—');
});

test('Validating formatted JSON keeps the result available to copy', () => {
  const {fields,sandbox} = toolsPage([
    ['jsonInput','{"x":1}'],['jsonOutput',''],['jsonIndent','2'],['jsonStatus','']
  ],'/tools/json-formatter');
  sandbox.formatJSON();
  const output = fields.jsonOutput.value;
  assert.ok(output.includes('\n'));
  sandbox.validateJSON();
  assert.equal(fields.jsonOutput.value,output);
  fields.jsonInput.value='{"x":2}'; fields.jsonInput.fire('input');
  assert.equal(fields.jsonOutput.value,'');
});

test('Editing Base64 input clears and disables copying the old result', async () => {
  const html = read('tools/base64.html');
  const code = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<!-- Utivaro verified fixes/)[1];
  const fields = Object.fromEntries(['base64Input','base64Output','base64Message','copyBase64Button']
    .map(id => [id,element()]));
  let copied = 0;
  const sandbox = {
    document:{getElementById:id => fields[id]},
    navigator:{clipboard:{writeText:async () => { copied++; }}},
    TextEncoder,TextDecoder,btoa,atob,
    setTimeout() {},
    window:{UtivaroAnalytics:{track() {}}}
  };
  vm.createContext(sandbox); vm.runInContext(code,sandbox);
  fields.base64Input.value='first'; sandbox.encodeBase64();
  assert.ok(fields.base64Output.value);
  assert.equal(fields.copyBase64Button.disabled,false);
  fields.base64Input.value='second'; fields.base64Input.fire('input');
  assert.equal(fields.base64Output.value,'');
  assert.equal(fields.copyBase64Button.disabled,true);
  await sandbox.copyBase64Result(fields.copyBase64Button);
  assert.equal(copied,0);
});

test('Home search finds separate words and image synonyms', () => {
  const input = element('');
  const note = element();
  const cards = [
    {textContent:'Image Resizer',hidden:false,getAttribute:attr => attr === 'data-search' ? 'image resize resizer picture photo shrink smaller width height' : '/tools/image-resizer',setAttribute() {}},
    {textContent:'Word Counter',hidden:false,getAttribute:attr => attr === 'data-search' ? 'word count text' : '/tools/word-counter',setAttribute() {}}
  ];
  const area = {querySelectorAll:() => cards, prepend() {},scrollIntoView() {}};
  const document = {
    readyState:'complete',head:{appendChild() {}},
    getElementById:id => ({toolSearch:input,'all-tools':area,noToolsFound:note}[id] || null),
    querySelector:selector => selector === 'input[type="search"]' ? input : null,
    querySelectorAll:() => [],createElement:() => element()
  };
  const sandbox = {document,location:{pathname:'/',origin:'https://utivaro.com'},navigator:{},window:{}};
  vm.createContext(sandbox); vm.runInContext(read('assets/utivaro-site.js'),sandbox);
  input.value='resize picture'; input.fire('input');
  assert.deepEqual(cards.map(card => card.hidden),[false,true]);
  input.value='never heard of it'; input.fire('input');
  assert.deepEqual(cards.map(card => card.hidden),[true,true]);
  assert.match(note.textContent,/No tools found/);
});
