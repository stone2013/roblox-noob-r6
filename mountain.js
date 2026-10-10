/* Continuous, shared snow mountain surface for Break Lab. */
import {V,Q} from './engine.js?v=4.9.3';

const BOUNDS={minX:8,maxX:102,minZ:-104,maxZ:30};
const COLS=32,ROWS=44;
const peaks=[
 {x:55,z:2,h:33,sx:19,sz:23},
 {x:37,z:-17,h:43,sx:15,sz:19},
 {x:77,z:-31,h:38,sx:17,sz:20},
 {x:34,z:-57,h:34,sx:16,sz:21},
 {x:60,z:-69,h:24,sx:19,sz:20},
 {x:83,z:-67,h:23,sx:16,sz:19}
];
const ridges=[
 [[55,2],[47,-7],[37,-17],[47,-25],[62,-30],[77,-31],[68,-42],[55,-53],[48,-62],[60,-69]],
 [[37,-17],[30,-27],[29,-40],[34,-57]],
 [[77,-31],[84,-43],[86,-56],[83,-67]]
];
const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function rawHeight(x,z){
 let base=1.1+16*Math.exp(-(((x-56)/37)**2)-(((z+36)/56)**2)),h=base;
 for(const p of peaks)h=Math.max(h,base+p.h*Math.exp(-(((x-p.x)/p.sx)**2)-(((z-p.z)/p.sz)**2)));
 // Connect summits with narrow, irregular ridges while keeping deep saddles.
 for(const line of ridges)for(let i=0;i<line.length-1;i++){
  const a=line[i],b=line[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz;
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l2));
  const px=a[0]+dx*t,pz=a[1]+dz*t,d=Math.hypot(x-px,z-pz),along=Math.min(Math.hypot(x-a[0],z-a[1]),Math.hypot(x-b[0],z-b[1]));
  const endFade=.35+.65*smooth(0,8,along),ridgeH=(24+9*Math.sin(i*1.7+line[0][0]))*Math.exp(-((d/6.3)**2))*endFade;
  h=Math.max(h,base+ridgeH);
 }
 // Two eroded gullies cut between the summit ridges.
 const g1=39+7*Math.sin((z+32)*.075),g2=69+6*Math.sin((z+57)*.09);
 h-=7*Math.exp(-(((x-g1)/4.4)**2)-(((z+38)/34)**2));
 h-=5*Math.exp(-(((x-g2)/4.2)**2)-(((z+50)/30)**2));
 const envelope=Math.min(smooth(8,20,x),1-smooth(91,102,x),smooth(-104,-89,z),1-smooth(16,30,z));
 const jag=(Math.sin(x*.31+Math.sin(z*.12))*Math.cos(z*.27)+.45*Math.sin((x+z)*.53))*2.2;
 return Math.max(0,(h+jag*smooth(0,10,h))*envelope);
}
const dx=(BOUNDS.maxX-BOUNDS.minX)/COLS,dz=(BOUNDS.maxZ-BOUNDS.minZ)/ROWS;
const heights=Array.from({length:(ROWS+1)*(COLS+1)},(_,k)=>{
 const row=Math.floor(k/(COLS+1)),col=k%(COLS+1);
 return rawHeight(BOUNDS.minX+col*dx,BOUNDS.minZ+row*dz);
});
const at=(row,col)=>heights[row*(COLS+1)+col];
function surfaceAt(x,z){
 if(x<BOUNDS.minX||x>BOUNDS.maxX||z<BOUNDS.minZ||z>BOUNDS.maxZ)return {height:0,normal:[0,1,0]};
 const gx=Math.min(COLS,Math.max(0,(x-BOUNDS.minX)/dx)),gz=Math.min(ROWS,Math.max(0,(z-BOUNDS.minZ)/dz));
 const c=Math.floor(gx),r=Math.floor(gz),fx=gx-c,fz=gz-r,h00=at(r,c),h10=at(r,c+1),h01=at(r+1,c),h11=at(r+1,c+1);
 let tri,point;
 if(fx+fz<=1){tri=[[0,h00,0],[dx,h10,0],[0,h01,dz]];point=[fx*dx,h00+fx*(h10-h00)+fz*(h01-h00),fz*dz]}
 else{tri=[[dx,h10,0],[0,h01,dz],[dx,h11,dz]];point=[fx*dx,h10*(1-fz)+h01*(1-fx)+h11*(fx+fz-1),fz*dz]}
 let n=V.norm(V.cross(V.sub(tri[1],tri[0]),V.sub(tri[2],tri[0])));if(n[1]<0)n=V.mul(n,-1);
 return {height:point[1],normal:n};
}
function raycast(o,d,max=120){
 const stride=.55,steps=Math.ceil(max/stride);let previous=null;
 for(let i=0;i<=steps;i++){
  const t=Math.min(max,i*stride),p=V.add(o,V.mul(d,t)),gap=p[1]-surfaceAt(p[0],p[2]).height;
  if(previous&&previous.gap>0&&gap<=0){const f=previous.gap/(previous.gap-gap);return previous.t+(t-previous.t)*f}
  previous={t,gap};
 }
 return null;
}
const matFor=(x,z,h,n)=>h>31&&n[1]>.48?'snow':h<11?'shadow':'rock';
function createMountain({R,P}){
 const buffers={rock:[],snow:[],shadow:[]};
 const put=(name,pts)=>{
  const n=V.norm(V.cross(V.sub(pts[1],pts[0]),V.sub(pts[2],pts[0])));if(n[1]<0)n=V.mul(n,-1);
  for(const p of pts)buffers[name].push(...p,...n);
 };
 const pt=(r,c)=>[BOUNDS.minX+c*dx,at(r,c),BOUNDS.minZ+r*dz];
 for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
  for(const ids of [[ [r,c],[r+1,c],[r,c+1] ],[ [r,c+1],[r+1,c],[r+1,c+1] ]]){
   const verts=ids.map(([rr,cc])=>pt(rr,cc)),n=V.norm(V.cross(V.sub(verts[1],verts[0]),V.sub(verts[2],verts[0])));if(n[1]<0)n=V.mul(n,-1);
   const center=verts.reduce((a,b)=>V.add(a,b),[0,0,0]).map(v=>v/3),height=center[1],material=matFor(center[0],center[2],height,n);
   put(material,verts);
  }
 }
 for(const [name,data] of Object.entries(buffers)){
  if(!data.length)continue;
  R.registerMesh('snowmountain-'+name,new Float32Array(data));
  const color=name==='snow'?'#eaf5fa':name==='shadow'?'#526876':'#718a98';
  const mesh=R.add([0,0,0],[1,1,1],color,'snowmountain-'+name,Q.id());mesh.cast=true;
 }
 P.terrainAt=surfaceAt;
 return {surfaceAt,raycast,bounds:BOUNDS,triangleCount:buffers.rock.length/18+buffers.snow.length/18+buffers.shadow.length/18};
}
export {createMountain,surfaceAt,raycast,BOUNDS};
