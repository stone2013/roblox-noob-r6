/* Break Lab v4.9 extensions: deterministic destruction, vehicles and replay. */
import {V,Q,Body} from './engine.js?v=4.9.3';
export function createStructures({solid,decoration,P,R,random}){
 const structures=[],debris=[];
 const colors=['#b98152','#d3a36e','#8eacb4'];
 function building(x,z,w=6,h=5){
  const parts=[];
  // A hollow building: each wall and roof has a physical collider.
  const panels=[
   [[x-w/2,h/2,z],[.42,h,w],0],
   [[x+w/2,h/2,z],[.42,h,w],0],
   [[x,h/2,z-w/2],[w,h,.42],1],
   [[x,h/2,z+w/2],[w,h,.42],1],
   [[x,h+.15,z],[w+.6,.3,w+.6],2]
  ];
  for(let i=0;i<panels.length;i++){
   const [p,size,col]=panels[i],body=solid(p,size,colors[col]);
   const panel={body,mesh:body.mesh,p,size,color:colors[col],broken:false};
   body.buildPanel=panel;parts.push(panel);
  }
  structures.push({x,z,parts});
  for(let k=0;k<3;k++)decoration([x-w/2+1+k*1.5,h*.6,z+w/2+.27],[.9,1.1,.06],'#acd8e2',Q.id(),'box',false);
 }
 building(-15,-16,5,4.8);building(14,-18,6,5.8);building(78,-67,7,6);
 function shatter(panel,impact=12){
  if(!panel||panel.broken)return false;
  panel.broken=true;P.remove(panel.body);R.remove(panel.mesh);
  const count=4;
  for(let i=0;i<count;i++){
   const p=[panel.p[0]+(random()-.5)*panel.size[0]*.65,panel.p[1]+(random()-.5)*panel.size[1]*.55,panel.p[2]+(random()-.5)*panel.size[2]*.65];
   const size=panel.size.map(v=>Math.max(.24,Math.min(1.2,v*.4)));
   const b=P.add(new Body(p,size,.6));b.group='debris';b.v=[(random()-.5)*impact*.65,random()*impact*.3,(random()-.5)*impact*.65];b.w=[random()*3,random()*3,random()*3];
   b.mesh=decoration(p,size,panel.color);debris.push({b,age:0});
  }
  while(debris.length>64){let d=debris.shift();P.remove(d.b);R.remove(d.b.mesh)}
  return true;
 }
 function tick(dt){
  for(let i=debris.length-1;i>=0;i--){let d=debris[i];d.age+=dt;d.b.mesh.p=[...d.b.p];d.b.mesh.q=[...d.b.q];
   if(d.age>7){P.remove(d.b);R.remove(d.b.mesh);debris.splice(i,1)}}
 }
 function restore(){
  for(const st of structures)for(const p of st.parts)if(p.broken){p.broken=false;const b=solid(p.p,p.size,p.color);p.body=b;p.mesh=b.mesh;b.buildPanel=p}
  for(const d of debris){P.remove(d.b);R.remove(d.b.mesh)}debris.length=0;
 }
 return {structures,debris,shatter,tick,restore};
}
export function createVehicles({P,R,decoration}){
 const vehicles=[];let riding=null;
 function spawn(position){
  if(vehicles.length>=3){const old=vehicles.shift();destroy(old)}
  const p=[position[0],Math.max(position[1]+1.3,1.5),position[2]];
  const b=P.add(new Body(p,[2.1,.6,3.1],12));b.group='vehicle';b.friction=.75;
  const chassis=decoration(p,[2.1,.6,3.1],'#f2a54e');b.mesh=chassis;
  const wheels=[];
  for(const x of [-1.06,1.06])for(const z of [-1.04,1.04]){
   wheels.push({m:decoration(p,[.56,.56,.32],'#303d49',Q.axis([0,0,1],Math.PI/2),'cylinder'),x,z});
  }
  const seat=decoration(p,[1.2,.26,1.15],'#455f73');
  const v={b,chassis,wheels,seat};vehicles.push(v);return v;
 }
 function destroy(v){if(riding===v)riding=null;P.remove(v.b);R.remove(v.chassis);R.remove(v.seat);for(let w of v.wheels)R.remove(w.m)}
 function mount(v){riding=v}
 function dismount(){const v=riding;riding=null;return v}
 function tick(dt){for(const v of vehicles){v.chassis.p=[...v.b.p];v.chassis.q=[...v.b.q];v.seat.p=v.b.world([0,.46,0]);v.seat.q=[...v.b.q];
 for(const w of v.wheels){w.m.p=v.b.world([w.x,-.43,w.z]);w.m.q=Q.mul(v.b.q,Q.axis([0,0,1],Math.PI/2))}}}
 function clear(){for(const v of [...vehicles])destroy(v);vehicles.length=0;riding=null}
 return {vehicles,spawn,mount,dismount,tick,clear,get riding(){return riding}};
}
export function createReplay({dolls}){
 const frames=[];let playback=false,elapsed=0,original=null;
 function capture(time){if(playback)return;if(frames.length&&time-frames[frames.length-1].t<1/15)return;
 frames.push({t:time,poses:dolls.map(b=>({p:[...b.p],q:[...b.q]}))});if(frames.length>320)frames.shift()}
 function start(){if(frames.length<3)return false;original=dolls.map(b=>({p:[...b.p],q:[...b.q]}));elapsed=0;playback=true;return true}
 function tick(dt){if(!playback)return false;elapsed+=dt*.65;const first=frames[0].t,target=first+elapsed;
 if(target>=frames[frames.length-1].t){stop();return false}
 let lo=0,hi=frames.length-1;while(lo+1<hi){let mid=(lo+hi)>>1;if(frames[mid].t<=target)lo=mid;else hi=mid}
 let a=frames[lo],b=frames[hi],u=Math.max(0,Math.min(1,(target-a.t)/(b.t-a.t||1)));
 for(let i=0;i<dolls.length;i++){dolls[i].p=V.add(V.mul(a.poses[i].p,1-u),V.mul(b.poses[i].p,u));let q=a.poses[i].q.map((x,k)=>x*(1-u)+b.poses[i].q[k]*u);dolls[i].q=Q.norm(q)}
 return true}
 function stop(){if(!playback)return;playback=false;if(original)for(let i=0;i<dolls.length;i++){dolls[i].p=original[i].p;dolls[i].q=original[i].q}original=null}
 function clear(){stop();frames.length=0}
 return {frames,capture,start,tick,stop,clear,get playing(){return playback}};
}
