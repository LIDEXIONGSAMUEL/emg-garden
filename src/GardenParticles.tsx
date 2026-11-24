import {useEffect,useRef} from 'react';

type Point={x:number;y:number;time:number};
type Spark={x:number;y:number;vx:number;vy:number;size:number;age:number;life:number;color:string};
type Effects={flow:number;rewarded:boolean;protectMeter:boolean};
type Props=Effects & {enabled:boolean};

const WIDTH=640, HEIGHT=382;
const FLOWER={x:335,y:153};
const TRAIL_LIFETIME=620;
const AQUA=['#65ffe4','#a7ffe0','#83caff','#d3fff5'];
const GOLD=['#ffcf70','#ff9f72','#fff0ad','#b9ffe9'];

function glow(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,color:string,opacity:number){
  const fill=ctx.createRadialGradient(x,y,0,x,y,radius);
  fill.addColorStop(0,color);
  fill.addColorStop(1,'transparent');
  ctx.globalAlpha=opacity;
  ctx.fillStyle=fill;
  ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
}

function ring(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number,color:string,opacity:number,width:number){
  ctx.globalAlpha=opacity;
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.beginPath();
  ctx.arc(x,y,radius,0,Math.PI*2);
  ctx.stroke();
}

export function GardenParticles({enabled,flow,rewarded,protectMeter}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const applyEffects=useRef<(effects:Effects)=>void>(()=>{});

  useEffect(()=>{
    const canvas=canvasRef.current, scene=canvas?.parentElement;
    if(!enabled||!canvas||!scene||typeof window.matchMedia!=='function'||typeof ResizeObserver!=='function')return;
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const trail:Point[]=[], sparks:Spark[]=[];
    let frame=0, lastFrame=0, rewardTime=-Infinity, flowing=0, targetFlow=0, wasRewarded=false, meter=false;
    let scaleX=1, scaleY=1;
    let needsClear=false, continuesStroke=false;

    function resize(){
      const bounds=scene!.getBoundingClientRect();
      const ratio=Math.min(2,window.devicePixelRatio||1);
      const width=Math.max(1,Math.round(bounds.width*ratio)),height=Math.max(1,Math.round(bounds.height*ratio));
      if(canvas!.width!==width||canvas!.height!==height){
        canvas!.width=width;
        canvas!.height=height;
      }
      scaleX=width/WIDTH;
      scaleY=height/HEIGHT;
    }

    function clear(){
      if(!needsClear)return;
      ctx!.setTransform(1,0,0,1,0,0);
      ctx!.clearRect(0,0,canvas!.width,canvas!.height);
      needsClear=false;
    }

    function stop(){
      if(frame)cancelAnimationFrame(frame);
      frame=0;
      lastFrame=0;
      trail.length=0;
      continuesStroke=false;
      sparks.length=0;
      rewardTime=-Infinity;
      flowing=0;
      clear();
    }

    function wake(){
      if(!frame&&!motion.matches)frame=requestAnimationFrame(draw);
    }

    function scatter(x:number,y:number,count:number,reward:boolean){
      for(let i=0;i<count;i++){
        const angle=reward?(i+Math.random()*.7)/count*Math.PI*2:Math.random()*Math.PI*2;
        const speed=reward?54+Math.random()*102:11+Math.random()*47;
        const palette=reward?GOLD:AQUA;
        sparks.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          size:(reward?1.2:.85)+Math.random()*1.9,age:0,life:(reward?.65:.27)+Math.random()*(reward?.48:.39),
          color:palette[i%palette.length]});
      }
      if(sparks.length>128)sparks.splice(0,sparks.length-128);
    }

    function follow(event:PointerEvent){
      if(motion.matches||!event.isPrimary)return;
      const bounds=scene!.getBoundingClientRect();
      if(!bounds.width||!bounds.height)return;
      const x=(event.clientX-bounds.left)/bounds.width*WIDTH;
      const y=(event.clientY-bounds.top)/bounds.height*HEIGHT;
      const time=performance.now(), previous=trail.at(-1);
      if(continuesStroke&&previous&&time-previous.time<12&&Math.hypot(x-previous.x,y-previous.y)<8)return;
      // A fresh stroke after an idle or leave starts at its own location.
      if(!continuesStroke||(previous&&(time-previous.time>215||Math.hypot(x-previous.x,y-previous.y)>125)))trail.length=0;
      continuesStroke=true;
      trail.push({x,y,time});
      if(trail.length>30)trail.shift();
      scatter(x,y,3,false);
      wake();
    }

    function endStroke(){continuesStroke=false;}

    function drawTrail(context:CanvasRenderingContext2D,now:number){
      while(trail.length&&now-trail[0].time>TRAIL_LIFETIME)trail.shift();
      const head=trail.at(-1);
      if(!head)return;
      context.lineCap='round';
      for(let i=1;i<trail.length;i++){
        const a=trail[i-1], b=trail[i];
        const opacity=Math.min(1,Math.max(0,1-(now-a.time)/TRAIL_LIFETIME));
        context.beginPath();
        context.moveTo(a.x,a.y);
        context.lineTo(b.x,b.y);
        context.globalAlpha=opacity*.24;
        context.lineWidth=4+opacity*16;
        context.strokeStyle='#54f3d5';
        context.stroke();
        context.globalAlpha=opacity*.86;
        context.lineWidth=.7+opacity*2.5;
        context.strokeStyle='#c0fff1';
        context.stroke();
      }
      const opacity=Math.min(1,Math.max(0,1-(now-head.time)/TRAIL_LIFETIME));
      glow(context,head.x,head.y,28,'#69ffdf',opacity*.41);
      ring(context,head.x,head.y,7,'#9fffea',opacity*.72,1.2);
      glow(context,head.x,head.y,4,'#f4fff7',opacity);
    }

    function drawWater(context:CanvasRenderingContext2D,now:number){
      if(flowing<=0)return;
      const count=Math.ceil(3+flowing*12);
      for(let i=0;i<count;i++){
        const t=(now/620+i/count)%1, u=1-t;
        const x=u*u*250+2*u*t*(272+(i%3-1)*8)+t*t*(300+(i%5-2)*5);
        const y=u*u*238+2*u*t*236+t*t*278;
        const opacity=Math.sin(Math.PI*t)*Math.min(.9,.29+flowing)*Math.min(1,flowing/.1);
        context.globalAlpha=opacity;
        context.fillStyle=i%3===0?'#e5fff4':'#72e8f1';
        context.beginPath();
        context.ellipse(x,y,1.2+flowing,2.8+flowing*2,.65,0,Math.PI*2);
        context.fill();
      }
    }

    function drawSparks(context:CanvasRenderingContext2D,dt:number){
      for(let i=sparks.length-1;i>=0;i--){
        const spark=sparks[i];
        spark.age+=dt;
        if(spark.age>=spark.life){sparks.splice(i,1);continue;}
        spark.x+=spark.vx*dt;
        spark.y+=spark.vy*dt;
        spark.vy+=34*dt;
        const opacity=1-spark.age/spark.life;
        context.globalAlpha=opacity*.42;
        context.fillStyle=spark.color;
        context.beginPath();
        context.arc(spark.x,spark.y,spark.size*2.15,0,Math.PI*2);
        context.fill();
        context.globalAlpha=opacity;
        context.beginPath();
        context.arc(spark.x,spark.y,spark.size*.75,0,Math.PI*2);
        context.fill();
      }
    }

    function draw(now:number){
      frame=0;
      if(motion.matches){stop();return;}
      const context=ctx!;
      clear();
      const dt=lastFrame?Math.min(.035,(now-lastFrame)/1000):1/60;
      lastFrame=now;
      // Follow the same short visual transition as the SVG water.
      const flowDelta=targetFlow-flowing;
      flowing=Math.abs(flowDelta)<.007?targetFlow:flowing+flowDelta*(1-Math.exp(-dt/.055));
      context.setTransform(scaleX,0,0,scaleY,0,0);
      context.save();
      if(meter){
        context.beginPath();
        context.rect(0,0,WIDTH,HEIGHT);
        context.rect(485,72,116,211);
        context.clip('evenodd');
      }
      context.globalCompositeOperation='lighter';
      const elapsed=(now-rewardTime)/1000;
      if(elapsed<1.05){
        const opacity=1-elapsed/1.05;
        glow(context,FLOWER.x,FLOWER.y,89+elapsed*70,'#ffd490',opacity*.37);
        ring(context,FLOWER.x,FLOWER.y,37+elapsed*111,'#ffdf91',opacity*.68,1.5);
        ring(context,FLOWER.x,FLOWER.y,52+elapsed*72,'#9fffea',opacity*.42,1);
      }
      drawWater(context,now);
      drawTrail(context,now);
      drawSparks(context,dt);
      context.restore();
      needsClear=true;
      if(elapsed<1.05||flowing>0||trail.length||sparks.length)wake();
      else{lastFrame=0;clear();}
    }

    function motionChanged(){
      if(motion.matches)stop();
      else if(targetFlow>0)wake();
    }

    applyEffects.current=effects=>{
      targetFlow=effects.flow;
      meter=effects.protectMeter;
      if(effects.rewarded&&!wasRewarded&&!motion.matches){
        rewardTime=performance.now();
        scatter(FLOWER.x,FLOWER.y,68,true);
      }
      wasRewarded=effects.rewarded;
      if(targetFlow>0||sparks.length)wake();
    };
    const observer=new ResizeObserver(resize);
    resize();
    observer.observe(scene);
    scene.addEventListener('pointermove',follow,{passive:true});
    scene.addEventListener('pointerdown',follow,{passive:true});
    scene.addEventListener('pointerleave',endStroke);
    scene.addEventListener('pointercancel',endStroke);
    motion.addEventListener('change',motionChanged);
    return ()=>{
      stop();
      applyEffects.current=()=>{};
      observer.disconnect();
      scene.removeEventListener('pointermove',follow);
      scene.removeEventListener('pointerdown',follow);
      scene.removeEventListener('pointerleave',endStroke);
      scene.removeEventListener('pointercancel',endStroke);
      motion.removeEventListener('change',motionChanged);
    };
  },[enabled]);

  useEffect(()=>applyEffects.current({flow,rewarded,protectMeter}),[enabled,flow,rewarded,protectMeter]);

  return <canvas ref={canvasRef} className="garden-particles" aria-hidden="true"/>;
}
