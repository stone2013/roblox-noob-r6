import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'breaklab-mountain-'));
const engine=await fs.readFile(path.join(root,'engine.js'),'utf8');
const mountainSource=await fs.readFile(path.join(root,'mountain.js'),'utf8');
await fs.writeFile(path.join(temp,'engine.mjs'),engine);
await fs.writeFile(path.join(temp,'mountain.mjs'),mountainSource.replace("./engine.js?v=4.9.3","./engine.mjs"));
const {V,Body,Physics}=await import(pathToFileURL(path.join(temp,'engine.mjs')));
const {createMountain,surfaceAt,raycast}=await import(pathToFileURL(path.join(temp,'mountain.mjs')));

const checks=[];
function check(name,fn){fn();checks.push(name)}
const samples=[[55,3],[37,-17],[77,-31],[34,-57],[60,-69],[50,-40],[8,-50],[102,-50],[4,-10]];
check('surface stays finite, bounded and returns unit normals',()=>{
 for(const [x,z] of samples){const s=surfaceAt(x,z);assert(Number.isFinite(s.height));assert(s.height>=0);assert(Math.abs(V.len(s.normal)-1)<1e-5)}
 assert.equal(surfaceAt(4,-10).height,0);
 assert.equal(surfaceAt(55,3).height>40,true);
 assert.equal(surfaceAt(37,-17).height>48,true);
 const hit=raycast([55,100,3],[0,-1,0],120);assert(hit!==null&&Math.abs(hit-(100-surfaceAt(55,3).height))<.2,'raycast missed the mesh surface');
 assert.equal(surfaceAt(77,-31).height>42,true);
});
const meshes={};
const P=new Physics();
const R={registerMesh:(name,data)=>meshes[name]=data,add:(p,s,c,shape)=>({p,s,c,shape})};
const mountain=createMountain({R,P});
check('render mesh and collision share the same triangle planes',()=>{
 assert.equal(P.terrainAt,surfaceAt);
 assert(mountain.triangleCount>1800&&mountain.triangleCount<3100,'triangle budget '+mountain.triangleCount);
 assert.equal(Object.keys(meshes).length,3);
 for(const data of Object.values(meshes)){
  for(let i=0;i<data.length;i+=18){
   const x=(data[i]+data[i+6]+data[i+12])/3,z=(data[i+2]+data[i+8]+data[i+14])/3,y=(data[i+1]+data[i+7]+data[i+13])/3;
   assert(Math.abs(surfaceAt(x,z).height-y)<1e-4,'visual/collision height mismatch at '+x+', '+z);
  }
 }
});
function assertNoPenetration(body,tolerance=.45){
 if(body.shape==='sphere'){const s=surfaceAt(body.p[0],body.p[2]);if(s.height>0){const signed=(body.p[1]-s.height)*s.normal[1];assert(signed+tolerance>=body.h[0],'sphere penetrated '+(body.h[0]-signed))}return}
 for(const v of body.vertices()){const s=surfaceAt(v[0],v[2]);assert(v[1]+tolerance>=s.height,'body vertex penetrated '+(s.height-v[1])+' at '+v[0]+','+v[2])}
}
check('walking path follows the continuous surface without a step pop',()=>{
 let prev=surfaceAt(55,3).height,maxRise=0;for(let z=3;z>-12;z-=7/120){const next=surfaceAt(55,z).height;maxRise=Math.max(maxRise,next-prev);prev=next}assert(maxRise<.05,'walking support has a discontinuous rise '+maxRise);
});
check('walking body lands and can jump without crossing the surface',()=>{
 const p=new Physics(),b=p.add(new Body([55,surfaceAt(55,3).height+7,3],[.65,1.5,.65],1.8));b.group='doll';b.v[0]=0;p.terrainAt=surfaceAt;
 for(let i=0;i<240;i++)p.step(1/120);
 assertNoPenetration(b,.55);
 const before=b.p[1];b.v[1]=9.4;
 for(let i=0;i<18;i++)p.step(1/120);
 assert(b.p[1]>before+.7,'jump did not produce upward travel');
 assertNoPenetration(b,.55);
});
check('six-body ragdoll tumble remains finite and collides with the mountain',()=>{
 const p=new Physics();p.terrainAt=surfaceAt;
 const bodies=[];
 for(let i=0;i<6;i++){const b=p.add(new Body([48+i*.28,surfaceAt(48,-21).height+10+i*.2,-21],[.72,.82,.64],i===1?5:1.6));b.group='doll';b.v=[i%2?2:-1,-.5,1.3];b.w=[.4,.7,-.3];bodies.push(b)}
 for(let i=0;i<5;i++)p.joint(bodies[1],bodies[i===0?0:i+1],[0,0,0],[0,0,0],1.5,1.0);
 for(let i=0;i<600;i++)p.step(1/120);
 for(const b of bodies){assert(b.p.every(Number.isFinite));assert(b.v.every(Number.isFinite));assertNoPenetration(b,.8)}
 assert(p.lastPairCount<250,'terrain collision increased body pair count');
});
check('fast cart-sized body follows terrain and stays below the speed cap',()=>{
 const p=new Physics(),x=58,z=-46;p.terrainAt=surfaceAt;let impacts=0;p.onImpact=()=>impacts++;
 const rockX=x+2.6,rockY=surfaceAt(rockX,z).height+.9;p.add(new Body([rockX,rockY,z],[.7,1.8,1.8],0));
 const cart=p.add(new Body([x,surfaceAt(x,z).height+14,z],[1.6,.85,2.4],18));cart.v=[9,-4,0];cart.friction=.7;
 for(let i=0;i<720;i++)p.step(1/120);
 assert(cart.p.every(Number.isFinite)&&cart.v.every(Number.isFinite));
 assert(V.len(cart.v)<=60.01);
 assert(impacts>0,'cart did not register a mountain collision');
 assertNoPenetration(cart,.8);
});

console.log('Mountain regressions passed: '+checks.length+' checks; '+mountain.triangleCount+' rendered triangles.');
await fs.rm(temp,{recursive:true,force:true});
