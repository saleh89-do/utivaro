import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepare(root, publisher, write = false) {
  if (!/^ca-pub-\d{16}$/.test(publisher) || /^ca-pub-(\d)\1{15}$/.test(publisher) || publisher === 'ca-pub-1234567890123456')
    throw new Error('Use the real ca-pub- followed by 16 digits from your AdSense account. Example IDs are not accepted.');
  const index = path.join(root, 'index.html'), adsPath = path.join(root, 'ads.txt');
  const original = fs.readFileSync(index, 'utf8');
  if (!/<head\b[^>]*>/i.test(original) || !/<\/head\s*>/i.test(original)) throw new Error('index.html has no complete head.');
  const tags = [...original.matchAll(/<meta\b[^>]*\bname\s*=\s*["']google-adsense-account["'][^>]*>/gi)];
  if (tags.length > 1) throw new Error('Multiple AdSense account tags exist. Review them first.');
  if ([...original.matchAll(/ca-pub-\d{16}/g)].some(m => m[0] !== publisher)) throw new Error('Different publisher already referenced. No files changed.');
  let html = original;
  if (tags.length) {
    const account = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tags[0][0]);
    if (!account || account[1] !== publisher) throw new Error('Existing account tag does not match. No files changed.');
  } else html = original.replace(/<\/head\s*>/i, '<meta name="google-adsense-account" content="' + publisher + '">\n</head>');
  const ads = fs.existsSync(adsPath) ? fs.readFileSync(adsPath, 'utf8') : '';
  const seller = publisher.replace(/^ca-/, '');
  let found = false;
  for (const line of ads.split(/\r?\n/)) {
    const columns = line.split('#')[0].split(',').map(v => v.trim());
    if (columns[0].toLowerCase() !== 'google.com') continue;
    if (columns.length !== 4 || columns[1] !== seller || columns[2].toUpperCase() !== 'DIRECT' || columns[3].toLowerCase() !== 'f08c47fec0942fa0')
      throw new Error('Existing Google ads.txt entry differs. No files changed.');
    if (found) throw new Error('Duplicate Google ads.txt entries. Review them first.');
    found = true;
  }
  const nextAds = found ? ads : ads + (ads && !ads.endsWith('\n') ? '\n' : '') + 'google.com, ' + seller + ', DIRECT, f08c47fec0942fa0\n';
  const plan = [
    {file:index,content:html,changed:html !== original},
    {file:adsPath,content:nextAds,changed:!fs.existsSync(adsPath) || nextAds !== ads}
  ];
  // All conflict checks complete before either file is changed.
  if (write) for (const change of plan) if (change.changed) fs.writeFileSync(change.file, change.content);
  return plan.map(({file,changed}) => ({file:path.relative(root,file),changed,written:write && changed}));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('node scripts/prepare-adsense.mjs --publisher YOUR_REAL_CA_PUB_ID [--write]\nDefault: preview only. Adds verification meta tag and ads.txt, never advertising code.');
  else try {
    let publisher, write = false;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--write') write = true;
      else if (args[i] === '--publisher' && publisher === undefined) publisher = args[++i];
      else throw new Error('Unknown or duplicate argument. Use --help.');
    }
    if (!publisher) throw new Error('Missing --publisher. Use the ID from your own AdSense account.');
    const root = fileURLToPath(new URL('../', import.meta.url));
    console.log(JSON.stringify({mode:write?'write':'preview',ads_enabled:false,files:prepare(root,publisher,write)},null,2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

