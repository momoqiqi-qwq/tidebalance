import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
export function cppuDevBridge() {
  let child, sequence = 0;
  const pending = new Map();
  function rpc(op, args) {
    if (!child) {
      child = spawn('python', ['-u', fileURLToPath(new URL('./cppu_transport.py', import.meta.url))], { windowsHide: true, stdio: ['pipe','pipe','ignore'] });
      createInterface({input: child.stdout}).on('line', line => {
        try { const m = JSON.parse(line); const p = pending.get(m.id); if(p) { clearTimeout(p.timer);pending.delete(m.id);m.error ? p.reject(new Error(m.error)) : p.resolve(m.result); } } catch {}
      });
      const fail = () => { child = null; for(const p of pending.values()) {clearTimeout(p.timer);p.reject(new Error('CPPU bridge unavailable; Python 3 is required'));} pending.clear(); };
      child.on('error', fail); child.on('exit', fail);
    }
    return new Promise((resolve,reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {pending.delete(id);reject(new Error('CPPU request timed out'));},60000);
      pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,op,args})+'\n');
    });
  }
  return { name:'cppu-dev-bridge', apply:'serve', configureServer(server) {
    server.httpServer?.on('close',()=>child?.kill());
    server.middlewares.use('/__cppu', async (req,res) => {
      // Never expose an open proxy or allow foreign browser origins to use login sessions.
      const host = req.headers.host || '';
      const origin = req.headers.origin;
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || req.method !== 'POST' || origin !== 'http://'+host || !req.headers['content-type']?.startsWith('application/json')) {res.writeHead(403);res.end();return;}
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      try {
        let body=''; for await (const part of req) {body+=part;if(body.length>65536) throw new Error('Request too large');}
        const args=JSON.parse(body); const op=req.url==='/session'?'session':req.url==='/fetch'?'fetch':null;
        if(!op) throw new Error('Unknown endpoint');
        res.end(JSON.stringify({result:await rpc(op,args)}));
      } catch(e) {res.statusCode=502;res.end(JSON.stringify({error:e.message}));}
    });
  }};
}
