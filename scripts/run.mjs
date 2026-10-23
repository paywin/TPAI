import {spawn, spawnSync} from 'node:child_process';
import {existsSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode=process.argv[2] ?? 'start';
const npm=process.env.npm_execpath;
const children=new Set();
function command(exe,args,cwd=root) {
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd,stdio:'inherit',windowsHide:true}); children.add(child);
    child.on('error',reject);
    child.on('exit',code=>{children.delete(child); code===0 ? resolve() : reject(new Error(`Comando terminou com código ${code}: ${exe}`));});
  });
}
function runNpm(args,cwd=root) {
  if (!npm) throw new Error('Execute pelo npm: npm run setup / npm start.');
  return command(process.execPath,[npm,...args],cwd);
}
function python(required=true) {
  if (process.env.PULSO_PYTHON) return process.env.PULSO_PYTHON;
  const executable=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  if (required && !existsSync(executable)) throw new Error('Python do projeto não encontrado. Execute npm run setup primeiro.');
  return executable;
}
async function setup() {
  if (!existsSync(python(false))) {
    const candidates=process.platform==='win32' ? [['py',['-3']],['python',[]]] : [['python3',[]],['python',[]]];
    const found=candidates.find(([exe,args])=>spawnSync(exe,[...args,'-c','import sys; assert sys.version_info >= (3,11)'],{windowsHide:true,stdio:'ignore'}).status===0);
    if (!found) throw new Error('Instale Python 3.11 ou superior e tente novamente.');
    await command(found[0],[...found[1],'-m','venv','.venv']);
  }
  await command(python(),['-m','pip','install','-r','backend/requirements-test.txt']);
  await runNpm(['ci'],path.join(root,'frontend'));
  if (!existsSync(path.join(root,'.env'))) copyFileSync(path.join(root,'.env.example'),path.join(root,'.env'));
  if (mode !== 'setup:gemini') await command(python(),['scripts/download_model.py']);
  console.log('Pronto. Vosk não precisa de chave. Para Gemini, edite GEMINI_API_KEY no .env. Execute npm start.');
}
const shutdown=()=>{for(const child of children) child.kill();};
process.on('SIGINT',()=>{shutdown();process.exit(130);});
process.on('SIGTERM',()=>{shutdown();process.exit(143);});
try {
  if (mode.startsWith('setup')) await setup();
  else if(mode==='build') await runNpm(['run','build'],path.join(root,'frontend'));
  else if(mode==='test') {
    await runNpm(['test'],path.join(root,'frontend'));
    await command(python(),['-m','pytest','backend/tests','-q']);
  } else if(mode==='dev') {
    console.log('Abra http://localhost:5173 (não use o IP HTTP para o microfone).');
    await Promise.all([command(python(),['-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8787']),runNpm(['run','dev'],path.join(root,'frontend'))]);
  } else {
    if (mode==='start') await runNpm(['run','build'],path.join(root,'frontend'));
    console.log('\nPULSO: http://localhost:8787\nMantenha este terminal aberto. Ctrl+C encerra o servidor.\n');
    await command(python(),['-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8787']);
  }
} catch(error) {console.error(error.message);shutdown();process.exitCode=1;}
