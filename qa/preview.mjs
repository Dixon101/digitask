import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const pages = ['digitask-my-store-page','digitask-admin-finance','digitask-digital-product-checkout-page'];
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
          res.end('<!doctype html><html><head><title>Digitask layout checks</title></head><body><h1>Digitask isolated layout preview</h1><p>Production connections disabled. Static page layouts and fixture-backed bank controls only.</p>'+
            pages.map(page=>'<h2>'+page+'</h2>'+[375,768,1440].map(width=>'<p>'+width+'px</p><iframe title="'+page+' '+width+'" width="'+width+'" height="850" src="/layout/'+page+'"></iframe>').join('')).join('')+'</body></html>');
          return;
        }
        const name = url.pathname.replace('/layout/','');
        if(url.pathname.startsWith('/layout/') && pages.includes(name)) {
          let html = fs.readFileSync(path.join(root,'public',name+'.html'),'utf8');
          html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
            .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi,'')
            .replace(/<link\b[^>]*(?:manifest|apple-touch-icon)[^>]*>/gi,'');
          html=html.replace('</head>','<link rel="stylesheet" href="/qa/styles.css"></head>');
          if (!name.includes('checkout')) html=html.replace('</body>','<script src="/qa/fixtures.js"></script>'+
            '<script src="/qa/source/bank-payout-controls.js"></script>'+
            (name.includes('admin-finance')?'<script src="/qa/source/admin-bank-fees.js"></script>':'')+
            '<script src="/qa/source/bank-order-panels.js"></script></body>');
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
