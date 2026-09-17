import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepare } from '../scripts/prepare-adsense.mjs';
// Synthetic fixture only; never a production account.
const id = 'ca-pub-9876543210987654';
function fixture(t, html = '<html><head><title>Example</title></head><body>Tool</body></html>', ads) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'utivaro-adsense-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'index.html'),html);
  if (ads !== undefined) fs.writeFileSync(path.join(root,'ads.txt'),ads);
  return root;
}
test('Preview leaves files untouched', t => {
  const root=fixture(t), before=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(prepare(root,id).length,2);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),before);
  assert.ok(!fs.existsSync(path.join(root,'ads.txt')));
});
test('Verification preserves other sellers, never adds ads code and is idempotent', t => {
  const root=fixture(t,undefined,'# Seller\nexample.com, other, DIRECT\n');
  prepare(root,id,true);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal((html.match(/google-adsense-account/g)||[]).length,1);
  assert.ok(html.includes(id));assert.ok(!html.includes('adsbygoogle'));
  assert.equal(fs.readFileSync(path.join(root,'ads.txt'),'utf8'),'# Seller\nexample.com, other, DIRECT\ngoogle.com, pub-9876543210987654, DIRECT, f08c47fec0942fa0\n');
  assert.ok(prepare(root,id,true).every(p=>!p.changed));
});
test('Malformed and example IDs fail before writing', t => {
  const root=fixture(t), before=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const bad of [undefined,'','pub-9876543210987654',id+'<script>','ca-pub-0000000000000000','ca-pub-1234567890123456'])assert.throws(()=>prepare(root,bad,true));
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),before);
  assert.ok(!fs.existsSync(path.join(root,'ads.txt')));
});
test('Conflicting Google seller blocks both writes', t => {
  const root=fixture(t,undefined,'google.com, pub-2222333344445555, DIRECT, f08c47fec0942fa0\n');
  const before=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.throws(()=>prepare(root,id,true),/differs/);
  assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),before);
});
test('Different or duplicate account tags are not overwritten', t => {
  for(const tags of ['<meta name="google-adsense-account" content="ca-pub-2222333344445555">','<meta name="google-adsense-account" content="'+id+'"><meta name="google-adsense-account" content="'+id+'">']){
    const html='<html><head>'+tags+'</head></html>', root=fixture(t,html);
    assert.throws(()=>prepare(root,id,true));
    assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),html);
    assert.ok(!fs.existsSync(path.join(root,'ads.txt')));
  }
});
test('Missing head is rejected and matching reordered attributes are preserved', t => {
  assert.throws(()=>prepare(fixture(t,'<html><body>Tool</body></html>'),id,true));
  const html='<html><head><meta content="'+id+'" name="google-adsense-account"></head></html>', root=fixture(t,html);
  prepare(root,id,true);assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),html);
});

