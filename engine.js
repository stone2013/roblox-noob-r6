/* Break Lab engine 4.0 — dependency-free WebGL + position-based rigid bodies. */
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const V={add:(a,b)=>a.map((x,i)=>x+b[i]),sub:(a,b)=>a.map((x,i)=>x-b[i]),mul:(a,s)=>a.map(x=>x*s),dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(...a),norm:a=>{let l=Math.hypot(...a);return l>1e-9?a.map(x=>x/l):[0,0,0]},mix:(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t)};
export const Q={id:()=>[0,0,0,1],mul:(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]],inv:q=>[-q[0],-q[1],-q[2],q[3]],norm:q=>{let l=Math.hypot(...q);return q.map(x=>x/l)},axis:(v,a)=>{let s=Math.sin(a/2);return [...V.mul(V.norm(v),s),Math.cos(a/2)]},rot:(q,v)=>{let t=V.mul(V.cross(q.slice(0,3),v),2);return V.add(v,V.add(V.mul(t,q[3]),V.cross(q.slice(0,3),t)))},step:(q,w)=>{let l=V.len(w);return l>1e-10?Q.norm(Q.mul(Q.axis(w,l),q)):q},delta:(a,b)=>{let q=Q.mul(a,Q.inv(b));if(q[3]<0)q=q.map(v=>-v);let s=Math.hypot(q[0],q[1],q[2]);return s<1e-9?[0,0,0]:V.mul(q.slice(0,3),2*Math.atan2(s,q[3])/s)}};
const AX=[[1,0,0],[0,1,0],[0,0,1]];let nextId=0;
export class Body{
 constructor(p,size,mass=0,shape='box',rotation=Q.id()){this.id=++nextId;this.p=[...p];this.q=[...rotation];this.size=size;this.h=size.map(v=>v/2);this.mass=mass;this.active=mass>0;this.shape=shape;this.v=[0,0,0];this.w=[0,0,0];this.radius=V.len(this.h);this.group='world';this.friction=.5;this.tag='';this.impacts=0;this.invDiag=shape==='sphere'?size.map(()=>mass?5/(2*mass*this.h[0]**2):0):size.map((_,i)=>mass?12/(mass*(size[(i+1)%3]**2+size[(i+2)%3]**2)):0)}
 get im(){return this.active?1/this.mass:0}
 invI(v){return this.active?Q.rot(this.q,Q.rot(Q.inv(this.q),v).map((x,i)=>x*this.invDiag[i])):[0,0,0]}
 world(v){return V.add(this.p,Q.rot(this.q,v))}
 velocity(r){return V.add(this.v,V.cross(this.w,r))}
 impulse(j,r=[0,0,0]){if(!this.active)return;this.v=V.add(this.v,V.mul(j,this.im));this.w=V.add(this.w,this.invI(V.cross(r,j)))}
 vertices(){let v=[];for(let x of [-1,1])for(let y of [-1,1])for(let z of [-1,1])v.push(this.world([this.h[0]*x,this.h[1]*y,this.h[2]*z]));return v}
}
function shift(b,j,r){if(!b.im)return;b.p=V.add(b.p,V.mul(j,b.im));let da=b.invI(V.cross(r,j)),l=V.len(da);if(l>.22)da=V.mul(da,.22/l);b.q=Q.step(b.q,da)}
function weight(b,r,n){return b.im+V.dot(V.cross(r,n),b.invI(V.cross(r,n)))}
function solvePoint(a,b,la,lb,target=null,soft=0){let pa=a.world(la),pb=b?b.world(lb):target,delta=V.sub(pa,pb),d=V.len(delta);if(d<1e-6)return;let n=V.mul(delta,1/d),ra=V.sub(pa,a.p),rb=b?V.sub(pb,b.p):[0,0,0],k=weight(a,ra,n)+(b?weight(b,rb,n):0)+soft;if(!k)return;let j=V.mul(n,-Math.min(d,.35)/k);shift(a,j,ra);if(b)shift(b,V.mul(j,-1),rb)}
function limitJoint(j){let {a,b,cone,twist}=j;let rel=Q.norm(Q.mul(Q.inv(a.q),b.q));if(rel[3]<0)rel=rel.map(x=>-x);let tw=Q.norm([0,rel[1],0,Math.abs(rel[3])+1e-10]),sw=Q.mul(rel,Q.inv(tw));let swingV=Q.delta(sw,Q.id()),angle=V.len(swingV);if(angle>cone)angleCorrect(a,b,Q.rot(a.q,V.mul(swingV,1/angle)),angle-cone);let ta=2*Math.atan2(tw[1],tw[3]);if(Math.abs(ta)>twist)angleCorrect(a,b,Q.rot(a.q,[0,Math.sign(ta),0]),Math.abs(ta)-twist)}
function angleCorrect(a,b,axis,e){let ia=V.dot(axis,a.invI(axis)),ib=V.dot(axis,b.invI(axis)),k=ia+ib;if(k<1e-9)return;let l=Math.min(e,.2)/k;if(a.active)a.q=Q.step(a.q,V.mul(a.invI(axis),l));if(b.active)b.q=Q.step(b.q,V.mul(b.invI(axis),-l))}
function supportPoint(body,n,min=true){let vs=body.vertices(),ds=vs.map(v=>V.dot(v,n)),d=min?Math.min(...ds):Math.max(...ds),v=vs.filter((_,i)=>Math.abs(ds[i]-d)<.04);return V.mul(v.reduce((a,b)=>V.add(a,b),[0,0,0]),1/v.length)}
export function rayBody(o,d,b,max=200){let p=Q.rot(Q.inv(b.q),V.sub(o,b.p)),v=Q.rot(Q.inv(b.q),d);if(b.shape==='sphere'){let a=V.dot(p,v),c=V.dot(p,p)-b.h[0]**2,k=a*a-c;if(k<0)return null;let t=-a-Math.sqrt(k);return t>=0&&t<=max?t:null}let t0=0,t1=max;for(let i=0;i<3;i++){if(Math.abs(v[i])<1e-9){if(Math.abs(p[i])>b.h[i])return null;continue}let a=(-b.h[i]-p[i])/v[i],z=(b.h[i]-p[i])/v[i];if(a>z)[a,z]=[z,a];t0=Math.max(t0,a);t1=Math.min(t1,z);if(t0>t1)return null}return t0}
function collide(a,b){if(V.len(V.sub(a.p,b.p))>a.radius+b.radius+.03)return null;if(a.shape==='sphere'||b.shape==='sphere'){
 if(a.shape!=='sphere'){let c=collide(b,a);return c?{n:V.mul(c.n,-1),p:c.p,depth:c.depth}:null}
 if(b.shape==='sphere'){let d=V.sub(a.p,b.p),l=V.len(d),depth=a.h[0]+b.h[0]-l,n=l>1e-9?V.mul(d,1/l):[0,1,0];return depth>0?{n,p:V.sub(a.p,V.mul(n,a.h[0])),depth}:null}
 let local=Q.rot(Q.inv(b.q),V.sub(a.p,b.p)),near=local.map((x,i)=>clamp(x,-b.h[i],b.h[i])),delta=V.sub(local,near),len=V.len(delta);if(len>a.h[0])return null;let n;if(len<1e-8){let gaps=local.map((x,i)=>b.h[i]-Math.abs(x)),i=gaps.indexOf(Math.min(...gaps));n=[0,0,0];n[i]=Math.sign(local[i])||1;len=-gaps[i]}else n=V.mul(delta,1/len);n=Q.rot(b.q,n);return{n,p:V.sub(a.p,V.mul(n,a.h[0])),depth:a.h[0]-len}}
 let aa=AX.map(v=>Q.rot(a.q,v)),bb=AX.map(v=>Q.rot(b.q,v)),axes=[...aa,...bb];for(let x of aa)for(let y of bb){let z=V.cross(x,y);if(V.len(z)>.015)axes.push(V.norm(z))}let delta=V.sub(a.p,b.p),depth=1e10,normal;for(let n of axes){let ra=aa.reduce((s,v,i)=>s+Math.abs(V.dot(v,n))*a.h[i],0),rb=bb.reduce((s,v,i)=>s+Math.abs(V.dot(v,n))*b.h[i],0),dist=V.dot(delta,n),overlap=ra+rb-Math.abs(dist);if(overlap<=0)return null;if(overlap<depth){depth=overlap;normal=dist>=0?n:V.mul(n,-1)}}let p=supportPoint(a,normal,true);return{n:normal,p,depth}}
export class Physics{
 constructor(){this.bodies=[];this.joints=[];this.drag=null;this.time=0;this.onImpact=()=>{};this.gravity=22;this.iterations=16;this.contactSlop=.003;this.lastPairCount=0;this.terrainAt=null}
 add(b){this.bodies.push(b);return b}
 remove(b){this.bodies=this.bodies.filter(v=>v!==b)}
 joint(a,b,la,lb,cone,twist){let j={a,b,la,lb,cone,twist,baseCone:cone,baseTwist:twist};this.joints.push(j);return j}
 step(dt){this.time+=dt;let active=this.bodies.filter(b=>b.active),contacts=new Map();
 for(let b of active){b.oldP=[...b.p];b.oldQ=[...b.q];b.v[1]-=this.gravity*dt;b.v=V.mul(b.v,Math.exp(-.1*dt));b.w=V.mul(b.w,Math.exp(-1.05*dt));let speed=V.len(b.v);if(speed>58)b.v=V.mul(b.v,58/speed);if(V.len(b.w)>25)b.w=V.mul(V.norm(b.w),25);b.p=V.add(b.p,V.mul(b.v,dt));b.q=Q.step(b.q,V.mul(b.w,dt))}
 // Broad phase: prune static colliders by their precomputed world-space AABBs.
// Rotated cliffs use conservative bounds, so legitimate contacts are not skipped.
const staticBodies=this.bodies.filter(b=>!b.active&&b.mass===0);
const dynamicBodies=active;
const bound=b=>{const ax=Q.rot(b.q,[b.h[0],0,0]),ay=Q.rot(b.q,[0,b.h[1],0]),az=Q.rot(b.q,[0,0,b.h[2]]);
 return [0,1,2].map(i=>Math.abs(ax[i])+Math.abs(ay[i])+Math.abs(az[i]))};
const statics=staticBodies.map(b=>({b,ext:bound(b)}));
const pairs=[];
for(let a of dynamicBodies){
 const ea=bound(a),sweep=[Math.abs(a.v[0])*dt+.12,Math.abs(a.v[1])*dt+.12,Math.abs(a.v[2])*dt+.12];
 for(let entry of statics){const b=entry.b,eb=entry.ext;
 if(Math.abs(a.p[0]-b.p[0])>ea[0]+eb[0]+sweep[0]||
    Math.abs(a.p[1]-b.p[1])>ea[1]+eb[1]+sweep[1]||
    Math.abs(a.p[2]-b.p[2])>ea[2]+eb[2]+sweep[2])continue;
 pairs.push([a,b])}
 for(let b of dynamicBodies){if(b.id<=a.id||a.group==='doll'&&b.group==='doll')continue;
 if(Math.abs(a.p[0]-b.p[0])>ea[0]+b.radius+.12||
    Math.abs(a.p[1]-b.p[1])>ea[1]+b.radius+.12||
    Math.abs(a.p[2]-b.p[2])>ea[2]+b.radius+.12)continue;
 pairs.push([a,b])}
}
this.lastPairCount=pairs.length;
 const resolve=(a,b,c,key)=>{let n=c.n,p=c.p,ra=V.sub(p,a.p),rb=b?V.sub(p,b.p):[0,0,0],k=weight(a,ra,n)+(b?weight(b,rb,n):0);if(k<1e-8)return;let speed=-V.dot(V.sub(a.velocity(ra),b?b.velocity(rb):[0,0,0]),n);if(!contacts.has(key)||speed>contacts.get(key).speed)contacts.set(key,{a,b,n,p,speed});let j=V.mul(n,Math.max(0,c.depth-this.contactSlop)*.78/k);shift(a,j,ra);if(b)shift(b,V.mul(j,-1),rb)};
 for(let k=0;k<this.iterations;k++){
  for(let j of this.joints){solvePoint(j.a,j.b,j.la,j.lb);limitJoint(j)}
  if(this.drag)solvePoint(this.drag.b,null,this.drag.local,null,this.drag.target,1.8);
  for(let a of active){let vs=a.shape==='sphere'?[V.add(a.p,[0,-a.h[0],0])]:a.vertices();for(let i=0;i<vs.length;i++)if(vs[i][1]<0)resolve(a,null,{n:[0,1,0],p:vs[i],depth:-vs[i][1]},a.id+':ground:'+i);
   if(this.terrainAt){if(a.shape==='sphere'){const s=this.terrainAt(a.p[0],a.p[2]);if(s&&s.height>0){const signed=(a.p[1]-s.height)*s.normal[1],depth=a.h[0]-signed;if(depth>0)resolve(a,null,{n:s.normal,p:V.sub(a.p,V.mul(s.normal,a.h[0])),depth},a.id+':terrain:sphere')}}else for(let i=0;i<vs.length;i++){const v=vs[i],s=this.terrainAt(v[0],v[2]);if(s&&s.height>v[1]&&s.normal[1]>.12){const depth=Math.min(1.2,(s.height-v[1])/s.normal[1]);resolve(a,null,{n:s.normal,p:v,depth},a.id+':terrain:'+i)}}}
  }
  for(let [a,b] of pairs){let c=collide(a,b);if(c)resolve(a,b,c,a.id+':'+b.id)}
 }
 for(let b of active){b.v=V.mul(V.sub(b.p,b.oldP),1/dt);b.w=V.mul(Q.delta(b.q,b.oldQ),1/dt);
 // Prevent numerical spikes when a high-speed ragdoll hits multiple cliff faces.
 const speed=V.len(b.v),spin=V.len(b.w);
 if(speed>60)b.v=V.mul(b.v,60/speed);
 if(spin>22)b.w=V.mul(b.w,22/spin);
}
 for(let c of contacts.values()){let {a,b,p,n}=c,ra=V.sub(p,a.p),rb=b?V.sub(p,b.p):[0,0,0],rv=V.sub(a.velocity(ra),b?b.velocity(rb):[0,0,0]),vn=V.dot(rv,n),k=weight(a,ra,n)+(b?weight(b,rb,n):0);if(k>0){let normalImpulse=Math.max(0,-vn/k);let j=V.mul(n,normalImpulse);a.impulse(j,ra);if(b)b.impulse(V.mul(j,-1),rb);let tangent=V.sub(rv,V.mul(n,vn)),tl=V.len(tangent);if(tl>1e-6){let t=V.mul(tangent,1/tl),kt=weight(a,ra,t)+(b?weight(b,rb,t):0),fr=Math.min(tl/Math.max(kt,1e-8),(normalImpulse+Math.max(0,c.speed)/k+this.gravity*dt/k)*Math.min(.8,Math.max(.15,Math.sqrt((a.friction??.5)*(b?.friction??.5)))));j=V.mul(t,-fr);a.impulse(j,ra);if(b)b.impulse(V.mul(j,-1),rb)}}if(c.speed>4.5)this.onImpact(c)}
 }
 error(){return Math.max(0,...this.joints.map(j=>V.len(V.sub(j.a.world(j.la),j.b.world(j.lb)))))}
}
function mm(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function model(p,q,s){let x=Q.rot(q,[s[0],0,0]),y=Q.rot(q,[0,s[1],0]),z=Q.rot(q,[0,0,s[2]]);return new Float32Array([...x,0,...y,0,...z,0,...p,1])}
function look(eye,target){let z=V.norm(V.sub(eye,target)),x=V.norm(V.cross([0,1,0],z)),y=V.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1])}
function perspective(aspect,fov){let t=1/Math.tan(fov/2),n=.1,f=400;return new Float32Array([t/aspect,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0])}
function ortho(s,n,f){return new Float32Array([1/s,0,0,0,0,1/s,0,0,0,0,-2/(f-n),0,0,0,-(f+n)/(f-n),1])}
function geometry(shape){let data=[];const tri=(a,b,c,n)=>[a,b,c].forEach(v=>data.push(...v,...n));if(shape==='box'){
 for(let i=0;i<3;i++)for(let sign of [-1,1]){let n=[0,0,0];n[i]=sign;let u=AX[(i+1)%3],v=V.mul(AX[(i+2)%3],sign),origin=V.mul(n,.5),p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>V.add(origin,V.add(V.mul(u,a/2),V.mul(v,b/2))));tri(p[0],p[1],p[2],n);tri(p[0],p[2],p[3],n)}}else{
 let rows=shape==='sphere'?10:1,cols=16;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let pt=(a,b)=>{let ang=a/cols*Math.PI*2,phi=b/rows*Math.PI;if(shape==='sphere')return [Math.sin(phi)*Math.cos(ang)*.5,Math.cos(phi)*.5,Math.sin(phi)*Math.sin(ang)*.5];return[Math.cos(ang)*.5,b-.5,Math.sin(ang)*.5]},p=[pt(x,y),pt(x+1,y),pt(x+1,y+1),pt(x,y+1)];for(let ids of (shape==='sphere'?[[0,1,2],[0,2,3]]:[[0,2,1],[0,3,2]])){let n=V.norm(V.cross(V.sub(p[ids[1]],p[ids[0]]),V.sub(p[ids[2]],p[ids[0]])));tri(...ids.map(i=>p[i]),n)}if(shape==='cylinder')for(let s of [-1,1]){let a=pt(x,s>0?1:0),b=pt(x+1,s>0?1:0);tri([0,s*.5,0],s>0?b:a,s>0?a:b,[0,s,0])}}}return new Float32Array(data)}
const vertex=`attribute vec3 p;attribute vec3 n;uniform mat4 model,view,light;varying vec3 world,normal;varying vec4 shadow;void main(){vec4 w=model*vec4(p,1.);world=w.xyz;normal=normalize(mat3(model)*n);shadow=light*w;gl_Position=view*w;}`;
const fragment=`precision highp float;varying vec3 world,normal;varying vec4 shadow;uniform vec3 color,eye;uniform sampler2D depth;uniform float studs,unlit;float unpack(vec4 c){return dot(c,vec4(1.,1./255.,1./65025.,1./16581375.));}void main(){vec3 n=normalize(normal);vec3 lightDir=normalize(vec3(-.5,1.,.65));float diffuse=max(0.,dot(n,lightDir));vec3 s=shadow.xyz/shadow.w*.5+.5;float sh=0.;if(s.x>0.&&s.x<1.&&s.y>0.&&s.y<1.&&s.z<1.){for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float d=unpack(texture2D(depth,s.xy+vec2(float(x),float(y))/1024.));sh+=step(d+.0022,s.z)/9.;}}vec3 c=color*(.60+diffuse*.56*(1.-sh*.63));if(studs>.5&&n.y>.9){vec2 uv=fract(world.xz/1.1)-.5;float d=length(uv);c*=1.+.13*(1.-smoothstep(.10,.14,d))-.10*(smoothstep(.13,.15,d)-smoothstep(.16,.18,d));}c=mix(c,color,unlit);float fog=1.-exp(-length(world-eye)*.006);c=mix(c,vec3(.72,.86,.93),fog*.85);gl_FragColor=vec4(c,1.);}`;
const depthFragment=`precision highp float;vec4 pack(float d){vec4 e=fract(d*vec4(1.,255.,65025.,16581375.));e-=e.yzww*vec4(1./255.,1./255.,1./255.,0.);return e;}void main(){gl_FragColor=pack(gl_FragCoord.z);}`;
export class Renderer{
 constructor(canvas){this.canvas=canvas;let g=canvas.getContext('webgl',{antialias:true,alpha:false,powerPreference:'high-performance'});if(!g)return new CanvasRenderer(canvas);this.g=g;this.items=[];this.eye=[10,20,20];this.target=[0,0,0];this.fov=Math.PI/3;this.quality=true;this.meshes={};
 const program=(fs)=>{let pr=g.createProgram();for(let [src,type] of [[vertex,g.VERTEX_SHADER],[fs,g.FRAGMENT_SHADER]]){let s=g.createShader(type);g.shaderSource(s,src);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));g.attachShader(pr,s)}g.linkProgram(pr);if(!g.getProgramParameter(pr,g.LINK_STATUS))throw Error(g.getProgramInfoLog(pr));let loc={pr};for(let n of ['model','view','light','color','eye','depth','studs','unlit'])loc[n]=g.getUniformLocation(pr,n);for(let n of ['p','n'])loc[n]=g.getAttribLocation(pr,n);return loc};this.program=program(fragment);this.depthProgram=program(depthFragment);
 for(let name of ['box','sphere','cylinder']){let data=geometry(name),buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);this.meshes[name]={buffer,count:data.length/6}}
 this.texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,this.texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1024,1024,0,g.RGBA,g.UNSIGNED_BYTE,null);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);this.fb=g.createFramebuffer();g.bindFramebuffer(g.FRAMEBUFFER,this.fb);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,this.texture,0);let dep=g.createRenderbuffer();g.bindRenderbuffer(g.RENDERBUFFER,dep);g.renderbufferStorage(g.RENDERBUFFER,g.DEPTH_COMPONENT16,1024,1024);g.framebufferRenderbuffer(g.FRAMEBUFFER,g.DEPTH_ATTACHMENT,g.RENDERBUFFER,dep);g.bindFramebuffer(g.FRAMEBUFFER,null);g.enable(g.DEPTH_TEST);g.enable(g.CULL_FACE);g.cullFace(g.BACK);this.resize();window.addEventListener('resize',()=>this.resize())}
 add(p,size,color,shape='box',q=Q.id()){let item={p:[...p],s:[...size],q:[...q],c:typeof color==='string'?color.match(/\w\w/g).map(x=>parseInt(x,16)/255):color,shape,visible:true,cast:true,studs:0,unlit:0};this.items.push(item);return item}
 registerMesh(name,data){let g=this.g,buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,data,g.STATIC_DRAW);this.meshes[name]={buffer,count:data.length/6}}
 remove(item){this.items=this.items.filter(x=>x!==item)}
 resize(){let d=Math.min(window.devicePixelRatio||1,this.quality?1.5:1);this.canvas.width=Math.round(innerWidth*d);this.canvas.height=Math.round(innerHeight*d);this.aspect=innerWidth/innerHeight}
 ray(x,y){let f=V.norm(V.sub(this.target,this.eye)),right=V.norm(V.cross(f,[0,1,0])),up=V.cross(right,f),t=Math.tan(this.fov/2);return {o:this.eye,d:V.norm(V.add(f,V.add(V.mul(right,(x/innerWidth*2-1)*t*this.aspect),V.mul(up,(1-y/innerHeight*2)*t))))}}
 render(){let g=this.g,focus=[this.target[0],Math.max(0,this.target[1]*.5),this.target[2]],lp=V.add(focus,[-35,65,45]),lm=mm(ortho(46,1,180),look(lp,focus));let vp=mm(perspective(this.aspect,this.fov),look(this.eye,this.target));
 const pass=(p,v,shadow)=>{g.useProgram(p.pr);g.uniformMatrix4fv(p.view,false,v);g.uniformMatrix4fv(p.light,false,lm);if(!shadow){g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.texture);g.uniform1i(p.depth,0);g.uniform3fv(p.eye,this.eye)}for(let o of this.items){if(!o.visible||shadow&&!o.cast)continue;let m=this.meshes[o.shape];g.bindBuffer(g.ARRAY_BUFFER,m.buffer);g.enableVertexAttribArray(p.p);g.vertexAttribPointer(p.p,3,g.FLOAT,false,24,0);if(p.n>=0){g.enableVertexAttribArray(p.n);g.vertexAttribPointer(p.n,3,g.FLOAT,false,24,12)}g.uniformMatrix4fv(p.model,false,model(o.p,o.q,o.s));if(!shadow){g.uniform3fv(p.color,o.c);g.uniform1f(p.studs,o.studs);g.uniform1f(p.unlit,o.unlit)}g.drawArrays(g.TRIANGLES,0,m.count)}};
 g.bindFramebuffer(g.FRAMEBUFFER,this.fb);g.viewport(0,0,1024,1024);g.clearColor(1,1,1,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);if(this.quality)pass(this.depthProgram,lm,true);g.bindFramebuffer(g.FRAMEBUFFER,null);g.viewport(0,0,this.canvas.width,this.canvas.height);g.clearColor(.72,.86,.93,1);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);pass(this.program,vp,false)}
}
// Perspective 3D compatibility renderer for devices that disable WebGL.
class CanvasRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('无法创建画布');this.items=[];this.eye=[10,20,20];this.target=[0,0,0];this.fov=Math.PI/3;this.quality=true;this.compatibility=true;this.resize();window.addEventListener('resize',()=>this.resize());this.shapes={};for(let name of ['box','sphere','cylinder']){let data=geometry(name),ts=[];for(let i=0;i<data.length;i+=18)ts.push({p:[[...data.slice(i,i+3)],[...data.slice(i+6,i+9)],[...data.slice(i+12,i+15)]],n:[...data.slice(i+3,i+6)]});this.shapes[name]=ts}}
 add(...args){return Renderer.prototype.add.apply(this,args)}
 registerMesh(name,data){let tris=[];for(let i=0;i<data.length;i+=18)tris.push({p:[[...data.slice(i,i+3)],[...data.slice(i+6,i+9)],[...data.slice(i+12,i+15)]],n:[...data.slice(i+3,i+6)]});this.shapes[name]=tris}
 remove(item){this.items=this.items.filter(x=>x!==item)}
 resize(){let d=Math.min(1,(this.quality?1000:700)/innerWidth,(this.quality?650:420)/innerHeight);this.canvas.width=Math.round(innerWidth*d);this.canvas.height=Math.round(innerHeight*d);this.aspect=innerWidth/innerHeight;this.image=this.ctx.createImageData(this.canvas.width,this.canvas.height);this.depth=new Float32Array(this.canvas.width*this.canvas.height)}
 ray(x,y){return Renderer.prototype.ray.call(this,x,y)}
 render(){let w=this.canvas.width,h=this.canvas.height,pixels=this.image.data,depth=this.depth;depth.fill(0);for(let y=0;y<h;y++){let t=y/h,rr=172+t*55,gg=205+t*31,bb=224-t*8;for(let x=0;x<w;x++){let i=(y*w+x)*4;pixels[i]=rr;pixels[i+1]=gg;pixels[i+2]=bb;pixels[i+3]=255}}
 let f=V.norm(V.sub(this.target,this.eye)),right=V.norm(V.cross(f,[0,1,0])),up=V.cross(right,f),focal=h/(2*Math.tan(this.fov/2)),sun=V.norm([-.5,1,.65]),transparent=[];
 const toCamera=v=>{let d=V.sub(v,this.eye);return[V.dot(d,right),V.dot(d,up),V.dot(d,f),v[0],v[2]]};
 const clip=vs=>{let out=[];for(let i=0;i<vs.length;i++){let a=vs[i],b=vs[(i+1)%vs.length],ina=a[2]>.15,inb=b[2]>.15;if(ina)out.push(a);if(ina!==inb)out.push(V.mix(a,b,(.15-a[2])/(b[2]-a[2])))}return out};
 const raster=(v0,v1,v2,c,studs,alpha=1)=>{let v=[v0,v1,v2].map(v=>[w/2+v[0]/v[2]*focal,h/2-v[1]/v[2]*focal,1/v[2],v[3]/v[2],v[4]/v[2]]),a=v[0],b=v[1],z=v[2];let area=(b[0]-a[0])*(z[1]-a[1])-(b[1]-a[1])*(z[0]-a[0]);if(Math.abs(area)<.001)return;if(area<0){[b,z]=[z,b];area=-area}let minX=Math.max(0,Math.floor(Math.min(a[0],b[0],z[0]))),maxX=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],z[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],z[1]))),maxY=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],z[1])));let inv=1/area;
 for(let y=minY;y<=maxY;y++){let py=y+.5,px=minX+.5,u=(b[0]-px)*(z[1]-py)-(b[1]-py)*(z[0]-px),v=(z[0]-px)*(a[1]-py)-(z[1]-py)*(a[0]-px),du=b[1]-z[1],dv=z[1]-a[1];for(let x=minX;x<=maxX;x++,u+=du,v+=dv){let ww=area-u-v;if(u<-.01||v<-.01||ww<-.01)continue;let iz=(u*a[2]+v*b[2]+ww*z[2])*inv,idx=y*w+x;if(iz<depth[idx]-.00001)continue;let light=0;if(studs){let wx=(u*a[3]+v*b[3]+ww*z[3])*inv/iz,wz=(u*a[4]+v*b[4]+ww*z[4])*inv/iz,xx=((wx/1.1)%1+1)%1-.5,zz=((wz/1.1)%1+1)%1-.5,dd=xx*xx+zz*zz;if(dd<.018)light=17;else if(dd<.032)light=-13}let i=idx*4;pixels[i]=pixels[i]*(1-alpha)+(c[0]+light)*alpha;pixels[i+1]=pixels[i+1]*(1-alpha)+(c[1]+light)*alpha;pixels[i+2]=pixels[i+2]*(1-alpha)+(c[2]+light)*alpha;if(alpha===1)depth[idx]=iz}}
 };
 const polygon=(world,color,n,unlit=0,studs=false,alpha=1)=>{let center=V.mul(world.reduce((a,b)=>V.add(a,b),[0,0,0]),1/world.length);if(n&&V.dot(n,V.sub(this.eye,center))<0)return;let vs=clip(world.map(toCamera));if(vs.length<3)return;let shade=n?.60+Math.max(0,V.dot(n,sun))*.56:1;shade+=(1-shade)*unlit;let fog=(1-Math.exp(-V.len(V.sub(center,this.eye))*.006))*.85,c=color.map((v,i)=>clamp(v*shade*(1-fog)+[.72,.86,.93][i]*fog,0,1)*255);for(let i=1;i<vs.length-1;i++)raster(vs[0],vs[i],vs[i+1],c,studs,alpha)};
 for(let o of this.items){if(!o.visible)continue;for(let t of this.shapes[o.shape]){let world=t.p.map(v=>V.add(o.p,Q.rot(o.q,v.map((x,i)=>x*o.s[i])))),n=Q.rot(o.q,t.n);polygon(world,o.c,n,o.unlit,o.studs&&n[1]>.9)}if(o.shadow&&this.quality){let y=(this.floorAt?this.floorAt(o.p[0],o.p[2],o.p[1]-.5):0)+.045,c=[o.p[0]+Math.max(0,o.p[1]-y)*.08,y,o.p[2]-Math.max(0,o.p[1]-y)*.09],sz=.7+Math.max(0,o.p[1]-y)*.025,ring=[];for(let k=0;k<14;k++)ring.push(V.add(c,[Math.cos(k/14*Math.PI*2)*sz,0,Math.sin(k/14*Math.PI*2)*sz*.6]));transparent.push(ring)}}
 for(let ring of transparent)polygon(ring,[.14,.25,.21],[0,1,0],1,false,.13);this.ctx.putImageData(this.image,0,0)
 }
}
