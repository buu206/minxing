const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const esbuild=require('esbuild');
async function build(){
 const root=__dirname,vendor=path.join(root,'vendor/three-0.165.0');
 const output=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'colony.html');
 execFileSync('python3',[path.join(root,'compose.py')],{stdio:'inherit'});
 const manifest=JSON.parse(fs.readFileSync(path.join(vendor,'package.json'),'utf8'));
 if(manifest.version!=='0.165.0')throw Error('Three version changed');
 const license=fs.readFileSync(path.join(vendor,'LICENSE'),'utf8').trim();
 const result=await esbuild.build({entryPoints:[path.join(root,'module.mjs')],bundle:true,platform:'browser',format:'iife',target:'es2020',minify:true,write:false,metafile:true,legalComments:'inline',banner:{js:'/*! Three.js 0.165.0\n'+license+'\n*/'},plugins:[{name:'local-three',setup(b){b.onResolve({filter:/^three(?:\/|$)/},args=>({path:args.path==='three'?path.join(vendor,'build/three.module.js'):path.join(vendor,'examples/jsm',args.path.slice('three/addons/'.length))}));}}]});
 const bundle=result.outputFiles[0].text;
 if(/<\/script\s*[>\/]/i.test(bundle))throw Error('Unsafe inline script');
 if(Object.values(result.metafile.outputs).some(o=>o.imports.length))throw Error('External script dependency');
 let html=fs.readFileSync(path.join(root,'assembled.html'),'utf8');
 html=html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/,'').replace(/<script type="module">[\s\S]*?<\/script>/,()=>'<script id="minxingApp">\n'+bundle+'\n</script>');
 fs.writeFileSync(output,html);console.log('Built standalone:',output,Buffer.byteLength(html),'bytes');
}
build().catch(e=>{console.error(e);process.exitCode=1;});
