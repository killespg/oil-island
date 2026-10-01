'use strict';
(async function(){
  const prefix=new URLSearchParams(location.search).get('baseline')==='1'?'/baseline':'';
  const files=['vendor/three.min.js','combat.js','assets/faces-v5.js','assets/titan-shirt.js','assets/materials-v5.js','fighter-faces.js','organic-mesh.js','fighters-human.js','assets/orelha-face.js','fighters-dog.js','arena-island.js','arena-nightclub.js','arena-seaside.js','arena-helipad.js','combat-feedback.js','scene.js'];
  const status=document.getElementById('status'),result=document.getElementById('result'),button=document.getElementById('run');
  try{
    for(const file of files)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=prefix+'/'+file;s.onload=resolve;s.onerror=()=>reject(new Error(file));document.head.append(s);});
    const scene=NeonScene.create(document.getElementById('game-canvas'),{quality:'low',reducedMotion:false});
    let state,raf=0,busy=false,aborted=false;
    function stage(arena){state=FightSim.createMatch({arena,characters:['titan','orelha'],training:true,multiplayer:true,seed:418});state.phase='fight';state.fighters[0].x=-1.4;state.fighters[1].x=1.4;scene.setArena(arena);scene.resetCamera(state);scene.setLockOn(true);}
    function quantile(values,q){const a=values.slice().sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(q*(a.length-1)))];}
    function measure(arena){
      stage(arena);
      return new Promise((resolve,reject)=>{
        let previous=0,elapsed=0,actionClock=0,simulationTime=0,accumulator=0,sampleSeconds=0,frames=0,calls=0,triangles=0,maxTextures=0;
        const intervals=[];
        function frame(now){
          if(aborted){reject(new Error('Medição interrompida: a página ficou oculta. Repita com ela ativa.'));return;}
          const dt=previous?(now-previous)/1000:1/60;previous=now;elapsed+=dt;
          accumulator+=Math.min(dt,.25);
          while(accumulator>=1/60){
            simulationTime+=1/60;actionClock+=1/60;
            if(actionClock>.36){FightSim.act(state,0,Math.floor(simulationTime)%6===0?'special':'punch');FightSim.act(state,1,Math.floor(simulationTime)%4===0?'special':'kick');actionClock=0;}
            FightSim.stepPlayers(state,1/60,[{x:0,z:0,block:false},{x:0,z:0,block:false}]);accumulator-=1/60;
          }
          scene.update(Math.min(dt,.05),state);
          // The baseline and current renderer share this accounting contract:
          // count scene, shadow and post passes, never the last draw alone.
          scene.renderer.info.autoReset=false;scene.renderer.info.reset();scene.render();
          const info=scene.renderer.info;
          if(elapsed>=3){intervals.push(dt*1000);sampleSeconds+=dt;frames++;calls+=info.render.calls;triangles+=info.render.triangles;maxTextures=Math.max(maxTextures,info.memory.textures);}
          if(elapsed>=15){resolve({arena,quality:document.getElementById('quality').value,frames,seconds:sampleSeconds,averageFps:frames/sampleSeconds,frameMsMedian:quantile(intervals,.5),frameMsP95:quantile(intervals,.95),frameMsP99:quantile(intervals,.99),drawCallsMean:calls/frames,trianglesMean:triangles/frames,maxTextures,graphics:scene.graphicsInfo()});return;}
          status.textContent=(prefix?'Antes':'Atual')+' · '+arena+' · '+(elapsed<3?'aquecendo':'medindo')+' '+Math.ceil(15-elapsed)+' s';
          raf=requestAnimationFrame(frame);
        }
        raf=requestAnimationFrame(frame);
      });
    }
    stage('nightclub');scene.update(0,state);scene.render();status.textContent=(prefix?'Snapshot anterior':'Código atual')+' pronto.';button.disabled=false;
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)aborted=true;});
    button.addEventListener('click',async()=>{
      if(busy)return;busy=true;aborted=false;button.disabled=true;document.getElementById('quality').disabled=true;
      try{
        const quality=document.getElementById('quality').value;
        scene.setQuality(quality);scene.setResolutionScale(1);
        const results=[];
        for(const arena of ['nightclub','seaside']){results.push(await measure(arena));result.textContent=JSON.stringify({variant:prefix?'baseline':'current',results},null,2);}
        status.textContent='Medição concluída. FPS deste equipamento; sem simulação de GPU fraca.';
      }catch(error){status.textContent=error.message;}finally{busy=false;button.disabled=false;document.getElementById('quality').disabled=false;}
    });
    window.addEventListener('pagehide',()=>{aborted=true;cancelAnimationFrame(raf);});
  }catch(error){status.textContent='Falha ao carregar: '+error.message;}
}());
