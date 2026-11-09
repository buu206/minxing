from pathlib import Path
import base64, json, re

w=Path(__file__).parent
s=(w/'original.html').read_text()
def replace(old,new):
 global s
 assert s.count(old)==1,(s.count(old),old[:100])
 s=s.replace(old,new,1)
def block(start,end,new):
 global s
 a=s.index(start);b=s.index(end,a+len(start));s=s[:a]+new+'\n'+s[b:]
def file(name):return(w/name).read_text()

replace('<title>皿星 · 与 AI 一起探索微观宇宙</title>','<title>皿星 · 把好奇，养成生命</title>')
block('/* Abstract living intelligence.', '</style>',file('home.css')+'\n'+file('assistant.css')+'\n'+file('intro.css'))
block('<section id="homePage"','<section id="onboardPage"',file('home.html'))
block('<section id="homeIntro"','<div id="load">',file('intro.html'))
image='data:image/png;base64,'+base64.b64encode((w/'colony-landscape.png').read_bytes()).decode()
asset='const COLONY_LANDSCAPE='+json.dumps(image)+';\n'
block('// The home assistant is an explicit functional demo.','HomeLanding.init();',file('live-ai.js')+'\n'+file('assistant.js')+'\n'+asset+file('life-visual.js')+'\n'+file('entry-constellation.js')+'\n'+file('intro.js')+'\n'+file('home.js'))
replace("button.append(img,document.createTextNode(sp.name));button.onclick=()=>{appNavigate('dex');selectDexSpecimen(sp.id);};wall.append(button);","button.dataset.homeSpecies=sp.id;button.append(img,document.createTextNode(sp.name));button.onclick=()=>{appNavigate('dex');selectDexSpecimen(sp.id);};wall.append(button);")
replace('<script type="importmap">',file('boot.html')+'\n<script type="importmap">')
replace("const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });","const renderer = (() => { try { return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch(error) { window.__minxingBoot.fail(new Error('WebGL initialization failed')); throw error; } })();")
replace('<link rel="stylesheet" href="https://fonts.googleapis.com/','<link rel="stylesheet" media="print" onload="this.media=\'all\'" href="https://fonts.googleapis.com/')
replace('\n</script>\n</body>','\nLiveAI.init();\nwindow.__minxingBoot.ready();\n</script>\n</body>')
(w/'assembled.html').write_text(s)
(w/'module.mjs').write_text(re.search(r'<script type="module">(.*?)</script>',s,re.S).group(1))
print('Composed colony source:',len(s.encode()),'bytes')
