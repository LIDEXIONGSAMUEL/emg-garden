import {defineConfig,type PreviewServer,type ViteDevServer} from 'vite';
import react from '@vitejs/plugin-react';
import {handlePlaytest,playtestPath} from './scripts/playtest-store.mjs';

function playtestMiddleware(server:ViteDevServer|PreviewServer){
  server.middlewares.use((request,response,next)=>{
    if(request.url!==playtestPath)return next();
    const address=server.httpServer?.address();
    if(!address||typeof address==='string'){response.writeHead(503).end();return;}
    void handlePlaytest(request,response,server.config.root,address.port);
  });
}

export default defineConfig({
  plugins:[
    react(),
    {name:'local-playtest-recording',configureServer:playtestMiddleware,configurePreviewServer:playtestMiddleware},
  ],
  server:{
    fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/recordings/**']},
    watch:{ignored:['**/recordings/**']},
  },
});
