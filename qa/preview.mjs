import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const pages = fs.readdirSync(path.join(root,'public')).filter(file=>file.endsWith('.html')).map(file=>file.slice(0,-5)).sort();
export default {
  publicDir: false,
  server: {host:'0.0.0.0',allowedHosts:['terminal.local']},
  plugins:[{
    name:'isolated-layout-preview',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        const url = new URL(req.url,'http://preview');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'none'; frame-src 'self'; form-action 'none'");
        if(url.pathname === '/') {
          res.setHeader('Content-Type','text/html');
          res.end('<!doctype html><html><head><title>Digitask layout checks</title></head><body><h1>Digitask isolated layout preview</h1><p>Production connections disabled. Static layouts, fixture-backed bank controls and isolated Settings dialogs.</p>'+
            pages.filter(page=>!url.searchParams.has('page') || page===url.searchParams.get('page')).map(page=>'<h2>'+page+'</h2>'+[375,768,1440].map(width=>'<p>'+width+'px</p><iframe title="'+page+' '+width+'" width="'+width+'" height="850" src="/layout/'+page+'"></iframe>').join('')).join('')+'</body></html>');
          return;
        }
        const name = url.pathname.replace('/layout/','');
        if(url.pathname.startsWith('/layout/') && pages.includes(name)) {
          let html = fs.readFileSync(path.join(root,'public',name+'.html'),'utf8');
          const sourceHtml = html;
          const settingsController = name === 'digitask-settings-page' ? html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] : null;
          html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
            .replace(settingsController ? /(?!) /g : /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi,'')
            .replace(/<link\b[^>]*(?:manifest|apple-touch-icon)[^>]*>/gi,'');
          html=html.replace('</head>','<link rel="stylesheet" href="/qa/styles.css"><style>body { display: block !important; }</style></head>');
          if (['digitask-my-store-page','digitask-admin-finance'].includes(name)) html=html.replace('</body>','<script src="/qa/fixtures.js"></script>'+
            '<script src="/qa/source/bank-payout-controls.js"></script>'+
            (name.includes('admin-finance')?'<script src="/qa/source/admin-bank-fees.js"></script>':'')+
            '<script src="/qa/source/bank-order-panels.js"></script></body>');
          if (settingsController) {
            const fixture = fs.readFileSync(path.join(root,'qa/settings-fixture.mjs'),'utf8').replace(/export /g,'');
            const controller = settingsController.replace(/import \{[^}]+\} from [^;]+;/g,'');
            html = html.replace('</body>', () => '<script>window.addEventListener("error", e => { const p=document.createElement("p"); p.setAttribute("role","alert"); p.textContent="Preview error: "+e.message; document.body.append(p); });</script><script>' + fixture + '\nconst storageRef = ref;\n' + controller + '</script></body>');
          }
          if (name === 'digitask-my-gigs-page') {
            const start = sourceHtml.indexOf("      document.querySelectorAll('.tab-btn').forEach(button => {", sourceHtml.indexOf('function attachGlobalEventListeners()'));
            const end = sourceHtml.indexOf("      document.querySelectorAll('[data-modal-close]')", start);
            if (start < 0 || end < 0) throw new Error('My Gigs tab source boundary changed');
            html = html.replace('</body>', () => '<script>' + sourceHtml.slice(start,end) + '</script></body>');
          }
          if (name === 'digitask-gig-creation-and-digital-product-upload') {
            const scripts = Array.from(sourceHtml.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g));
            const ui = scripts.find(match => !match[1].trim() && match[2].includes('validateGigForm'))?.[2];
            const module = scripts.find(match => match[1].includes('type="module"'))?.[2];
            if (!ui || !module) throw new Error('Publishing source boundary changed');
            const categories = fs.readFileSync(path.join(root,'public/shared-category-utils.js'),'utf8');
            const fixture = fs.readFileSync(path.join(root,'qa/settings-fixture.mjs'),'utf8').replace(/export /g,'');
            const controller = module.replace(/import \{[^}]+\} from [^;]+;/g,'');
            html = html.replace('</body>', () => '<script>' + categories + '</script><script>' + ui + '</script><script>{' + fixture + '\nconst storageRef=ref; const getDocs=blocked;\n' + controller + '}</script></body>');
          }
          res.setHeader('Content-Type','text/html');res.end(html);return;
        }
        if(url.pathname.startsWith('/qa/source/')) {
          const file=path.basename(url.pathname);
          if(!['bank-payout-controls.js','admin-bank-fees.js','bank-order-panels.js','bank-fees.js'].includes(file)){res.statusCode=404;res.end();return;}
          res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(root,'public/js',file)));return;
        }
        if(['/qa/fixtures.js','/qa/styles.css'].includes(url.pathname)) {
          res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');
          res.end(fs.readFileSync(path.join(root,url.pathname)));return;
        }
        res.statusCode=404;res.end('Preview route unavailable');
      });
    }
  }]
};
