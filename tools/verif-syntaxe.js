// Vérifie que le JavaScript de l'application est valide (scripts de index.html + fichiers .js).
// Utilisé par GitHub Actions : une croix rouge signale un commit qui casserait la page de connexion.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let bad = 0;
function check(name, code) {
    const f = path.join(os.tmpdir(), 'chk_' + Math.random().toString(36).slice(2) + '.js');
    fs.writeFileSync(f, code);
    const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) { bad++; console.log('ERREUR dans ' + name + '\n' + (r.stderr || '').split('\n').slice(0, 6).join('\n')); }
    else console.log('ok  ' + name);
    fs.unlinkSync(f);
}
const html = fs.readFileSync('index.html', 'utf8');
let n = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) check('index.html (script ' + (++n) + ')', m[1]);
for (const f of fs.readdirSync('.').filter(x => x.endsWith('.js') && x !== 'sw.js')) check(f, fs.readFileSync(f, 'utf8'));
if (fs.existsSync('functions')) for (const f of fs.readdirSync('functions').filter(x => x.endsWith('.js'))) check('functions/' + f, fs.readFileSync('functions/' + f, 'utf8'));
if (!/function\s+handleLogin\b/.test(html)) { bad++; console.log('ERREUR : handleLogin est introuvable dans index.html'); }
if (bad) { console.log('\n' + bad + ' problème(s) : la page de connexion risque de ne plus fonctionner.'); process.exit(1); }
console.log('\nTout est valide.');
