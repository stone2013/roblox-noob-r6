import {V,Q,clamp,Body,Physics,Renderer,rayBody} from './engine.js?v=4.8.0';
const $=id=>document.getElementById(id),show=(id,on)=>$(id).classList.toggle('hidden',!on),R=new Renderer($('viewport')),P=new Physics();
const rad=d=>d*Math.PI/180,colors={yellow:'#ffdb39',blue:'#287ac5',green:'#73b343'},names=['头部','躯干','左臂','右臂','左腿','右腿'],caps=[6,18,5,5,7,7];
const routes=[{name:'01 / 高台自由落体',desc:'从 16 米高台落下，挑战一次重击。',x:0,h:16},{name:'02 / 翻滚阶梯',desc:'20 级长阶梯，连续翻滚与多次碰撞。',x:-28,h:20},{name:'03 / 山谷滑坡',desc:'24 米滑坡与凸起路障，滑行后翻滚。',x:28,h:24},{name:'04 / 雪山之巅',desc:'42 米雪山：悬崖、积木雪坡、岩石障碍与连续跌落。',x:55,h:42}];
let route=0,strong=true,first=false,slow=false,tool='grab',entered=false,yaw=.48,pitch=.4,distance=10,actorYaw=0,hero=[0,16,3],velY=0,walk=0,walkBlend=0,moveVelocity=[0,0,0],grounded=true,airStart=null,jumpBuffer=0,coyote=0,turning=null,stick={x:0,y:0,id:null},keys=new Set(),props=[],effects=[],clouds=[],soundOn=false,audio=null,lastSound=0,impactUntil=0,toastUntil=0,frame=0,acc=0;
let round={phase:'ready',elapsed:0,still:0,score:0,maxSpeed:0,hits:0,assisted:false},records=[0,0,0,0];try{let d=JSON.parse(localStorage.getItem('noob-break-records-v4'));if(Array.isArray(d)&&d.length>=3)records=d.slice(0,4).concat(Array(Math.max(0,4-d.length)).fill(0)).map(v=>Number.isFinite(v)?Math.max(0,v):0)}catch{}
let seed=483;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
function decoration(p,s,c,q=Q.id(),shape='box',cast=true){let m=R.add(p,s,c,shape,q);m.cast=cast;return m}
function solid(p,s,c,q=Q.id(),tag='terrain'){let b=P.add(new Body(p,s,0,'box',q));b.tag=tag;b.mesh=decoration(p,s,c,q);return b}
const ground=decoration([0,-1,-18],[360,2,360],'#82b767',Q.id(),'box',false);ground.studs=1;
// Expanded 360x360 playable world. Perimeter hills are solid, not just decoration.
// Use fewer broad static collision blocks to keep mobile physics affordable.
const worldLimitX=150,worldMinZ=-162,worldMaxZ=126;
for(let i=0;i<12;i++){
 const x=-worldLimitX+(i+.5)*(2*worldLimitX/12),zA=worldMinZ,zB=worldMaxZ;
 for(const z of [zA,zB]){
  let ht=12+5*Math.sin(i*.9+z*.03)+((i*7)%4);
  solid([x,ht/2,z],[26,ht,12],i%2?'#839f94':'#9bb6a7');
  decoration([x,ht+.3,z],[25,.65,11.7],'#b9cbb6',Q.id(),'box',false);
 }
}
for(let i=0;i<12;i++){
 const z=worldMinZ+(i+.5)*(worldMaxZ-worldMinZ)/12;
 for(const x of [-worldLimitX,worldLimitX]){
  let ht=11+4*Math.sin(i*.9+x*.02)+((i*5)%4);
  solid([x,ht/2,z],[12,ht,26],i%2?'#829e94':'#a0b8a9');
  decoration([x,ht+.3,z],[11.7,.65,25],'#bed0bc',Q.id(),'box',false);
 }
}
// Distant block-built foothills, each with a matching collision body.
for(let i=0;i<16;i++){
 const ang=i*Math.PI*2/16,x=Math.cos(ang)*115,z=-18+Math.sin(ang)*102;
 const ht=9+(i%5)*3;
 solid([x,ht/2,z],[14,ht,14],i%3?'#91aba0':'#a5bcb1');
 decoration([x,ht+.4,z],[11,.8,11],'#b9cbb4',Q.id(),'box',false);
}

// Destructible trees: trunk is a static collider until a strong impact shatters it.
// Decorative canopy stays attached visually and disappears into capped fragments.
const breakableTrees=[],treeFragments=[];
function makeBreakableTree(x,z,height=3.5){
 const trunk=solid([x,height*.5,z],[.65,height,.65],'#95633d',Q.id(),'tree');
 const canopy=[
 decoration([x,height+.45,z],[2.8,1.8,2.7],'#328f53'),
 decoration([x,height+1.5,z],[2.0,1.25,2.0],'#4db46b'),
 decoration([x-.4,height+2.15,z-.3],[1.15,.7,1.15],'#83ca7c')
 ];
 const tree={x,z,height,trunk,canopy,broken:false};
 trunk.tree=tree;breakableTrees.push(tree);return tree;
}
function shatterTree(tree,force=12){
 if(!tree||tree.broken)return;
 tree.broken=true;P.remove(tree.trunk);R.remove(tree.trunk.mesh);
 for(let m of tree.canopy)R.remove(m);
 const pieces=[
 [[0,tree.height*.22,0],[.55,tree.height*.44,.55],'#99683e'],
 [[0,tree.height*.72,0],[.50,tree.height*.45,.50],'#a77647'],
 [[-.55,tree.height+.6,0],[1.2,.9,1.1],'#348f50'],
 [[.55,tree.height+1.1,.25],[1.2,1,1.2],'#48a760'],
 [[0,tree.height+1.9,-.3],[1.0,.75,1.0],'#75bd73']
 ];
 for(let i=0;i<pieces.length;i++){
  let [offset,size,color]=pieces[i],p=[tree.x+offset[0],offset[1],tree.z+offset[2]];
  let m=decoration(p,size,color),v=[(random()-.5)*force*.7,3+random()*force*.3,(random()-.5)*force*.7];
  treeFragments.push({m,p,v,spin:(random()-.5)*4,life:7});
 }
 while(treeFragments.length>90){R.remove(treeFragments.shift().m)}
 sparks([tree.x,tree.height*.6,tree.z],10);
 toast('🌳 树木撞碎了！');
}
function updateTreeFragments(dt){
 for(let i=treeFragments.length-1;i>=0;i--){
  let f=treeFragments[i];f.life-=dt;f.v[1]-=P.gravity*dt;
  f.p=V.add(f.p,V.mul(f.v,dt));
  if(f.p[1]<.25){f.p[1]=.25;f.v[1]=Math.max(0,-f.v[1]*.2);f.v[0]*=.8;f.v[2]*=.8}
  f.m.p=[...f.p];f.m.q=Q.step(f.m.q,[dt*f.spin,dt*.6,dt*.4]);
  if(f.life<=0){R.remove(f.m);treeFragments.splice(i,1)}
 }
}
function restoreTrees(){
 for(let tree of breakableTrees){if(!tree.broken)continue;
  tree.broken=false;const trunk=solid([tree.x,tree.height*.5,tree.z],[.65,tree.height,.65],'#95633d',Q.id(),'tree');
  trunk.tree=tree;tree.trunk=trunk;
  tree.canopy=[
   decoration([tree.x,tree.height+.45,tree.z],[2.8,1.8,2.7],'#328f53'),
   decoration([tree.x,tree.height+1.5,tree.z],[2,1.25,2],'#4db46b'),
   decoration([tree.x-.4,tree.height+2.15,tree.z-.3],[1.15,.7,1.15],'#83ca7c')
  ];
 }
 for(let f of treeFragments)R.remove(f.m);treeFragments.length=0;
}
for(let i=0;i<26;i++){let x=(random()-.5)*122,z=(random()-.5)*110-20;if(Math.abs(x)<43&&z>-49&&z<13)continue;let h=2.6+random()*2;makeBreakableTree(x,z,h)}
for(let i=0;i<9;i++){let x=(i-4)*20,z=-55+(i%3)*37,y=36+random()*7;let group=[];for(let k=0;k<3;k++){let m=decoration([x+k*3,y+(k===1?1.0:0),z],[5,2.0+(k===1?1.1:0),3.4],'#f4faf4',Q.id(),'box',false);group.push(m)}clouds.push(group)}
function stripe(x,y,z,w=9){for(let i=0;i<12;i++)decoration([x-w/2+i*w/12,y,z],[w/24,.035,.6],i%2?'#344f53':'#ffd46f',Q.axis([0,1,0],-.35),'box',false)}
for(let c of routes){let {x,h}=c;solid([x,h-.6,5],[10,1.2,8],'#e4eadf');let deck=decoration([x,h+.01,5],[9.8,.035,7.8],'#517575',Q.id(),'box',false);deck.studs=1;stripe(x,h+.04,1.4);for(let a of [-4.45,4.45]){solid([x+a,h+1,5],[.18,.22,7.5],'#d4e2db');for(let z of [2.3,5.5,8.4])solid([x+a,h+.48,z],[.16,1.1,.16],'#729ba0');solid([x+a,h/2-1,6],[.55,h-1,.55],'#aec4bd')}
 solid([x,h+1,8.5],[9.1,.22,.18],'#d4e2db');decoration([x,h+.025,6.2],[4,.04,2.3],'#a5c2a7');for(let k=0;k<3;k++)decoration([x,h+.07,5-k*.6],[1.1,.04,.16],'#e6eed3');solid([x+4.5,.7,13],[2.5,1.4,2.5],'#e5eddc');decoration([x+4.5,1.45,13],[2,.14,2],'#7cb6a3');decoration([x+4.5,1.55,13],[1.1,.07,.3],'#f9fcf2');decoration([x+4.5,1.56,13],[.3,.07,1.1],'#f9fcf2')}
// Stair tops descend away from the launch platform; thick boxes prevent fast tunnelling.
for(let i=0;i<20;i++){let h=19-i,z=-1-i*1.7;solid([-28,h/2,z],[8.4,h,1.7],i%2?'#b9c6c0':'#d1dacf');decoration([-28,h+.025,z+.64],[8.1,.04,.2],'#efb473',Q.id(),'box',false)}
const slopeQ=Q.axis([1,0,0],-Math.atan2(22,34));solid([28,11.8,-16],[9,1.0,40.5],'#b8cbd0',slopeQ);for(let x of [23.35,32.65])solid([x,12.2,-16],[.4,1.1,40.5],'#799b9b',slopeQ);for(let z of [-8,-18,-28]){let y=12.4+(z+16)*22/34;solid([28,y,z],[7.8,.6,.75],'#dca373',slopeQ)}

// v4.6: rugged, branching mountain massif, not a single straight ramp.
// Collision uses the same solid boxes as visible terrain. Staggered terraces
// form cliffs, shelves, gullies, and alternate descent paths.
const mountainX=55;
const ridge=[
// x-offset, z, summit height, width, depth
[0,-1,40,10,7],[1,-7,36,11,7],[-1.4,-13,34,10,7],
[-3.2,-19,27,9,7],[-1.2,-25,25,12,7],[2.2,-31,18,11,7],
[4.4,-37,17,9,7],[1.8,-43,10,13,7],[-1.5,-49,7,13,7],
[0,-55,3,16,8]];
for(let i=0;i<ridge.length;i++){
 let [off,z,top,width,depth]=ridge[i],x=mountainX+off;width*=1.22;depth*=1.10;
 // Massive rocky core with a narrow, irregular snow cap.
 solid([x,top/2,z],[width,top,depth],i%3===0?'#657e8d':i%3===1?'#7e96a4':'#91a5b1');
 decoration([x,top+.045,z],[width-.2,.09,depth-.15],i%3===0?'#f7fdff':'#dcecf4',Q.id(),'box',false);
 // Distinct cliff edges and short rocky ledges.
 if(i>1&&i<9){
  let side=i%2?1:-1;
  solid([x+side*(width/2+1),top-2,z],[2.2,3.8,depth*.65],'#647e8c');
  decoration([x+side*(width/2+.4),top+.24,z],[1.3,.38,depth*.48],'#b9cbd5',Q.id(),'box',false);
 }
 // Mountain flanks broaden as elevation falls, with uneven shoulders.
 for(let side of [-1,1]){
  let flankTop=Math.max(1,top*(.72+(i%3)*.045)),fx=x+side*(width*.5+3.4);
  solid([fx,flankTop/2,z],[6.8,flankTop,depth+.15],i%2?'#8499a5':'#6e8796');
  if(i%2===0)decoration([fx,flankTop+.07,z],[5.5,.15,depth-.3],'#d7e5ed',Q.id(),'box',false);
  let outer=Math.max(.7,flankTop*.52),ox=fx+side*5.5;
  solid([ox,outer/2,z],[5.3,outer,depth+.15],'#9caeb6');
 }
}
// Three separate craggy peaks: summit and two side summits.
// Their stepped narrowing produces a recognizable jagged mountain skyline.
const peaks=[
 {x:mountainX-18,z:-13,h:62,r:16},
 {x:mountainX+24,z:-27,h:54,r:16},
 {x:mountainX-22,z:-48,h:42,r:15}
];
for(let p of peaks){
 const levels=9,step=p.h/levels;
 for(let k=0;k<levels;k++){
  let width=p.r*2*(1-k/levels)+.6,depth=width*.88,
      cx=p.x+Math.sin(k*1.6+p.x)*.65,cz=p.z+Math.cos(k*1.2)*.45;
  solid([cx,k*step+step/2,cz],[width,step+.12,depth],
    k>levels*.65?'#e5f0f5':k>levels*.45?'#b9ccd6':'#728b9a');
 }
 decoration([p.x,p.h+.3,p.z],[1.8,.65,1.6],'#faffff',Q.id(),'box',false);
}
// Branching ridge to the right: optional ledges to tumble across.
for(let i=0;i<5;i++){
 let z=-18-i*7,x=mountainX+12+i*1.8,top=Math.max(3,26-i*5);
 solid([x,top/2,z],[7.2,top,7.3],i%2?'#8299a6':'#708998');
 decoration([x,top+.05,z],[7,.1,7],'#edf6f9',Q.id(),'box',false);
}
// Gully obstacles near the base, low enough to tumble over.
for(let i=0;i<6;i++){
 let x=mountainX+(i-2.5)*2.8,z=-61+(i%2)*1.3;
 solid([x,.5+(i%3)*.15,z],[2.2,1+(i%3)*.3,2.0],i%2?'#839ba8':'#b0c2cc');
}
decoration([mountainX,1.15,-67],[18,2.3,2.2],'#9baeb9');
decoration([mountainX,2.35,-67],[17,.12,2.0],'#f2fbff',Q.id(),'box',false);
for(let c of routes){let z=c.x===0?-7:-40;let pad=decoration([c.x,.03,z-7],[13,.05,18],'#b8cab1',Q.id(),'box',false);pad.studs=1;for(let side of [-1,1])for(let k=0;k<4;k++){let x=c.x+side*6.8,zz=z-k*4;decoration([x,.1,zz],[.7,.2,.7],'#536e65');decoration([x,.5,zz],[.44,.8,.44],'#efa369');decoration([x,.6,zz],[.46,.14,.46],'#fff1d1')};stripe(c.x,.09,z+1,12)}
solid([-1,1.2,-7],[5,2.4,1.2],'#ce8e65');solid([2.2,.5,-13],[2.5,1,2.4],'#d5aa73');solid([-3,.8,-18],[2.3,1.6,2.2],'#abbdaf');solid([28,1,-40],[8,2,1.5],'#d3a675');

// v4.3 scenic pass: lightweight low-poly scenery placed outside active drop lanes.
function scenicTree(x,z,height=3.5){makeBreakableTree(x,z,height)}
function scenicLamp(x,z){decoration([x,1.8,z],[.18,3.6,.18],'#486a72');decoration([x,3.65,z],[1.2,.16,.52],'#365766');let light=decoration([x,3.51,z],[.9,.1,.4],'#ffe7a1');light.unlit=.7}
for(let i=0;i<30;i++){let x=(random()-.5)*112,z=-70+random()*94;if(Math.abs(x)<39&&z>-51&&z<13)continue;scenicTree(x,z,2.5+random()*2.2)}
for(let i=0;i<12;i++){let x=-56+i*10;decoration([x,.2,19],[5,.35,3.6],i%2?'#adc9bd':'#c7d9c6');decoration([x,.4,19],[3.8,.1,2.5],'#a4c1ad')}
for(let c of routes){let x=c.x;scenicLamp(x-3.4,9);scenicLamp(x+3.4,9);
decoration([x,c.h+1.4,9],[4.3,1.05,.22],'#294b63');decoration([x,c.h+1.4,9.14],[3.85,.64,.07],'#e8f1d8',Q.id(),'box',false);
for(let side of [-1,1])for(let j=0;j<3;j++){decoration([x+side*5.3,.28,-4-j*6],[.55,.55,.55],'#f6b363');decoration([x+side*5.3,.58,-4-j*6],[.58,.13,.58],'#f9df9b')}}
for(let x of [-44,44])for(let z of [-36,-18,0]){decoration([x,.7,z],[2.1,1.4,2.1],'#b8c4b6');decoration([x,1.47,z],[2.2,.15,2.2],'#d9e4d3')}
const layout=[[0,3.34,0],[0,2.2,0],[-.94,2.2,0],[.94,2.2,0],[-.32,.76,0],[.32,.76,0]],sizes=[[.84,.84,.84],[1.26,1.4,.7],[.6,1.4,.7],[.6,1.4,.7],[.61,1.48,.7],[.61,1.48,.7]],masses=[1.8,5,1.5,1.5,2.1,2.1];
const dolls=layout.map((p,i)=>{let b=P.add(new Body(p,sizes[i],masses[i]));b.group='doll';b.part=i;b.mesh=decoration(p,sizes[i],i===1?colors.blue:i>3?colors.green:colors.yellow);b.mesh.shadow=true;b.base=[...b.mesh.c];b.damage=0;b.lastHit=-99;b.ornaments=[];b.active=false;return b});
function detail(i,p,s,c,rot=Q.id(),crack=false){let b=dolls[i],m=decoration([0,0,0],s,c);m.cast=false;b.ornaments.push({m,p,q:rot,crack});return m}
for(let x of [-.16,.16])detail(0,[x,.08,.427],[.08,.11,.022],'#23343a');for(let i=0;i<10;i++)detail(0,[-.245+i*.054,-.095-.085*Math.sin(i/9*Math.PI),.427],[.055,.028,.018],'#23343a',Q.axis([0,0,1],Math.cos(i/9*Math.PI)*-.45));

// v4.3 character detailing: decorative-only meshes attached to the existing six rigid bodies.
for(let side of [-1,1]){detail(0,[side*.39,.07,0],[.055,.55,.55],'#e9bd27');detail(1,[side*.60,0,0],[.045,1.22,.68],'#165c9c')}
detail(1,[0,.68,.02],[1.12,.07,.67],'#3b8bd5');
detail(1,[0,-.67,.02],[1.14,.075,.67],'#155c9e');
for(let arm of [2,3]){detail(arm,[0,-.61,.01],[.59,.11,.69],'#e7c52a');detail(arm,[0,.60,0],[.59,.09,.68],'#ffe879')}
for(let leg of [4,5]){detail(leg,[0,-.67,.06],[.6,.13,.82],'#327e2d');detail(leg,[0,.62,0],[.6,.10,.7],'#5da33a')}
for(let x of [-.14,.14])detail(0,[x,.08,.445],[.035,.035,.014],'#f8f9dd');
for(let i=0;i<6;i++){for(let k=0;k<3;k++)for(let side of [-1,1])detail(i,[(k-1)*.075,(k-1)*.16,side*(sizes[i][2]/2+.01)],[.035,.24,.012],'#fff0d2',Q.axis([0,0,1],k%2?.65:-.45),true)}
P.joint(dolls[1],dolls[0],[0,.72,0],[0,-.42,0],rad(35),rad(35));P.joint(dolls[1],dolls[2],[-.63,.5,0],[.31,.5,0],rad(115),rad(50));P.joint(dolls[1],dolls[3],[.63,.5,0],[-.31,.5,0],rad(115),rad(50));P.joint(dolls[1],dolls[4],[-.32,-.7,0],[0,.74,0],rad(78),rad(38));P.joint(dolls[1],dolls[5],[.32,-.7,0],[0,.74,0],rad(78),rad(38));
const fractures=b=>Math.min(caps[b.part],Math.floor(b.damage*caps[b.part]/100)),totalBones=()=>dolls.reduce((s,b)=>s+fractures(b),0);
function toast(s){$('toast').textContent=s;toastUntil=performance.now()+2800;$('toast').style.opacity=1}
function ping(speed,broken){if(!soundOn||!audio||audio.state!=='running'||P.time-lastSound<.1)return;lastSound=P.time;let osc=audio.createOscillator(),gain=audio.createGain();osc.type=broken?'square':'triangle';osc.frequency.setValueAtTime(broken?240:110,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(45,audio.currentTime+.065);gain.gain.setValueAtTime(Math.min(.09,speed*.003),audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.08);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.09)}
function sparks(p,count=8){for(let i=0;i<count;i++){if(effects.length>=120){R.remove(effects[0].m);effects.shift()}let m=decoration(p,[.07,.07,.07],i%2?'#fff5d8':'#ffb363',Q.id(),'box',false);m.unlit=.7;effects.push({m,v:[(random()-.5)*4,2+random()*4,(random()-.5)*4],life:.45+random()*.2})}}
P.onImpact=c=>{const treeBody=c.a?.tree?c.a:c.b?.tree?c.b:null;if(treeBody&&c.speed>8){shatterTree(treeBody.tree,c.speed);return}if(round.phase!=='falling'||strong)return;for(let b of [c.a,c.b]){if(!b||b.group!=='doll'||P.time-b.lastHit<.28)continue;let speed=c.speed;if(speed<5)continue;b.lastHit=P.time;let before=b.damage,old=fractures(b),gain=Math.min(100-before,Math.pow(speed-4.5,1.42)*1.22);if(gain<=.05)continue;b.damage=clamp(before+gain,0,100);let broken=fractures(b)-old,points=Math.round(gain*18+broken*240);round.score+=points;round.hits++;round.maxSpeed=Math.max(round.maxSpeed,speed);for(let j of P.joints)if(j.b===b&&b.part>=2){j.cone=j.baseCone+rad(12)*b.damage/100;j.twist=j.baseTwist+rad(20)*b.damage/100}sparks(c.p,broken?10:5);ping(speed,broken>0);$('impact').innerHTML='<strong>+ '+points+'</strong><span>'+names[b.part]+(broken?' · 骨折 +'+broken:' · 碰撞')+'</span>';impactUntil=performance.now()+780;$('impact').style.opacity=1;$('injuryText').textContent=names[b.part]+(broken?' 骨折':' 受伤');let node=document.querySelector('[data-part="'+b.part+'"]');node.classList.remove('crackflash');void node.offsetWidth;node.classList.add('crackflash')}};
function support(x,z,ceiling){let y=0,o=[x,Math.max(.2,ceiling),z];for(let b of P.bodies){if(b.mass)continue;let t=rayBody(o,[0,-1,0],b,150);if(t!==null)y=Math.max(y,o[1]-t)}return y}
function animatedPose(dt,moving=false){let swing=Math.sin(walk)*walkBlend*.55,air=!grounded,angles=[0,0,swing,-swing,-swing,swing];if(air){angles[2]-=.35;angles[3]-=.35;angles[4]+=.12;angles[5]+=.12}let poses=layout.map((base,i)=>{let q=Q.axis([0,1,0],actorYaw),p=[...base];if(i>1){let anchor=i<4?[i===2?-.63:.63,2.7,0]:[i===4?-.32:.32,1.5,0],localQ=Q.axis([1,0,0],angles[i]);p=V.add(anchor,Q.rot(localQ,V.sub(base,anchor)));q=Q.mul(q,localQ)}return {p:Q.rot(Q.axis([0,1,0],actorYaw),p),q}});
 let minY=Math.min(...[4,5].map(i=>{let h=sizes[i].map(x=>x/2),a=angles[i];return poses[i].p[1]-Math.abs(Math.cos(a))*h[1]-Math.abs(Math.sin(a))*h[2]})),lift=grounded?.015-minY:0;
 for(let i=0;i<6;i++){let b=dolls[i],old=[...b.p],oq=[...b.q];b.p=V.add(hero,V.add(poses[i].p,[0,lift,0]));b.q=poses[i].q;b.animV=dt?V.mul(V.sub(b.p,old),1/dt):[0,0,0];b.animW=dt?V.mul(Q.delta(b.q,oq),1/dt):[0,0,0]}}
function controls(dt){jumpBuffer=Math.max(0,jumpBuffer-dt);coyote=grounded?.12:Math.max(0,coyote-dt);if(strong&&jumpBuffer>0&&(grounded||coyote>0)){velY=9.4;grounded=false;coyote=0;jumpBuffer=0;airStart=hero[1]}let fw=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-stick.y,side=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+stick.x,move=V.add(V.mul([-Math.sin(yaw),0,-Math.cos(yaw)],fw),V.mul([Math.cos(yaw),0,-Math.sin(yaw)],side)),length=V.len(move);if(length>1)move=V.mul(move,1/length);let moving=length>.08,speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?10.0:7.0;moveVelocity=V.mul(move,speed);let next=V.add(hero,V.mul(moveVelocity,dt));for(const tree of breakableTrees){if(tree.broken)continue;let dx=next[0]-tree.x,dz=next[2]-tree.z,d=Math.hypot(dx,dz);if(d<.85&&hero[1]<tree.height+1){let impact=V.len(moveVelocity);if(impact>=9.5){shatterTree(tree,impact)}else{let nx=dx/(d||1),nz=dz/(d||1);next[0]=tree.x+nx*.86;next[2]=tree.z+nz*.86;moveVelocity=[0,moveVelocity[1],0]}}}next[0]=clamp(next[0],-143,143);next[2]=clamp(next[2],-154,118);let floor=support(next[0],next[2],hero[1]+.38);if(floor>hero[1]+.37){next[0]=hero[0];next[2]=hero[2];floor=support(hero[0],hero[2],hero[1]+.38)}
 velY-=P.gravity*dt;next[1]=hero[1]+velY*dt;if(next[1]<=floor&&velY<=0){next[1]=floor;velY=0;grounded=true;airStart=null}else{if(grounded)airStart=hero[1];grounded=false}hero=next;if(moving){let target=Math.atan2(move[0],move[2]),delta=Math.atan2(Math.sin(target-actorYaw),Math.cos(target-actorYaw));actorYaw+=delta*Math.min(1,dt*14);walk+=dt*(speed>8?15:11)}walkBlend+=((moving?1:0)-walkBlend)*Math.min(1,dt*10);animatedPose(dt,moving);if(!grounded&&airStart!==null&&airStart-hero[1]>1.5)ragdoll([moveVelocity[0],velY,moveVelocity[2]])}
function ragdoll(velocity=null){if(!strong)return;strong=false;P.drag=null;keys.clear();stick.x=stick.y=0;stick.id=null;$('knob').style.transform='';moveVelocity=[0,0,0];if(round.phase==='ready')round.phase='falling';for(let b of dolls){b.active=true;b.v=velocity?[...velocity]:V.add(moveVelocity,[0,velY,0]);b.w=velocity?[-.65,.12,.16]:[0,0,0]}$('strength').textContent='🧸 布娃娃 OFF';$('strength').className='pill off';$('notice').textContent='布娃娃已接管 · 滑动空白转镜头 · 等待停稳结算';$('launch').innerHTML='结算本次<small>正在记录碰撞</small>'}
function launch(){if(round.phase==='complete'){reset();return}if(round.phase==='falling'){finish();return}let c=routes[route];if(Math.abs(hero[0]-c.x)<6&&hero[1]>c.h-1){hero=[c.x,c.h+.1,.20];actorYaw=Math.PI;animatedPose(0);ragdoll([0,1,-5.4])}else ragdoll([-Math.sin(yaw)*5.2,2,-Math.cos(yaw)*5.2]);toast('开始摔落 · 记录真实接触产生的碰撞得分')}
function heal(){reset(false);toast('全部治疗完成，已回到赛道起点')}
function reset(clear=true){if(clear)restoreTrees();P.drag=null;turning=null;strong=true;hero=[routes[route].x,routes[route].h,3.1];velY=0;walk=0;walkBlend=0;grounded=true;jumpBuffer=0;coyote=0;actorYaw=0;airStart=null;keys.clear();stick.x=stick.y=0;stick.id=null;$('knob').style.transform='';for(let b of dolls){b.active=false;b.v=[0,0,0];b.w=[0,0,0];b.damage=0;b.lastHit=-99}for(let j of P.joints){j.cone=j.baseCone;j.twist=j.baseTwist}round={phase:'ready',elapsed:0,still:0,score:0,maxSpeed:0,hits:0,assisted:!clear&&props.length>0};if(clear)clearProps();animatedPose(0);for(let e of effects)R.remove(e.m);effects=[];show('results',false);$('strength').className='pill enabled';$('strength').textContent='💪 力气 ON';$('launch').innerHTML='开始摔落<small>DROP TEST · F</small>';$('injuryText').textContent='完好无损';$('notice').textContent='移动探索，或点击「开始摔落」';$('routeName').textContent=routes[route].name;$('routeDesc').textContent=routes[route].desc;$('best').textContent=records[route].toLocaleString();$('impact').style.opacity=0;syncModels();updateHUD();camera(true)}

// v4.2 persistent score shop: only clean completed runs award spendable points.
const shopCatalog={bomb:{name:'炸弹',emoji:'💣',price:60000},spring:{name:'弹簧',emoji:'🌀',price:38000},box:{name:'木箱',emoji:'📦',price:12000},ball:{name:'保龄球',emoji:'🎳',price:26000},balloon:{name:'气球',emoji:'🎈',price:18000}};
let wallet=0,unlocked=new Set(['grab']);
try{const saved=JSON.parse(localStorage.getItem('noob-break-shop-v1')||'{}');wallet=Math.max(0,Math.floor(Number(saved.wallet)||0));if(Array.isArray(saved.unlocked))for(const k of saved.unlocked)if(k in shopCatalog)unlocked.add(k)}catch{}
function saveShop(){try{localStorage.setItem('noob-break-shop-v1',JSON.stringify({wallet,unlocked:[...unlocked]}))}catch{}}
function refreshShop(){
$('walletMini').textContent=wallet.toLocaleString();$('walletBalance').textContent=wallet.toLocaleString();
$('shopGrid').innerHTML=Object.entries(shopCatalog).map(([id,p])=>'<div class="shop-item"><div class="emoji">'+p.emoji+'</div><strong>'+p.name+'</strong><small>'+(unlocked.has(id)?'已永久解锁':p.price+' 积分')+'</small><button data-buy="'+id+'" '+(unlocked.has(id)||wallet<p.price?'disabled':'')+'>'+(unlocked.has(id)?'已拥有':wallet<p.price?'积分不足':'购买解锁')+'</button></div>').join('');
for(const b of document.querySelectorAll('[data-buy]'))b.onclick=()=>{const id=b.dataset.buy,p=shopCatalog[id];if(!p||unlocked.has(id)||wallet<p.price)return;wallet-=p.price;unlocked.add(id);saveShop();refreshShop();toast('已解锁 '+p.name+'！打开道具栏即可使用')};
for(const b of document.querySelectorAll('[data-prop]')){let id=b.dataset.prop;if(id==='grab')continue;let p=shopCatalog[id];b.textContent=p.emoji+' '+p.name+(unlocked.has(id)?'':' 🔒')}
}
function toggleShop(open){$('shopPanel').classList.toggle('hidden',!open);if(open){keys.clear();stick.x=stick.y=0;refreshShop()}}
$('shopToggle').onclick=()=>toggleShop(true);$('shopClose').onclick=()=>toggleShop(false);
refreshShop();

function finish(){if(round.phase!=='falling')return;round.phase='complete';if(!round.assisted){const earned=Math.max(0,Math.floor(round.score));wallet+=earned;saveShop();refreshShop()}let old=records[route],fresh=!round.assisted&&round.score>old;if(fresh){records[route]=round.score;try{localStorage.setItem('noob-break-records-v4',JSON.stringify(records))}catch{}}$('finalScore').textContent=round.score.toLocaleString();$('finalBones').textContent=totalBones()+' / 48';$('finalSpeed').textContent=round.maxSpeed.toFixed(1)+' m/s';$('finalTime').textContent=round.elapsed.toFixed(1)+' s';$('resultBadge').textContent=round.assisted?'SANDBOX / 沙盒报告':fresh?'NEW RECORD / 新纪录':'DROP REPORT / 摔落报告';$('resultParts').textContent=dolls.filter(b=>b.damage>0).map(b=>names[b.part]+': '+fractures(b)+' 骨折点').join('　')||'这次没有达到受伤阈值，再试一次更高的摔落。';$('recordNote').textContent=round.assisted?'沙盒回合：不计纪录，也不奖励积分。':'本次获得 '+Math.floor(round.score).toLocaleString()+' 商店积分；积分与解锁道具保存在本机。';$('best').textContent=records[route].toLocaleString();$('launch').innerHTML='再来一次<small>治疗并回到起点</small>';show('results',true)}
function assisted(){round.assisted=true;$('notice').textContent='沙盒模式 · 使用道具不计挑战纪录'}
function clearProps(){for(let p of props){if(p.b)P.remove(p.b);for(let m of p.meshes)R.remove(m)}props=[]}
function spawn(type,position){if(type!=='grab'&&!unlocked.has(type)){toast('请先在商店解锁该道具');return}if(props.length>=18){toast('最多放置 18 个道具，请先清除一些');return}assisted();let p={type,b:null,meshes:[],born:P.time,cooldown:-99},pos=[...position];if(type==='spring'){pos[1]+=.12;p.pos=pos;p.meshes.push(decoration(pos,[1.2,.22,1.2],'#355f69'));for(let i=0;i<4;i++)p.meshes.push(decoration(V.add(pos,[0,.22+i*.11,0]),[.72,.05,.72],'#e9b760',Q.axis([0,1,0],i*.2)));p.meshes.push(decoration(V.add(pos,[0,.7,0]),[1.1,.17,1.1],'#e89258'))}else{let shape=['ball','bomb','balloon'].includes(type)?'sphere':'box',size=type==='box'?[1,1,1]:[.85,.85,.85];pos[1]+=type==='balloon'?1.5:.8;let b=P.add(new Body(pos,size,type==='balloon'?.22:type==='ball'?4:2,shape));b.group='prop';p.b=b;b.mesh=decoration(pos,size,type==='box'?'#c9985d':type==='ball'?'#567080':type==='balloon'?'#ed9891':'#424b59',Q.id(),shape);p.meshes.push(b.mesh);if(type==='balloon')p.meshes.push(decoration(V.add(pos,[0,-.85,0]),[.012,1.05,.012],'#f4ebce',Q.id(),'box',false))}props.push(p);toast(type==='bomb'?'炸弹已放置：3 秒后爆炸':type==='spring'?'弹簧已放置：进入布娃娃模式可弹起':'道具已放置')}
function updateProps(dt){for(let p of props){if(p.type==='balloon'){p.b.v[1]+=P.gravity*1.8*dt;if(p.b.p[1]>60)p.b.v[1]=Math.min(p.b.v[1],0)}if(p.type==='spring'){let body=dolls.find(b=>Math.abs(b.p[0]-p.pos[0])<1.1&&Math.abs(b.p[2]-p.pos[2])<1.1&&b.p[1]>p.pos[1]&&b.p[1]<p.pos[1]+1.7);if(body&&P.time-p.cooldown>.9){if(strong)ragdoll([0,16,0]);for(let b of dolls)b.v[1]=Math.max(b.v[1],15);p.cooldown=P.time;sparks(V.add(p.pos,[0,.8,0]),8)}}if(p.type==='bomb'&&!p.exploded&&P.time-p.born>=3){p.exploded=true;let origin=p.b.p,near=V.len(V.sub(dolls[1].p,origin))<9;if(near&&strong)ragdoll();for(let b of P.bodies){if(!b.active||b===p.b)continue;let delta=V.sub(b.p,origin),d=V.len(delta);if(d<10){let dir=V.norm(V.add(delta,[0,1,0]));b.v=V.add(b.v,V.mul(dir,24*(1-d/10)));b.w=V.add(b.w,[1.2,.5,.3])}}sparks(origin,20);P.remove(p.b);for(let m of p.meshes)R.remove(m);ping(20,true)}}props=props.filter(p=>!p.exploded);for(let p of props)if(p.b){p.meshes[0].p=[...p.b.p];p.meshes[0].q=[...p.b.q];if(p.type==='balloon')p.meshes[1].p=V.add(p.b.p,[0,-.9,0])}}
function syncModels(){for(let b of dolls){b.mesh.p=[...b.p];b.mesh.q=[...b.q];b.mesh.visible=!(first&&b.part===0);b.mesh.c=V.mix(b.base,[1,.58,.35],b.damage/100*.38);for(let o of b.ornaments){o.m.p=b.world(o.p);o.m.q=Q.mul(b.q,o.q);o.m.visible=b.mesh.visible&&(!o.crack||fractures(b)>0)}}}
function updateHUD(){$('score').textContent=round.score.toLocaleString();$('bones').innerHTML=totalBones()+'<small> / 48</small>';$('speed').innerHTML=round.maxSpeed.toFixed(1)+'<small> m/s</small>';for(let b of dolls){let e=document.querySelector('[data-part="'+b.part+'"]');e.classList.toggle('hurt',b.damage>0);e.classList.toggle('broken',fractures(b)>0);e.title=names[b.part]+'：'+Math.round(b.damage)+'% 受伤，'+fractures(b)+' 骨折点'}}
function camera(snap=false){let target=first?V.add(dolls[0].p,[0,.06,0]):V.add(dolls[1].p,[0,.3,0]),dir=[-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],eye;if(first){eye=target;target=V.add(eye,dir)}else{eye=V.add(target,[-dir[0]*distance,-dir[1]*distance+1,-dir[2]*distance]);let delta=V.sub(eye,target),len=V.len(delta),n=V.norm(delta);for(let b of P.bodies){if(b.mass)continue;let t=rayBody(target,n,b,len);if(t!==null&&t>.3&&t<len)len=Math.max(1,t-.3)}eye=V.add(target,V.mul(n,len));eye[1]=Math.max(.6,eye[1])}R.eye=snap||first?eye:V.mix(R.eye,eye,.16);R.target=snap||first?target:V.mix(R.target,target,.18)}
function step(dt){if(strong)controls(dt);updateProps(dt);P.step(dt);updateTreeFragments(dt);if(round.phase==='falling'){round.elapsed+=dt;let speed=dolls.reduce((s,b)=>s+V.len(b.v)+V.len(b.w)*.18,0)/6;round.still=round.elapsed>2&&speed<.75?round.still+dt:0;if(round.still>1.4||round.elapsed>18)finish()}for(let e of effects){e.life-=dt;e.v[1]-=12*dt;e.m.p=V.add(e.m.p,V.mul(e.v,dt));e.m.q=Q.step(e.m.q,[dt*3,dt*2,0]);if(e.life<=0)R.remove(e.m)}effects=effects.filter(e=>e.life>0);for(let g of clouds)for(let m of g)m.p[0]+=dt*.08}
function jump(){if(!strong||pause())return;jumpBuffer=.18;if(grounded||coyote>0){velY=9.4;grounded=false;coyote=0;jumpBuffer=0;airStart=hero[1]}}
function pause(){return !$('shopPanel').classList.contains('hidden')||!entered||!$('settings').classList.contains('hidden')||!$('results').classList.contains('hidden')}
const canvas=$('viewport');canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(pause()||turning)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);let ray=R.ray(e.clientX,e.clientY);
 if(tool!=='grab'){let t=ray.d[1]<-.001?-ray.o[1]/ray.d[1]:null;for(let b of P.bodies){if(b.mass)continue;let a=rayBody(ray.o,ray.d,b,100);if(a!==null&&(t===null||a<t))t=a}if(t!==null&&t>0&&t<100)spawn(tool,V.add(ray.o,V.mul(ray.d,t)));else toast('请点击地面、平台或斜坡放置道具');return}
 turning={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch}});
canvas.addEventListener('pointermove',e=>{if(turning&&turning.id===e.pointerId){yaw=turning.yaw-(e.clientX-turning.x)*.006;pitch=clamp(turning.pitch+(e.clientY-turning.y)*.004,-1.1,1.15)}});
function release(e){if(turning?.id===e.pointerId)turning=null;}for(let ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,release);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=clamp(distance+e.deltaY*.012,4,24)},{passive:false});
const joy=$('joystick');function moveStick(e){let r=joy.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=r.width*.31,len=Math.hypot(dx,dy);if(len>max){dx*=max/len;dy*=max/len}stick.x=dx/max;stick.y=dy/max;$('knob').style.transform='translate('+dx+'px,'+dy+'px)'}
joy.addEventListener('pointerdown',e=>{e.preventDefault();if(!strong)return;if(stick.id!==null)return;stick.id=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e)});joy.addEventListener('pointermove',e=>{if(strong&&stick.id===e.pointerId)moveStick(e)});for(let ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,e=>{if(stick.id===e.pointerId){stick.id=null;stick.x=stick.y=0;$('knob').style.transform=''}});
function view(){first=!first;$('camera').textContent=first?'◉ 第一人称':'◉ 第三人称';$('crosshair').style.display=first?'block':'none';syncModels();camera(true)}
$('start').onclick=()=>{entered=true;show('intro',false)};$('launch').onclick=()=>{if(!pause())launch()};$('retry').onclick=()=>reset();$('heal').onclick=heal;$('strength').onclick=()=>strong?ragdoll():heal();$('jump').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();jump()});$('jump').addEventListener('click',e=>{if(e.detail===0)jump()});$('camera').onclick=view;$('slow').onclick=()=>{slow=!slow;$('slow').classList.toggle('active',slow);$('slow').textContent=slow?'◷ 0.35×':'◷ 慢动作'};$('routeSelect').onchange=e=>{route=+e.target.value;reset();toast('已切换：'+routes[route].name)};
$('menu').onclick=()=>{show('settings',true);keys.clear();stick.x=stick.y=0};$('closeMenu').onclick=()=>show('settings',false);$('closeResult').onclick=()=>show('results',false);$('resultRetry').onclick=()=>reset();$('propsToggle').onclick=()=>show('propsPanel',$('propsPanel').classList.contains('hidden'));
document.querySelectorAll('[data-prop]').forEach(b=>b.onclick=()=>{if(b.dataset.prop!=='grab'&&!unlocked.has(b.dataset.prop)){toggleShop(true);toast('先用挑战积分购买道具');return}tool=b.dataset.prop;document.querySelectorAll('[data-prop]').forEach(x=>x.classList.toggle('selected',x===b));toast(tool==='grab'?'镜头模式：滑动空白处转镜头':'点击场景放置道具')});$('clearProps').onclick=()=>{clearProps();tool='grab';document.querySelectorAll('[data-prop]').forEach(x=>x.classList.toggle('selected',x.dataset.prop==='grab'));toast('已清除全部道具')};
$('sound').onclick=async()=>{try{audio ||= new (window.AudioContext||window.webkitAudioContext)();await audio.resume();soundOn=!soundOn;$('sound').textContent=soundOn?'开启':'关闭'}catch{toast('当前浏览器无法开启音效')}};$('quality').onclick=()=>{R.quality=!R.quality;R.resize();$('quality').textContent=R.quality?'精致':'流畅'};$('fullscreen').onclick=async()=>{try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('此浏览器不支持网页全屏，请从主屏幕启动');if(screen.orientation?.lock)await screen.orientation.lock('landscape')}catch{toast('请手动横屏；主屏幕启动可减少浏览器工具栏')}};
$('update').onclick=async()=>{if(window.noobSW){await window.noobSW.update();toast('已检查更新；新版本就绪后自动刷新')}else toast('请从 HTTPS 游戏网址打开以启用 PWA')};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(['Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();if(pause())return;if(strong||!['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code))keys.add(e.code);if(e.repeat)return;if(e.code==='KeyR')strong?ragdoll():heal();if(e.code==='KeyC')view();if(e.code==='KeyF')launch();if(e.code==='Space'&&strong)jump()});window.addEventListener('keyup',e=>keys.delete(e.code));
function unfocus(){keys.clear();stick.x=stick.y=0;stick.id=null;$('knob').style.transform='';P.drag=null;turning=null;acc=0}window.addEventListener('blur',unfocus);document.addEventListener('visibilitychange',unfocus);
R.floorAt=(x,z,y)=>support(x,z,y);reset();show('loading',false);show('intro',true);let last=performance.now();function loop(t){requestAnimationFrame(loop);let dt=Math.min((t-last)/1000,.05);last=t;if(!pause()&&!document.hidden){acc+=dt*(slow?.35:1);let n=0;while(acc>=1/120&&n<6){step(1/120);acc-=1/120;n++}}syncModels();camera();R.render();if(++frame%5===0)updateHUD();if(t>impactUntil)$('impact').style.opacity=0;if(t>toastUntil)$('toast').style.opacity=0}requestAnimationFrame(loop);
if(new URLSearchParams(location.search).has('test'))window.__LAB={P,R,dolls,routes,get round(){return round},get strong(){return strong},get hero(){return hero},get props(){return props},launch,reset,heal,spawn,view,setRoute:i=>{route=i;$('routeSelect').value=i;reset()},advance:s=>{for(let i=0;i<Math.round(s*120);i++){step(1/120);if(round.phase==='complete')break}syncModels();updateHUD();camera(true);R.render()},begin:()=>{entered=true;show('intro',false)},state:()=>({route,phase:round.phase,score:round.score,bones:totalBones(),speed:round.maxSpeed,elapsed:round.elapsed,assisted:round.assisted,strong,hero:[...hero],jointError:P.error(),bodies:dolls.map(b=>({p:b.p,q:b.q,v:b.v,damage:b.damage}))})};
