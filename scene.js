/* OIL ISLAND (ORELHA EDITION) — locally authored WebGL arenas. */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) throw new Error('O motor 3D não foi carregado.');
  var PI = Math.PI;
  var clamp = T.MathUtils.clamp;
  var lerp = T.MathUtils.lerp;

  function create(canvas, options) {
    options = options || {};
    var quality = options.quality === 'high' ? 'high' : 'low';
    var resolutionScale = Number.isFinite(options.resolutionScale) ? clamp(options.resolutionScale, .65, 1) : 1;
    var recovering = false;
    // The direct path is the safe default. HQ is explicitly selected, has a
    // bounded pixel budget, and never combines floating-point targets with MSAA.
    var renderer = new T.WebGLRenderer({canvas: canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'default'});
    var context = renderer.getContext(), contextDetails = {version:'',renderer:''};
    try {
      contextDetails.version = context.getParameter(context.VERSION) || '';
      var debugRenderer = context.getExtension('WEBGL_debug_renderer_info');
      contextDetails.renderer = context.getParameter(debugRenderer ? debugRenderer.UNMASKED_RENDERER_WEBGL : context.RENDERER) || '';
    } catch (_) { /* Driver identification is optional. */ }
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    var scene = new T.Scene();
    scene.background = new T.Color(0x101322);
    scene.fog = new T.FogExp2(0x17192c, .022);
    var camera = new T.PerspectiveCamera(55, 1, .12, 180);
    var clock = 0, shake = 0, width = 1, height = 1, impactZoom = 0, impactRoll = 0;
    var lastFrameInfo={calls:0,triangles:0,sceneAndShadowCalls:0,postProcessCalls:0};
    var focus = new T.Vector3(0, 1.2, 0);
    var camTarget = new T.Vector3();
    var temp = new T.Object3D();
    var seed = 385401;
    var materialCache = {};
    function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function material(color, metal, rough) {
      metal=metal===undefined?.45:metal;rough=rough===undefined?.48:rough;
      var key=color+'_'+metal+'_'+rough;
      return materialCache[key] || (materialCache[key]=new T.MeshStandardMaterial({color:color,metalness:metal,roughness:rough}));
    }
    function neon(color, intensity) {
      return new T.MeshStandardMaterial({color: color, emissive: color, emissiveIntensity: intensity || 2.3, roughness: .32, metalness: .15});
    }
    var boxGeo = new T.BoxGeometry(1, 1, 1);
    var cylinderGeo = new T.CylinderGeometry(1, 1, 1, 8);
    var sphereGeo = new T.SphereGeometry(1, 12, 8);
    function mesh(geo, mat, parent, x, y, z, sx, sy, sz, shadows) {
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.scale.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
      m.castShadow = !!shadows;
      m.receiveShadow = !!shadows;
      parent.add(m);
      return m;
    }
    function box(parent, mat, x, y, z, sx, sy, sz, shadows) { return mesh(boxGeo, mat, parent, x, y, z, sx, sy, sz, shadows); }
    function rod(parent, mat, ax, ay, az, bx, by, bz, radius) {
      var start = new T.Vector3(ax, ay, az), end = new T.Vector3(bx, by, bz), d = end.clone().sub(start);
      var m = mesh(cylinderGeo, mat, parent, (ax+bx)/2, (ay+by)/2, (az+bz)/2, radius, d.length(), radius);
      m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), d.normalize());
      return m;
    }
    function texture(w, h, draw) {
      var c = document.createElement('canvas'); c.width=w; c.height=h;
      draw(c.getContext('2d'), w, h);
      var tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return tex;
    }
    var glowTexture = texture(128,128,function(ctx,w,h) {
      var g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
      g.addColorStop(0,'rgba(255,255,255,0.7)');g.addColorStop(.13,'rgba(255,255,255,0.3)');g.addColorStop(.4,'rgba(255,255,255,0.06)');g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    });
    function glow(parent,color,x,y,z,size,opacity) {
      var s=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:color,transparent:true,opacity:opacity===undefined?.65:opacity,blending:T.AdditiveBlending,depthWrite:false}));
      s.position.set(x,y,z);s.scale.set(size,size,1);parent.add(s);return s;
    }
    function batchMeshes(parent, recursive) {
      // Bake static pieces into their existing pivot. Animation groups stay intact.
      parent.updateMatrixWorld(true);
      var parentInverse=recursive?parent.matrixWorld.clone().invert():null;
      var buckets={};
      function visit(m) {
        if(!m.isMesh||m.isSkinnedMesh||m.isInstancedMesh||m.geometry.attributes.color||m.material.isShaderMaterial||Array.isArray(m.material))return;
        var ancestor=m;while(ancestor&&ancestor!==parent){if(ancestor.userData.keepDynamic)return;ancestor=ancestor.parent;}
        var key=m.material.uuid+'_'+m.castShadow+'_'+m.receiveShadow;
        (buckets[key]||(buckets[key]=[])).push(m);
      }
      if(recursive)parent.traverse(visit);else parent.children.forEach(visit);
      Object.keys(buckets).forEach(function(key) {
        var parts=buckets[key];if(parts.length<2)return;
        var geometries=[],count=0,indexCount=0;
        parts.forEach(function(part) {
          part.updateMatrix();var g=part.geometry.clone();g.applyMatrix4(recursive?new T.Matrix4().multiplyMatrices(parentInverse,part.matrixWorld):part.matrix);
          geometries.push(g);count+=g.attributes.position.count;indexCount+=g.index?g.index.count:g.attributes.position.count;
        });
        var positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2),offset=0;
        // Preserve the authored shared vertices and UV/normal seams. Expanding
        // every indexed triangle here multiplies uploads and vertex processing.
        var indices=count>65536?new Uint32Array(indexCount):new Uint16Array(indexCount),indexOffset=0;
        geometries.forEach(function(g) {
          positions.set(g.attributes.position.array,offset*3);
          if(g.attributes.normal)normals.set(g.attributes.normal.array,offset*3);
          if(g.attributes.uv)uvs.set(g.attributes.uv.array,offset*2);
          var n=g.index?g.index.count:g.attributes.position.count;
          for(var i=0;i<n;i++)indices[indexOffset++]=offset+(g.index?g.index.getX(i):i);
          offset+=g.attributes.position.count;g.dispose();
        });
        var combined=new T.BufferGeometry();combined.setAttribute('position',new T.BufferAttribute(positions,3));combined.setAttribute('normal',new T.BufferAttribute(normals,3));combined.setAttribute('uv',new T.BufferAttribute(uvs,2));combined.setIndex(new T.BufferAttribute(indices,1));combined.computeBoundingSphere();
        var merged=new T.Mesh(combined,parts[0].material);merged.castShadow=parts[0].castShadow;merged.receiveShadow=parts[0].receiveShadow;
        parts.forEach(function(part){part.parent.remove(part);});parent.add(merged);
      });
    }

    // Every environment owns its geometry, motion and lighting palette.
    var arenaId='', arenas={}, currentArena=null, reducedMotion=!!options.reducedMotion;
    var arenaBounds={island:13.5,nightclub:12,seaside:14,helipad:13};
    var skyUniforms={top:{value:new T.Color(0x080e20)},horizon:{value:new T.Color(0x61293f)},time:{value:0}};
    var sky=new T.Mesh(new T.SphereGeometry(135,24,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:skyUniforms,
      vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vP;uniform vec3 top;uniform vec3 horizon;uniform float time;void main(){vec3 p=normalize(vP);float h=p.y;vec3 c=mix(horizon,top,smoothstep(-.1,.6,h));c+=horizon*.3*exp(-pow((h-.03)*12.,2.));gl_FragColor=vec4(c,1.);}'
    }));scene.add(sky);
    var hemi=new T.HemisphereLight(0xb7d4f2,0x1a1428,1.8);scene.add(hemi);
    var key=new T.DirectionalLight(0xffded0,3.2);key.position.set(-6,15,8);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-16;key.shadow.camera.right=16;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;key.shadow.camera.near=.5;key.shadow.camera.far=50;
    key.shadow.bias=-.0003;key.shadow.normalBias=.045;scene.add(key);scene.add(key.target);
    var cool=new T.DirectionalLight(0x43c7fa,2.8);cool.position.set(8,7,-10);scene.add(cool);
    var portraitFill=new T.DirectionalLight(0xffead1,2.7);portraitFill.visible=false;scene.add(portraitFill);scene.add(portraitFill.target);
    var warm=new T.PointLight(0xff694a,38,32,2);warm.position.set(-8,5,-6);scene.add(warm);
    var teal=new T.PointLight(0x39d9ff,26,28,2);teal.position.set(7,6,5);scene.add(teal);
    var blackSteel=material(0x142331,.62,.48);
    function makeSign(parent,label,sub,x,y,z,w,h,color,angle){
      var g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle||0;parent.add(g);
      box(g,blackSteel,0,0,-.11,w+.18,h+.18,.22);
      var tex=texture(1024,384,function(c,cw,ch){c.fillStyle='#08131c';c.fillRect(0,0,cw,ch);c.strokeStyle=color;c.lineWidth=7;c.strokeRect(18,18,cw-36,ch-36);c.textAlign='center';c.fillStyle=color;c.font='900 112px Arial';c.fillText(label,cw/2,198);c.fillStyle='#a6c1cd';c.font='600 25px monospace';c.fillText(sub,cw/2,269);for(var s=0;s<ch;s+=5){c.fillStyle='rgba(0,0,0,.16)';c.fillRect(0,s,cw,1);}});
      mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}),g,0,0,.015);glow(g,color,0,0,0,w*1.5,.15);return g;
    }
    function ring(parent,r,thick,mat,x,y,z,rotation){var m=mesh(new T.TorusGeometry(r,thick,8,80),mat,parent,x,y,z);m.rotation.x=rotation===undefined?PI/2:rotation;return m;}
    function finishArena(arena,id){
      arena.animated=arena.animated||[];arena.colliders=arena.colliders||[];
      arena.animated.forEach(function(a){a.mesh.userData.keepDynamic=true;});
      // Merge the pieces carried by one animated pivot, leaving the pivot and
      // any independently animated descendants in their original hierarchy.
      (arena.rigidGroups||[]).forEach(function(group){group.userData.keepDynamic=true;batchMeshes(group,true);});
      // Keep the optional detail tier separate from the always-visible floor and
      // architecture. Each merge is expressed in its own parent's local space.
      arena.detail.userData.keepDynamic=true;
      batchMeshes(arena.detail,true);batchMeshes(arena.group,true);
      var p=arena.lighting,outdoor=id!=='nightclub';
      arena.palette={
        top:new T.Color(p.background),horizon:new T.Color(p.horizon===undefined?p.fogColor:p.horizon),fog:new T.Color(p.fogColor),
        fogDensity:p.fogDensity===undefined?clamp(1.5/(Math.max(1,p.fogFar||100)+Math.max(0,p.fogNear||0)),.005,.025):p.fogDensity,
        hemiSky:new T.Color(p.hemiSky),hemiGround:new T.Color(p.hemiGround===undefined?0x1a1428:p.hemiGround),
        key:new T.Color(p.keyColor),cool:new T.Color(p.coolColor),
        hemiIntensity:p.hemiIntensity===undefined?2.05:p.hemiIntensity,
        keyIntensity:p.keyIntensity===undefined?3.25:p.keyIntensity,
        coolIntensity:p.coolIntensity===undefined?2.4:p.coolIntensity,
        accentLights:!outdoor
      };
      return arena;
    }
    function buildArena(id){
      var builder=window.OilArenaBuilders&&window.OilArenaBuilders[id];
      if(!builder)throw new Error('O cenário '+id+' não foi carregado.');
      var authored=builder({THREE:T,bounds:arenaBounds[id],material:material,neon:neon,mesh:mesh,box:box,rod:rod,texture:texture,glow:glow,ring:ring,makeSign:makeSign,random:random});
      scene.add(authored.group);return finishArena(authored,id);
    }
    function setArena(id){
      id=Object.prototype.hasOwnProperty.call(arenaBounds,id)?id:'island';if(id===arenaId)return;arenaId=id;
      if(currentArena)currentArena.group.visible=false;
      currentArena=arenas[id]||(arenas[id]=buildArena(id));currentArena.group.visible=true;
      var p=currentArena.palette;
      skyUniforms.top.value.copy(p.top);skyUniforms.horizon.value.copy(p.horizon);scene.background.copy(p.top);
      scene.fog.color.copy(p.fog);scene.fog.density=p.fogDensity;hemi.color.copy(p.hemiSky);hemi.groundColor.copy(p.hemiGround);key.color.copy(p.key);cool.color.copy(p.cool);
      warm.color.setHex(0xff755d);teal.color.setHex(0x55d9ff);
      if(typeof lowMaterialCache!=='undefined'&&lowMaterialCache)setQuality(quality);
    }

    // Organic silhouettes share a small geometry palette; every animated joint is
    // a real pivot. The bounded roster cache is built only on selection changes.
    var shadowTex=texture(128,128,function(ctx,w,h){var g=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);g.addColorStop(0,'rgba(0,0,0,.57)');g.addColorStop(.45,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    var fighterCache=[{},{}],previewYaw=0;
    var characterStyles={veterano:true,titan:true,mimico:true,orelha:true,pixel:true};
    function ellipsoid(parent,mat,x,y,z,sx,sy,sz){return mesh(sphereGeo,mat,parent,x,y,z,sx,sy,sz,true);}
    function pivot(parent,x,y,z){var g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}
    function fighter(index,id){
      id=Object.prototype.hasOwnProperty.call(characterStyles,id)?id:index===0?'veterano':'titan';
      var c=characterStyles[id],color=index===1?0xffa779:0x74e6e1,root=new T.Group();scene.add(root);root.name='fighter-'+index+'-'+id;
      var rig={root:root,stance:pivot(root,0,0,0),character:id,color:color,phase:index*1.8,accent:neon(color,1.25)};
      if(id==='orelha')window.NeonDog.build(T,rig);else window.NeonHumans.build(T,rig,id,{glow:glow});
      rig.shadow=mesh(new T.PlaneGeometry(id==='orelha'?2.1:2.0,id==='orelha'?3.0:1.6),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.85}),scene,0,.059,0);rig.shadow.rotation.x=-PI/2;
      rig.ring=mesh(new T.RingGeometry(id==='orelha'?.95:.68,id==='orelha'?.967:.697,48),new T.MeshBasicMaterial({color:color,transparent:true,opacity:.36,side:T.DoubleSide,forceSinglePass:true,depthWrite:false}),scene,0,.06,0);rig.ring.rotation.x=-PI/2;
      rig.auraRing=mesh(new T.TorusGeometry(.62,.012,5,36),rig.accent,root,0,id==='orelha'?.93:1.55,0);rig.auraRing.rotation.x=PI/2;rig.auraRing.visible=false;
      if(id!=='orelha'){var pivots=[];root.traverse(function(part){if(part.isGroup)pivots.push(part);});pivots.forEach(function(p){batchMeshes(p,false);});}
      var slashMat=new T.MeshBasicMaterial({color:color,transparent:true,opacity:0,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
      rig.slash=mesh(new T.RingGeometry(.77,.96,32,1,0,PI*1.10),slashMat,root,0,id==='orelha'?.70:1.72,.40);rig.slash.visible=false;
      rig.slash2=mesh(new T.RingGeometry(.98,1.005,32,1,0,PI*.9),slashMat.clone(),root,0,id==='orelha'?.68:1.7,.41);rig.slash2.visible=false;
      rig.shield=mesh(new T.RingGeometry(.63,.66,36),new T.MeshBasicMaterial({color:0xbcffdf,transparent:true,opacity:.8,side:T.DoubleSide,forceSinglePass:true,depthWrite:false}),root,0,id==='orelha'?.97:1.91,.79);rig.shield.visible=false;
      rig.chargeRing=mesh(new T.RingGeometry(.85,.88,48),new T.MeshBasicMaterial({color:color,transparent:true,opacity:.6,side:T.DoubleSide,forceSinglePass:true,depthWrite:false}),root,0,.045,0);rig.chargeRing.rotation.x=-PI/2;rig.chargeRing.visible=false;
      rig.wind=pivot(root,0,0,0);rig.wind.visible=false;rig.windRings=[];
      for(var w=0;w<3;w++){var windMat=new T.MeshBasicMaterial({color:w===1?0xf5dca5:0xb4e9e2,transparent:true,opacity:.4,side:T.DoubleSide,forceSinglePass:true,depthWrite:false,blending:T.AdditiveBlending});var wind=mesh(new T.RingGeometry(.9,.934,40,1,w*.7,PI*1.52),windMat,rig.wind,0,.2+w*.3,0);wind.rotation.x=PI/2+w*.16;rig.windRings.push(wind);}
      if(id==='titan'){
        // The nozzle shares the simulation's muzzle: one metre forward, y=1.6.
        // Build after body batching so the weapon can be holstered as one rig.
        var gun=rig.oilGun=pivot(root,0,1.6/root.scale.y,1/root.scale.z);gun.scale.setScalar(1/root.scale.x);gun.visible=false;
        var gunMetal=material(0x273139,.72,.29),gunTrim=material(0xa7b4b0,.8,.23),oilTank=material(0x785521,.32,.25);
        box(gun,gunMetal,0,-.015,-.43,.19,.19,.48,true);
        rod(gun,gunTrim,0,0,-.28,0,0,-.015,.053);
        var nozzle=ring(gun,.066,.017,gunMetal,0,0,0,0);
        box(gun,gunMetal,0,-.16,-.59,.09,.24,.12,true);
        box(gun,gunTrim,0,-.13,-.33,.14,.10,.20,true);
        mesh(new T.CylinderGeometry(.11,.115,.30,18),oilTank,gun,0,.23,-.48,1,1,1,true);
        mesh(new T.CylinderGeometry(.117,.117,.035,18),gunTrim,gun,0,.398,-.48);
        box(gun,material(0xe8ce6f,.1,.58),0,.24,-.361,.085,.13,.012);
        var oilMark=mesh(new T.SphereGeometry(.032,10,8),material(0x181709,.1,.3),gun,0,.235,-.35,1,1.45,.16);
        var hosePath=new T.CatmullRomCurve3([new T.Vector3(.06,-.04,-.48),new T.Vector3(.17,-.26,-.63),new T.Vector3(.08,-.28,-.76),new T.Vector3(0,-.06,-.68)]);
        mesh(new T.TubeGeometry(hosePath,14,.018,6,false),gunMetal,gun);
        rig.oilJet=pivot(gun,0,0,0);rig.oilJet.visible=false;
        var jetMat=new T.MeshStandardMaterial({color:0x86652a,metalness:.25,roughness:.13,transparent:true,opacity:.78,depthWrite:false});
        for(var jet=0;jet<9;jet++)mesh(sphereGeo,jetMat,rig.oilJet,0,0,.08+jet*.083,.027+jet*.002,.027+jet*.002,.095);
        batchMeshes(gun,false);
      }
      return rig;
    }
    function showFighter(rig,visible){rig.root.visible=visible;rig.shadow.visible=visible;rig.ring.visible=visible;}
    function selectedFighter(index,id){
      id=Object.prototype.hasOwnProperty.call(characterStyles,id)?id:index===0?'veterano':'titan';
      var rig=fighterCache[index][id];
      if(!rig){rig=fighterCache[index][id]=fighter(index,id);if(typeof lowMaterialCache!=='undefined'&&lowMaterialCache)rig.root.traverse(function(part){if(part.isMesh){part.userData.originalMaterial=part.material;part.material=quality==='low'?lightweightMaterial(part.material):part.material;}});}
      return rig;
    }
    var fighters=[selectedFighter(0,'veterano'),selectedFighter(1,'titan')];
    var markerTexture=texture(96,96,function(c,w,h){c.strokeStyle='#fff3ce';c.lineWidth=5;[[17,17],[79,17],[17,79],[79,79]].forEach(function(p){var sx=p[0]<48?1:-1,sy=p[1]<48?1:-1;c.beginPath();c.moveTo(p[0]+sx*18,p[1]);c.lineTo(p[0],p[1]);c.lineTo(p[0],p[1]+sy*18);c.stroke();});c.fillStyle='#fff3ce';c.beginPath();c.arc(48,48,3,0,PI*2);c.fill();});
    var targetMarker=new T.Sprite(new T.SpriteMaterial({map:markerTexture,transparent:true,opacity:.7,depthWrite:false,depthTest:false}));targetMarker.scale.set(.56,.56,1);scene.add(targetMarker);
    // Recycled impact geometry: bursts have no growing allocation or draw-call cost.
    var sparkGeo=new T.BoxGeometry(1,1,1);
    var sparksMesh=new T.InstancedMesh(sparkGeo,new T.MeshBasicMaterial({color:0xffffff,toneMapped:false}),120);sparksMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);sparksMesh.frustumCulled=false;scene.add(sparksMesh);
    var sparks=[];for(var si=0;si<120;si++){sparks.push({life:0,max:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,size:0});temp.scale.set(0,0,0);temp.updateMatrix();sparksMesh.setMatrixAt(si,temp.matrix);}
    var sparkCursor=0,sparkColor=new T.Color();
    var waves=[];
    for(var wi=0;wi<6;wi++) {
      var wave=mesh(new T.TorusGeometry(1,.022,6,48),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),scene,0,0,0);
      wave.visible=false;waves.push({mesh:wave,life:0,max:.32});
    }
    function impact(x,z,color,power,feedback) {
      power=power||1;sparkColor.set(color||0xc5ffff);
      if(!reducedMotion){shake=Math.max(shake,feedback?feedback.shake:.06*Math.min(2.2,power));impactZoom=Math.max(impactZoom,feedback?feedback.zoom:0);impactRoll=feedback?feedback.roll:0;}
      var count=Math.floor(15+power*10);
      for(var i=0;i<count;i++) {
        var s=sparks[sparkCursor];s.life=.22+random()*.3;s.max=s.life;s.x=x;s.y=1.4+random()*.45;s.z=z;
        s.vx=(random()-.5)*9*power;s.vy=(random()-.25)*7;s.vz=(random()-.5)*6;s.size=.028+random()*.034;
        sparksMesh.setColorAt(sparkCursor,sparkColor);sparkCursor=(sparkCursor+1)%sparks.length;
      }
      sparksMesh.instanceColor.needsUpdate=true;
      var wa=waves.find(function(w){return w.life<=0;})||waves[0];wa.max=.32;wa.radius=1.35;wa.life=wa.max;wa.mesh.visible=true;wa.mesh.position.set(x,1.52,z);wa.mesh.material.color.copy(sparkColor);wa.mesh.quaternion.copy(camera.quaternion);
    }

    function effect(type,data) {
      data=data||{};
      var x=data.x||0,z=data.z||0,color=data.id===1?0xff7858:0x6de7ff;
      if(type==='parry')impact(x,z,0xe1ffb8,1.5);
      if(type==='guardBreak')impact(x,z,0xffcb8c,1.8);
      if(type==='hazardHit')impact(x,z,0xffa745,1.2);
      if(type==='attack'&&data.action==='special'&&data.character!=='titan'){
        var wa=waves.find(function(w){return w.life<=0;})||waves[0];wa.max=.68;wa.radius=4.2;wa.life=wa.max;wa.mesh.visible=true;wa.mesh.position.set(x,.12,z);wa.mesh.material.color.setHex(color);wa.mesh.rotation.set(PI/2,0,0);
      }
    }

    // Contact peaks at the authoritative windup, with a brief preparation and
    // a crisp drive into the hit. Recovery remains visible without delaying input.
    function strikeEnvelope(elapsed,windup,duration){
      var prepare=windup*.42;
      if(elapsed<prepare)return -.14*Math.sin(clamp(elapsed/Math.max(.001,prepare),0,1)*PI);
      if(elapsed<windup){var drive=clamp((elapsed-prepare)/Math.max(.001,windup-prepare),0,1);return drive*drive*(3-2*drive);}
      var contact=Math.min(.024,Math.max(.008,(duration-windup)*.12));
      if(elapsed<windup+contact)return 1;
      return Math.pow(1-clamp((elapsed-windup-contact)/Math.max(.001,duration-windup-contact),0,1),1.65);
    }
    // A chained move starts from the rendered joints of the preceding action.
    // Blend rotations only: bone lengths, scales and authoritative roots stay fixed.
    function blendCombatPose(rig,f,action,apply){
      var basic=action==='punch'||action==='kick',entry=!!f._entryFrom,serial=(f._attackSerial||0)+':'+action;
      if(!rig._poseBlend){
        var parts=[rig.stance,rig.torso,rig.head];
        (rig.arms||[]).forEach(function(a){parts.push(a.shoulder,a.elbow,a.fist);});
        rig.legs.forEach(function(l){parts.push(l.hip,l.knee,l.boot);});
        if(rig.tail)parts.push(rig.tail);
        rig._poseBlend={serial:null,action:null,active:false,parts:parts.map(function(part){return{node:part,from:part.quaternion.clone(),target:part.quaternion.clone()};}),stance:rig.stance.position.clone()};
      }
      var blend=rig._poseBlend;
      if(!apply){
        if(serial!==blend.serial){
          blend.active=basic&&((f._chainIndex||0)>1||entry)&&/^(punch|kick|dodge|sprint|walk)$/.test(blend.action||'');
          if(blend.active){blend.parts.forEach(function(p){p.from.copy(p.node.quaternion);});blend.stance.copy(rig.stance.position);}
          blend.serial=serial;blend.action=action;
        }
        if(!basic||f.blocking||action==='ko')blend.active=false;
        return;
      }
      if(!blend.active)return;
      var amount=clamp((f.actionTime||0)/.038,0,1);amount=amount*amount*(3-2*amount);
      if(amount>=1){blend.active=false;return;}
      blend.parts.forEach(function(p){p.target.copy(p.node.quaternion);p.node.quaternion.slerpQuaternions(p.from,p.target,amount);});
      rig.stance.position.lerp(blend.stance,1-amount);
    }
    function dogPose(rig,f,t,strike,walking,dead,menu,action){
      blendCombatPose(rig,f,action,false);
      var speed=action==='sprint'?23:15,step=(f.cinematic==='chase'?f.actionTime:clock)*speed+rig.phase;
      var breath=reducedMotion?0:Math.sin(clock*2.5+rig.phase)*.018;
      rig.torso.rotation.set(.025,0,0);rig.torso.position.y=.94+breath;
      rig.head.rotation.set(menu?-.025:0,menu?-.08:0,menu?-.07:0);
      rig.stance.rotation.set(0,0,0);rig.stance.position.set(0,0,0);
      rig.tail.rotation.set(.06,reducedMotion&&!walking?0:Math.sin(clock*(walking?13:4))*(walking?.24:.12),.16);
      for(var leg=0;leg<4;leg++){
        var l=rig.legs[leg],cycle=step+(leg===0||leg===3?0:PI),swing=walking?Math.sin(cycle)*.64:0;
        l.hip.rotation.set(swing,0,0);l.knee.rotation.set(l.front?.015:.10,0,0);l.boot.rotation.set(-swing*.18,0,0);
        if(walking)l.knee.rotation.x+=Math.max(0,-Math.sin(cycle))*.68;
      }
      if(walking){rig.stance.position.y=Math.abs(Math.sin(step))*.073;rig.torso.rotation.x+=Math.sin(step)*.065;rig.head.rotation.x=-.08;}
      if(action==='punch'){
        var chain=clamp((f._chainIndex||1)-1,0,7),paw=chain%2,drive=Math.max(0,strike),pounce=chain>=6;
        // Paw feints alternate; later contacts become shoulder checks and a
        // low, four-legged pounce instead of turning Orelha into a human boxer.
        rig.stance.position.z=drive*(pounce?.38:chain>=2?.28+chain*.008:.19);
        rig.torso.rotation.x=-strike*(pounce?.15:.08+chain*.009);rig.torso.rotation.y=(paw?1:-1)*strike*(chain>=2?.16:.08);
        rig.torso.rotation.z=(paw?1:-1)*drive*.055;rig.head.rotation.x=strike*(pounce?.25:.16);
        rig.head.rotation.y=(paw?-1:1)*drive*.12;
        rig.legs[paw].hip.rotation.x=-strike*(pounce?.68:.58);rig.legs[paw].knee.rotation.x=.015+drive*.48;
        rig.legs[1-paw].knee.rotation.x=.015+drive*(pounce?.23:.06);
        rig.legs[2].hip.rotation.x=drive*.18;rig.legs[3].hip.rotation.x=drive*.18;
        rig.stance.position.y=-drive*(chain===2||chain===4?.08:.015);
      }else if(action==='kick'&&f._airAttack){
        // Salto do Casamento: tuck four paws and lead with the forehead.
        rig.torso.rotation.x=-.12+Math.max(0,strike)*.20;rig.head.rotation.x=.22+Math.max(0,strike)*.24;
        rig.head.position.z=.64+Math.max(0,strike)*.18;rig.stance.position.z=Math.max(0,strike)*.25;
        for(var airLeg=0;airLeg<4;airLeg++){rig.legs[airLeg].hip.rotation.x=airLeg<2?-.9:.3;rig.legs[airLeg].knee.rotation.x=airLeg<2?1.15:.75;}
      }else if(action==='kick'){
        // A low turn with the hindquarters sweeping around all four supporting paws.
        var sweep=((f._chainIndex||1)-1)%4,turn=sweep%2?-1:1,sweepPower=Math.max(0,strike);
        rig.stance.rotation.y=turn*PI*2*(1-Math.pow(1-t,2));rig.stance.position.y=-sweepPower*(sweep>=2?.17:.12);
        rig.torso.rotation.z=turn*sweepPower*(sweep>=2?.19:.12);rig.head.rotation.y=-turn*sweepPower*.25;
        rig.legs[2].hip.rotation.set(-.18*sweepPower,0,-sweepPower*(turn>0?.48:.26));
        rig.legs[3].hip.rotation.set(-.25*sweepPower,0,sweepPower*(turn<0?.48:.26));
        rig.legs[0].knee.rotation.x=.015+sweepPower*.14;rig.legs[1].knee.rotation.x=.015+sweepPower*.14;
        rig.tail.rotation.z=.16+sweepPower*(sweep>=2?.50:.34);
      }else if(action==='special'){
        rig.torso.rotation.x=-.12+strike*.26;rig.head.rotation.x=-.18+strike*.33;
        for(var front=0;front<2;front++){rig.legs[front].hip.rotation.x=-Math.max(0,strike)*.40;rig.legs[front].knee.rotation.x=Math.max(0,strike)*.44;}
        rig.stance.position.z=Math.max(0,strike)*.20;
      }else if(action==='super'){
        var advance=clamp(((f.actionTime||0)-.15)/.20,0,3),part=advance%1,run=clock*29;
        rig.stance.position.y=t<.16?-Math.sin(t/.16*PI)*.18:Math.abs(Math.sin(run))*.11;
        rig.torso.rotation.x=t<.16?-.10:.11;rig.head.rotation.x=t<.16?-.16:.10;
        rig.stance.position.z=t<.16?-.12:Math.sin(part*PI)*.30;
        rig.stance.rotation.z=Math.sin(advance*PI*2)*.085;
        for(var r=0;r<4;r++){var stride=Math.sin(run+(r===0||r===3?0:PI));rig.legs[r].hip.rotation.x=stride*.91;rig.legs[r].knee.rotation.x=.15+Math.max(0,-stride)*.76;}
        rig.tail.rotation.y=Math.sin(run)*.2;
      }else if(action==='dodge'){
        var dodgeX=f._dodgeX||0,dodgeZ=f._dodgeZ||0,side=dodgeX*Math.cos(rig.root.rotation.y)-dodgeZ*Math.sin(rig.root.rotation.y);
        // Roll around the body's own center, not a human's feet; lateral dashes
        // retain the distinctive dog silhouette and folded ears.
        var roll=Math.sin(t*PI);rig.torso.position.y=.94-roll*.11;
        if(Math.abs(side)>.55){rig.torso.rotation.z=-side*roll*.55;rig.stance.position.y=-roll*.18;}
        else{rig.torso.rotation.x=-PI*2*t;rig.torso.position.y=.94+roll*.12;}
        for(var d=0;d<4;d++){rig.legs[d].hip.rotation.x=-roll*.85;rig.legs[d].knee.rotation.x=roll*1.35;}
      }else if(action==='jump'||(f.y||0)>.10){
        rig.torso.rotation.x=-.13;rig.head.rotation.x=.23;rig.head.position.z=.64+Math.sin(t*PI)*.13;
        for(var j=0;j<4;j++){rig.legs[j].hip.rotation.x=j<2?-.8:.38;rig.legs[j].knee.rotation.x=j<2?1.0:.65;}
      }else if(action==='hurt'){
        var recoil=Math.sin(t*PI);rig.stance.position.z=-recoil*.16;rig.torso.rotation.x=-recoil*.13;rig.head.rotation.x=-recoil*.15;
      }
      if(action!=='jump'&&!(action==='kick'&&f._airAttack))rig.head.position.z=.64;
      if((action==='punch'||action==='kick')&&f._entryFrom){
        var entryFade=Math.pow(1-clamp(t/.72,0,1),2);
        if(f._entryFrom==='dodge'){
          rig.stance.position.y-=entryFade*.11;rig.torso.rotation.z+=entryFade*.10;
          for(var entryLeg=0;entryLeg<4;entryLeg++)rig.legs[entryLeg].knee.rotation.x+=entryFade*.15;
        }else if(f._entryFrom==='sprint'){
          rig.torso.rotation.x+=entryFade*.12;rig.stance.position.z+=entryFade*.10;
          rig.legs[2].hip.rotation.x+=entryFade*.28;rig.legs[3].hip.rotation.x+=entryFade*.28;
        }
      }
      if(f.blocking||action==='block'){rig.stance.position.y=-.15;rig.head.rotation.x=.16;rig.torso.rotation.x=-.10;for(var b=0;b<4;b++)rig.legs[b].knee.rotation.x=.28;}
      rig.ears.forEach(function(ear){ear.base.rotation.x=(walking?Math.sin(step)*.13:breath*1.7)+(action==='dodge'?-.34:0);ear.base.rotation.z=-ear.side*.18+(menu&&!reducedMotion?Math.sin(clock*1.7+ear.side)*.035:0);ear.tip.rotation.x=.60+(walking?Math.sin(step-1)*.3:breath*3);});
      if(dead){var fall=1-Math.pow(1-clamp((f.actionTime||0)/.55,0,1),3);rig.torso.rotation.z=fall*1.5;rig.torso.position.y=.94-fall*.51;rig.head.rotation.x=-.08;rig.tail.rotation.y=0;for(var k=0;k<4;k++){rig.legs[k].hip.rotation.x=-.15;rig.legs[k].knee.rotation.x=.35;}}
      blendCombatPose(rig,f,action,true);
    }
    function humanPose(rig,f,t,strike,walking,dead,menu,action,lowTarget){
      blendCombatPose(rig,f,action,false);
      var isVet=rig.character==='veterano',isMime=rig.character==='mimico',isTitan=rig.character==='titan',isPixel=rig.character==='pixel';
      var step=Math.sin(clock*(action==='sprint'?21:15)+rig.phase),a0=rig.arms[0],a1=rig.arms[1],l0=rig.legs[0],l1=rig.legs[1];
      rig.stance.rotation.set(0,0,0);rig.stance.position.set(0,0,0);
      rig.torso.rotation.set(.025,reducedMotion?0:Math.sin(clock*1.9+rig.phase)*.012,0);
      rig.head.rotation.set(-.025,0,0);
      a0.shoulder.rotation.set(-.25,0,.10);a1.shoulder.rotation.set(-.22,0,-.10);
      a0.elbow.rotation.set(-1.35,0,0);a1.elbow.rotation.set(-1.35,0,0);
      a0.fist.rotation.set(.1,0,0);a1.fist.rotation.set(.1,0,0);
      l0.hip.rotation.set(-.10,0,.045);l1.hip.rotation.set(.12,0,-.045);
      l0.knee.rotation.set(.18,0,0);l1.knee.rotation.set(.18,0,0);
      l0.boot.rotation.x=-.02;l1.boot.rotation.x=-.14;
      a0.aura.visible=a1.aura.visible=false;
      if(menu){
        a0.shoulder.rotation.set(.035,0,isMime?-.18:-.12);a1.shoulder.rotation.set(.06,0,isMime?.18:.12);
        a0.elbow.rotation.x=isVet?-.33:-.16;a1.elbow.rotation.x=rig.character==='titan'?-.63:-.25;
        rig.torso.rotation.y=-.10;rig.head.rotation.y=.14;rig.stance.position.y=.02;
        l0.hip.rotation.z=-.025;l1.hip.rotation.z=.025;
        if(isMime){rig.head.rotation.z=-.055;a1.shoulder.rotation.x=-.08;a1.elbow.rotation.x=-1.21;a1.fist.rotation.y=.45;l0.hip.rotation.z=-.13;l1.hip.rotation.z=.13;}
      }
      if(walking&&!dead){
        var sprint=action==='sprint';rig.root.position.y+=Math.abs(step)*(sprint?.079:.048);
        l0.hip.rotation.x=-.12+step*(sprint?.91:.62);l1.hip.rotation.x=.10-step*(sprint?.91:.62);
        l0.knee.rotation.x=.14+Math.max(0,-step)*.84;l1.knee.rotation.x=.17+Math.max(0,step)*.84;
        l0.boot.rotation.x=-step*.18;l1.boot.rotation.x=step*.18;
        a0.shoulder.rotation.x=-.35-step*(sprint?.62:.22);a1.shoulder.rotation.x=-.15+step*(sprint?.62:.22);
        rig.torso.rotation.z=step*.035;rig.torso.rotation.x+=sprint?.19:.055;
      }
      if(action==='punch'){
        var chain=clamp((f._chainIndex||1)-1,0,7),lead=chain%2?a1:a0,opposite=lead===a0?a1:a0,side=lead===a0?-1:1;
        var drive=Math.max(0,strike),hook=chain===2||chain===5||chain===6,upper=chain===3||(chain===0&&f._entryFrom==='dodge'),finisher=chain===7;
        var body=chain===2,weight=isTitan?1.16:isPixel?.85:isMime?1.07:1;
        // Eight distinct contacts: left/right jab, body hook, uppercut, cross,
        // wide hook, rising shovel hook and a committed overhand finisher.
        var shoulderX=lowTarget?-.52:upper?-1.08:hook?-.96:finisher?-1.57:-1.44;
        var elbowX=lowTarget?(hook?-.50:-.14):upper?-1.43:hook?(chain===6?-1.24:-.98):finisher?-.25:-.09;
        if(body&&!lowTarget){shoulderX=-.68;elbowX=-.65;}
        var baseShoulder=lead===a0?-.25:-.22,baseElbow=-1.35;
        lead.shoulder.rotation.x=baseShoulder+(shoulderX-baseShoulder)*strike;
        lead.shoulder.rotation.y=-side*strike*(hook?.58:upper?.15:finisher?.27:.09);
        lead.shoulder.rotation.z=(lead===a0?.10:-.10)+side*drive*(hook?.32:finisher?.20:.025);
        lead.elbow.rotation.x=baseElbow+(elbowX-baseElbow)*drive;
        lead.fist.rotation.y=side*drive*(hook?.24:.08);lead.fist.rotation.z=-side*drive*(upper?.45:.12);
        opposite.shoulder.rotation.x-=drive*.08;opposite.elbow.rotation.x-=drive*.10;
        rig.torso.rotation.y=side*strike*Math.min(.30,(hook?.28:finisher?.28:chain===4?.25:.18)*weight);
        rig.torso.rotation.x+=strike*(body?.22:upper?-.065:finisher?.18:.085);
        rig.torso.rotation.z=-side*drive*(finisher?.09:hook?.055:.018);
        rig.head.rotation.y=-rig.torso.rotation.y*.45;rig.head.rotation.x+=drive*(upper?.07:.035);
        rig.stance.position.z=strike*(finisher?.19:chain===4?.15:.10)*weight;
        rig.stance.position.y=-drive*(body?.085:upper?.045:finisher?.05:.012);
        l0.knee.rotation.x+=drive*(body?.18:.06);l1.knee.rotation.x+=drive*(body?.18:.06);
        (side>0?l1:l0).hip.rotation.y=-side*drive*(hook?.20:.11);
        if(isMime){lead.fist.rotation.z+=side*drive*.19;rig.head.rotation.z=-side*drive*.055;}
        if(isPixel){rig.torso.rotation.x+=drive*.045;opposite.shoulder.rotation.x-=drive*.10;}
      }else if(action==='kick'){
        var kick=f._entryFrom==='sprint'?1:f._entryFrom==='dodge'?2:((f._chainIndex||1)-1)%4;
        var kickSide=kick%2?-1:1,kicking=kickSide>0?l1:l0,support=kickSide>0?l0:l1;
        var drive=Math.max(0,strike),chamber=Math.sin(t*PI)*(1-drive),round=kick===2,thrust=kick===3;
        var kickHeight=lowTarget?-.86:kick===1?-1.40:round?-1.50:thrust?-1.66:-1.62;
        kicking.hip.rotation.x=(kickSide>0?.16:-.14)+strike*(kickHeight-(kickSide>0?.16:-.14))-.22*chamber;
        kicking.hip.rotation.z=(kickSide>0?-.065:.045)+kickSide*drive*(round?.38:thrust?.22:.07);
        kicking.hip.rotation.y=-kickSide*drive*(round?.56:thrust?.37:.09);
        kicking.knee.rotation.x=.20+chamber*(kick===1?1.22:.85)+drive*(kick===1?.68:.04);
        kicking.boot.rotation.x=-.10-drive*(thrust?.05:.12);
        support.knee.rotation.x+=drive*.11;support.hip.rotation.y=-kickSide*drive*(round?.25:.12);
        rig.torso.rotation.x-=strike*(kick===1?.12:thrust?.33:.24);
        rig.torso.rotation.y=-kickSide*strike*(round?.28:thrust?.30:.19);
        rig.head.rotation.y=-rig.torso.rotation.y*.55;
        a0.shoulder.rotation.x+=drive*(kickSide<0?.35:.12);a1.shoulder.rotation.x+=drive*(kickSide>0?.35:.12);
        rig.stance.position.y=drive*.035;rig.stance.position.z=drive*(thrust?.15:.065);
        if(isTitan){rig.torso.rotation.z=kickSide*drive*.06;rig.stance.position.y-=drive*.035;}
        if(isPixel){a0.elbow.rotation.x-=drive*.10;a1.elbow.rotation.x-=drive*.10;rig.torso.rotation.x+=drive*.055;}
      }else if(action==='special'&&rig.character==='titan'){
        var firing=(f.actionTime||0)>=.18&&(f.actionTime||0)<5.18;
        var recoil=firing&&!reducedMotion?Math.sin(clock*65)*.009:0;
        rig.torso.rotation.set(.035,0,0);rig.head.rotation.set(-.04,0,0);
        a0.shoulder.rotation.set(-.37,0,.38);a1.shoulder.rotation.set(-.30,0,-.37);
        a0.elbow.rotation.x=-.39;a1.elbow.rotation.x=-.26;
        a0.fist.rotation.set(0,0,-.35);a1.fist.rotation.set(0,0,.32);
        l0.hip.rotation.x=-.22;l1.hip.rotation.x=.27;l0.knee.rotation.x=.22;l1.knee.rotation.x=.27;
        rig.stance.position.z=recoil;
      }else if(action==='special'||action==='super'){
        var isSuper=action==='super',charge=clamp(t/(isSuper?.24:.20),0,1),blast=Math.max(0,strike);
        if(isSuper)blast=Math.max(blast,Math.sin(clamp((t-.23)/.68,0,1)*PI));
        a0.shoulder.rotation.x=-.28-blast*(lowTarget?.55:1.24);a1.shoulder.rotation.x=-.28-blast*(lowTarget?.55:1.24);
        a0.shoulder.rotation.z=.2-blast*.16;a1.shoulder.rotation.z=-.2+blast*.16;
        a0.elbow.rotation.x=-1.7+blast*1.64;a1.elbow.rotation.x=-1.7+blast*1.64;
        rig.torso.rotation.x+=blast*.19;rig.stance.position.z=blast*.25;
        if(isSuper){rig.stance.rotation.y=t<.25?-Math.sin(t/.25*PI)*.30:0;rig.stance.position.y=Math.sin(t*PI)*.09;}
        rig.auraRing.visible=true;rig.auraRing.scale.setScalar(.9+charge*.3);rig.auraRing.rotation.z=reducedMotion?0:clock*5;
        a0.aura.visible=a1.aura.visible=true;a0.aura.material.opacity=a1.aura.material.opacity=.38*charge;
        a0.aura.scale.setScalar(.7+charge*.9);a1.aura.scale.setScalar(.7+charge*.9);
      }else if(action==='dodge'){
        var crouch=Math.sin(t*PI);rig.stance.position.y=-.38*crouch;rig.torso.rotation.x=.25;
        l0.hip.rotation.x=-.69*crouch;l1.hip.rotation.x=-.48*crouch;l0.knee.rotation.x=1.0*crouch;l1.knee.rotation.x=.93*crouch;
        var side=(f._dodgeX||0)*Math.cos(rig.root.rotation.y)-(f._dodgeZ||0)*Math.sin(rig.root.rotation.y);
        rig.stance.rotation.z=-side*.23*crouch;
      }else if(action==='jump'||(f.y||0)>.1){
        l0.hip.rotation.x=-.82;l0.knee.rotation.x=1.10;l1.hip.rotation.x=.27;l1.knee.rotation.x=.75;
        a0.shoulder.rotation.x=-.68;a1.shoulder.rotation.x=-.31;
      }else if(action==='hurt'){
        var recoil=Math.sin(PI*Math.min(1,t*1.7));rig.torso.rotation.x=-.29*recoil;rig.head.rotation.x=-.2*recoil;
        a0.shoulder.rotation.x=-.2;a1.shoulder.rotation.x=.2;a0.elbow.rotation.x=-.85;a1.elbow.rotation.x=-.8;rig.stance.position.z=-.15*recoil;
      }
      if(isMime&&!dead&&!menu&&(action==='special'||action==='super'||action==='kick')){
        var rotorAction=action==='special'||action==='super',rotorPower=Math.sin(t*PI);
        if(rotorAction){
          var spin=clamp(((f.actionTime||0)-.08)/Math.max(.1,(f.actionDuration||.8)-.08),0,1);
          rig.stance.rotation.y=spin*PI*(action==='super'?6:4);
          rig.torso.rotation.set(-.03,0,0);rig.head.rotation.set(0,0,0);
          a0.shoulder.rotation.set(-.04,0,-PI/2+.10);a1.shoulder.rotation.set(-.04,0,PI/2-.10);
          a0.elbow.rotation.x=a1.elbow.rotation.x=-.12;
          l0.hip.rotation.x=-.12;l1.hip.rotation.x=.08;l0.knee.rotation.x=l1.knee.rotation.x=.24;
          rig.stance.position.z=0;rig.stance.position.y=-.04*rotorPower;
          rig.auraRing.visible=true;rig.auraRing.rotation.set(PI/2,0,0);rig.auraRing.position.y=2.29;
          rig.auraRing.scale.setScalar(2.1+rotorPower*.65);
        }else if(f._airAttack){
          rig.torso.rotation.x=.18;l1.hip.rotation.x=-.26;l1.knee.rotation.x=.04;
          l0.hip.rotation.x=-.78;l0.knee.rotation.x=1.15;
          a0.shoulder.rotation.z=-1.13;a1.shoulder.rotation.z=1.13;
        }else{
          var rotorVariant=((f._chainIndex||1)-1)%4,rotorSide=rotorVariant%2?-1:1,rotorLeg=rotorSide>0?l1:l0;
          rig.stance.rotation.y=rotorSide*t*PI*2;
          rotorLeg.hip.rotation.set(-.20-Math.max(0,strike)*(rotorVariant>=2?.35:.04),0,rotorSide*(rotorVariant>=2?1.08:.88)*Math.max(0,strike));
          rotorLeg.knee.rotation.x=.12+Math.max(0,strike)*(rotorVariant===1?.22:.03);
          a0.shoulder.rotation.set(-.1,0,-1.10);a1.shoulder.rotation.set(-.1,0,1.10);a0.elbow.rotation.x=a1.elbow.rotation.x=-.18;
        }
      }
      if((action==='punch'||action==='kick')&&f._entryFrom){
        var entryFade=Math.pow(1-clamp(t/.72,0,1),2);
        if(f._entryFrom==='dodge'){
          rig.stance.position.y-=entryFade*.20;rig.torso.rotation.x+=entryFade*.13;
          l0.hip.rotation.x-=entryFade*.22;l1.hip.rotation.x-=entryFade*.18;
          l0.knee.rotation.x+=entryFade*.32;l1.knee.rotation.x+=entryFade*.30;
        }else if(f._entryFrom==='sprint'){
          rig.torso.rotation.x+=entryFade*.18;rig.stance.position.z+=entryFade*.11;
          a0.shoulder.rotation.x+=entryFade*.08;a1.shoulder.rotation.x+=entryFade*.15;
          l1.hip.rotation.x+=entryFade*.20;l1.knee.rotation.x+=entryFade*.15;
        }
      }
      if(lowTarget&&(action==='punch'||action==='kick'||((action==='special'||action==='super')&&!isMime&&!(isTitan&&action==='special')))){
        var crouch=Math.max(0,strike);rig.stance.position.y-=.11*crouch;rig.head.rotation.x+=.12*crouch;
        if(action==='punch'){rig.torso.rotation.x+=.15*crouch;l0.hip.rotation.x-=.10*crouch;l1.hip.rotation.x-=.10*crouch;l0.knee.rotation.x+=.16*crouch;l1.knee.rotation.x+=.16*crouch;}
      }
      if(f.blocking||action==='block'){
        a0.shoulder.rotation.set(-.72,-.12,.2);a1.shoulder.rotation.set(-.72,.12,-.2);
        a0.elbow.rotation.x=-1.57;a1.elbow.rotation.x=-1.57;a0.fist.rotation.z=-.18;a1.fist.rotation.z=.18;
        rig.torso.rotation.x=.13;rig.head.rotation.x=.10;
      }
      if(dead){
        var fall=1-Math.pow(1-clamp((f.actionTime||0)/.55,0,1),3);rig.stance.rotation.x=-fall*1.46;rig.stance.position.y=-fall*.02;rig.torso.rotation.x=-.1;
        a0.shoulder.rotation.set(.30,0,.75);a1.shoulder.rotation.set(.1,0,-.72);a0.elbow.rotation.x=-.3;a1.elbow.rotation.x=-.2;
        l0.hip.rotation.x=-.08;l1.hip.rotation.x=.08;l0.knee.rotation.x=.15;l1.knee.rotation.x=.3;rig.root.position.y=.16*fall+.035;
      }
      blendCombatPose(rig,f,action,true);
    }
    function pose(rig,f,dt,index,menu,opponent){
      var elapsed=f.actionTime||0,duration=Math.max(.15,f.actionDuration||.5),t=clamp(elapsed/duration,0,1),action=f.action||'idle';
      var walking=!menu&&(action==='walk'||action==='sprint'||Math.abs(f.vx||0)+Math.abs(f.vz||0)>.12),dead=!menu&&(action==='ko'||f.hp<=0),isDog=rig.character==='orelha';
      var lowTarget=!menu&&!isDog&&opponent&&opponent.character==='orelha'&&(opponent.y||0)<(f.y||0)+.55;
      var bob=reducedMotion?0:Math.sin(clock*3+rig.phase)*.017;rig.root.position.set(f.x||0,(f.y||0)+bob+.025,f.z||0);
      var goal=menu?PI-.57+previewYaw:Number.isFinite(f.yaw)?f.yaw:(f.face||(index===0?1:-1))===1?PI/2:-PI/2;
      var offensive=action==='punch'||action==='kick'||action==='special'||action==='super';
      if(offensive&&elapsed>=duration){action='idle';offensive=false;}
      if(!menu&&offensive&&Number.isFinite(f._attackYaw))goal=f._attackYaw;
      var diff=T.MathUtils.euclideanModulo(goal-rig.root.rotation.y+PI,PI*2)-PI;rig.root.rotation.y+=diff*Math.min(1,dt*28);
      var moveSpec=window.FightSim&&(window.FightSim.getMove?window.FightSim.getMove(f,action):window.FightSim.moves&&window.FightSim.moves[action]),windup=moveSpec?moveSpec.windup:duration*.25;
      var strike=strikeEnvelope(elapsed,windup||duration*.25,duration);rig.auraRing.visible=false;rig.auraRing.rotation.set(PI/2,0,0);rig.auraRing.position.y=isDog?.93:1.55;
      if(isDog)dogPose(rig,f,t,strike,walking,dead,menu,action);else humanPose(rig,f,t,strike,walking,dead,menu,action,lowTarget);
      // The extra contact distance is shown as a full-body extension. Bones keep
      // their lengths and the authoritative fighter position never teleports.
      var reachExtension=offensive&&moveSpec?moveSpec.reachExtension||0:0;
      if(reachExtension&&moveSpec.cone<PI&&!dead&&!menu)rig.stance.position.z+=Math.min(.75,reachExtension)*Math.max(0,strike);
      var oilAttack=rig.character==='titan'&&action==='special'&&!dead&&!menu;
      if(rig.oilGun){rig.oilGun.visible=oilAttack;rig.oilJet.visible=oilAttack&&elapsed>=.18&&elapsed<5.18;rig.oilJet.scale.set(1,1,reducedMotion?.85:.86+Math.sin(clock*65)*.14);rig.oilJet.rotation.z=reducedMotion?0:clock*15;}
      var attackAlpha=offensive&&!oilAttack&&elapsed>=windup?Math.max(0,strike):0;
      rig.slash.visible=attackAlpha>.07&&!dead&&!menu;rig.slash2.visible=attackAlpha>.22&&!dead&&!menu;
      rig.slash.position.y=isDog?.70:lowTarget?1.19:1.72;rig.slash2.position.y=isDog?.68:lowTarget?1.17:1.70;
      rig.slash.rotation.set(isDog||action==='kick'?-PI/2:-.50,0,-t*PI*1.6+(index?1:-1)*.3);rig.slash2.rotation.copy(rig.slash.rotation);rig.slash2.rotation.z+=.24;
      var reach=(action==='super'?1.65:action==='special'?1.35:action==='kick'?1.25:.88)+reachExtension*.32;
      var chainForce=clamp(((f._chainIndex||1)-1)/7,0,1);
      rig.slash.scale.setScalar(reach+chainForce*.18);rig.slash2.scale.setScalar(reach*1.11+chainForce*.2);rig.slash.material.opacity=attackAlpha*(.3+chainForce*.2);rig.slash2.material.opacity=attackAlpha*(.42+chainForce*.2);
      rig.shield.visible=!!(f.blocking||action==='block')&&!dead&&!menu;rig.shield.material.opacity=f._parryWindow>0?.92:.34;rig.shield.rotation.z=reducedMotion?0:clock*.5;
      rig.chargeRing.visible=(action==='special'||action==='super')&&!oilAttack&&!dead&&!menu;rig.chargeRing.scale.setScalar(1+t*(action==='super'?3.7:1.4));rig.chargeRing.material.opacity=(1-t)*.6;
      var rotor=rig.character==='mimico'&&(action==='special'||action==='super');
      rig.wind.visible=(isDog||rotor)&&(action==='special'||action==='super')&&!dead&&!menu;
      if(rig.wind.visible)rig.windRings.forEach(function(w,n){w.rotation.z=(reducedMotion?0:clock*(7+n*3))+n;w.scale.setScalar(.65+((t*2+n*.29)%1)*2.4);w.material.opacity=Math.sin(t*PI)*.30;w.position.z=rotor?0:action==='special'?t*1.8:0;w.position.y=rotor?2.3+n*.04:.2+n*.3;if(rotor){w.scale.setScalar(1.65+n*.22);w.rotation.x=PI/2;}});
      rig.shadow.position.set(f.x||0,.059,(f.z||0)+(dead?-.5:0));rig.shadow.rotation.z=-rig.root.rotation.y;
      rig.shadow.material.opacity=.85/(1+(f.y||0)*.7);rig.shadow.scale.setScalar(1+(f.y||0)*.22);
      rig.ring.position.set(f.x||0,.063,f.z||0);rig.ring.material.opacity=dead?.10:menu?.17:.3;
    }

    // Maré da Proteção temporarily carries the whole duel to a sunset shore.
    // All water, sand and wind are local geometry/shaders, allocated just once.
    var beachBlend=0,beachRoot=new T.Group();beachRoot.name='praia-brava';beachRoot.visible=false;scene.add(beachRoot);
    var sandTexture=texture(512,512,function(c,w,h){
      c.fillStyle='#b99b78';c.fillRect(0,0,w,h);
      for(var s=0;s<3500;s++){c.fillStyle=s%2?'rgba(240,216,176,.12)':'rgba(81,69,56,.075)';c.fillRect(random()*w,random()*h,random()*2+.5,1);}
      for(var line=0;line<38;line++){c.strokeStyle='rgba(234,207,166,.08)';c.lineWidth=1;c.beginPath();for(var x=0;x<=w;x+=16)c.lineTo(x,line*15+Math.sin(x*.02+line*.63)*3);c.stroke();}
    });sandTexture.wrapS=sandTexture.wrapT=T.RepeatWrapping;sandTexture.repeat.set(4,4);
    var beachSand=mesh(new T.CircleGeometry(1,64),new T.MeshStandardMaterial({map:sandTexture,color:0xf6ddba,roughness:1,metalness:0}),beachRoot,0,.045,0,18,18,1);beachSand.rotation.x=-PI/2;beachSand.receiveShadow=true;
    var seaUniforms={time:{value:0}};
    var sea=mesh(new T.PlaneGeometry(200,200),new T.ShaderMaterial({uniforms:seaUniforms,side:T.DoubleSide,
      vertexShader:'varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 p;uniform float time;void main(){float wave=sin(p.y*2.8+sin(p.x*.16)+time*1.6)*.5+.5;float line=pow(wave,18.);float far=clamp(length(p)*.011,0.,1.);vec3 c=mix(vec3(.13,.37,.39),vec3(.29,.36,.43),far)+line*.09;float path=exp(-pow((p.x+24.)*.04,2.))*smoothstep(8.,66.,-p.y);c+=vec3(.5,.24,.12)*path*(.25+line);gl_FragColor=vec4(c,1.);}'
    }),beachRoot,0,-.04,0);sea.rotation.x=-PI/2;
    var shore=mesh(new T.RingGeometry(17.6,18.6,64),new T.MeshBasicMaterial({color:0xe9e3c6,transparent:true,opacity:.35,side:T.DoubleSide,forceSinglePass:true,depthWrite:false}),beachRoot,0,.027,0);shore.rotation.x=-PI/2;
    var beachSun=mesh(new T.CircleGeometry(5.4,48),new T.MeshBasicMaterial({color:0xffca8d,fog:false,toneMapped:false}),beachRoot,-28,8,-70);
    var beachSunGlow=glow(beachRoot,0xff9760,-28,8,-70,24,.27);
    var coastalRock=material(0x514942,.01,1);
    for(var cr=0;cr<12;cr++){var angle=.48+cr*.15;ellipsoid(beachRoot,coastalRock,Math.cos(angle)*34,-.2,Math.sin(angle)*34,2+random()*3,1.5+random()*3.7,2+random()*3);}
    batchMeshes(beachRoot,false);
    var sandPositions=new Float32Array(90*3),sandSeeds=[];
    for(var grain=0;grain<90;grain++)sandSeeds.push({phase:random()*PI*2,r:1+random()*4.7,h:random()*1.2});
    var sandGeometry=new T.BufferGeometry();sandGeometry.setAttribute('position',new T.BufferAttribute(sandPositions,3));
    var sandWind=new T.Points(sandGeometry,new T.PointsMaterial({color:0xf5dbad,size:.056,transparent:true,opacity:.7,depthWrite:false}));scene.add(sandWind);sandWind.visible=false;sandWind.frustumCulled=false;
    var windProjectiles=[];
    var oilProjectiles=[];
    var flyingOil=material(0x6d542a,.32,.17);
    for(var op=0;op<12;op++){
      var oilRoot=new T.Group();scene.add(oilRoot);oilRoot.visible=false;
      mesh(sphereGeo,flyingOil,oilRoot,0,0,0,.095,.078,.22);
      mesh(sphereGeo,flyingOil,oilRoot,0,0,-.26,.041,.035,.24);
      mesh(sphereGeo,flyingOil,oilRoot,.09,-.04,-.16,.03,.023,.065);
      mesh(sphereGeo,flyingOil,oilRoot,-.07,.055,-.25,.02,.018,.055);
      batchMeshes(oilRoot,false);oilProjectiles.push(oilRoot);
    }
    for(var wp=0;wp<4;wp++){
      var windRoot=new T.Group();scene.add(windRoot);windRoot.visible=false;var windParts=[];
      for(var strip=0;strip<3;strip++){
        var windStrip=mesh(new T.TorusGeometry(.35+strip*.085,.017,4,18,PI*1.56),new T.MeshBasicMaterial({color:strip===1?0xe6c894:0xbde2d5,transparent:true,opacity:.67,depthWrite:false}),windRoot,0,0,strip*.06);
        windStrip.rotation.y=strip*.13;windParts.push(windStrip);
      }
      windProjectiles.push({root:windRoot,parts:windParts});
    }
    var beachTop=new T.Color(0x354564),beachHorizon=new T.Color(0xf59f75),beachFog=new T.Color(0xcb987c),beachKey=new T.Color(0xffd3a0),beachCool=new T.Color(0x80b9bd);
    var beachHemiSky=new T.Color(0xffd7aa),beachHemiGround=new T.Color(0x967655);
    function updateBeach(dt,state,fs){
      var source=null,windSource=null;
      if(state.phase!=='menu')fs.forEach(function(f){var active=(f.actionTime||0)<(f.actionDuration||1.02);if(f.character==='orelha'&&f.action==='super'&&f.hp>0&&active)source=f;if(f.character==='orelha'&&(f.action==='special'||f.action==='super')&&f.hp>0&&active)windSource=f;});
      var target=source?1:0;beachBlend=lerp(beachBlend,target,1-Math.exp(-dt*(source?14:5)));
      if(beachBlend<.003)beachBlend=0;
      beachRoot.visible=beachBlend>.07;if(currentArena)currentArena.group.visible=beachBlend<.4;
      var palette=currentArena.palette;
      skyUniforms.top.value.copy(palette.top).lerp(beachTop,beachBlend);skyUniforms.horizon.value.copy(palette.horizon).lerp(beachHorizon,beachBlend);
      scene.background.copy(skyUniforms.top.value);scene.fog.color.copy(palette.fog).lerp(beachFog,beachBlend);scene.fog.density=lerp(palette.fogDensity,.011,beachBlend);
      key.color.copy(palette.key).lerp(beachKey,beachBlend);cool.color.copy(palette.cool).lerp(beachCool,beachBlend);
      hemi.color.copy(palette.hemiSky).lerp(beachHemiSky,beachBlend);hemi.groundColor.copy(palette.hemiGround).lerp(beachHemiGround,beachBlend);
      applyArenaLightIntensity();
      if(beachRoot.visible){seaUniforms.time.value=reducedMotion?0:clock;var beachRadius=(arenaBounds[arenaId]||11)+6.7;beachSand.scale.set(beachRadius,beachRadius,1);shore.scale.setScalar(beachRadius/18);shore.material.opacity=(.25+(reducedMotion?0:Math.sin(clock*2)*.1))*beachBlend;}
      sandWind.visible=!!windSource&&!reducedMotion;
      if(windSource){
        for(var g=0;g<sandSeeds.length;g++){var s=sandSeeds[g],a=s.phase+clock*(windSource.action==='super'?8:6),at=g*3;sandPositions[at]=(windSource.x||0)+Math.sin(a)*s.r;sandPositions[at+1]=.11+s.h*(.6+Math.sin(a*.6)*.35);sandPositions[at+2]=(windSource.z||0)+Math.cos(a)*s.r;}
        sandGeometry.attributes.position.needsUpdate=true;
      }
      var projectiles=state.projectiles||[];
      var windIndex=0,oilIndex=0;
      for(var pi=0;pi<projectiles.length;pi++){
        var projectile=projectiles[pi],oil=projectile.kind==='oil',visual=oil?oilProjectiles[oilIndex++]:windProjectiles[windIndex++];
        if(!visual)continue;var root=oil?visual:visual.root;root.visible=true;root.position.set(projectile.x,projectile.y||.9,projectile.z);root.rotation.set(0,Math.atan2(projectile.dx||0,projectile.dz||1),0);
        if(!oil)visual.parts.forEach(function(part,j){part.rotation.z=(reducedMotion?0:clock*(9+j*2))+j;});
      }
      for(var hideWind=windIndex;hideWind<windProjectiles.length;hideWind++)windProjectiles[hideWind].root.visible=false;
      for(var hideOil=oilIndex;hideOil<oilProjectiles.length;hideOil++)oilProjectiles[hideOil].visible=false;
    }
    // Allocate the optional bloom chain only in HQ. RGBA8 is renderable in
    // core WebGL; WebGL2 alone does not guarantee a float/MSAA framebuffer.
    var renderTarget=null,bloomA=null,bloomB=null;
    var postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    var postVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    var blurShader=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:null},step:{value:new T.Vector2()},threshold:{value:1}},vertexShader:postVertex,
      fragmentShader:'uniform sampler2D source;uniform vec2 step;uniform float threshold;varying vec2 vUv;vec3 sampleLight(vec2 p){vec3 c=texture2D(source,p).rgb;return threshold>0.0?max(c-vec3(.72),vec3(0.0))*2.0:c;}void main(){vec3 c=sampleLight(vUv)*.227027;c+=sampleLight(vUv+step*1.384615)*.316216;c+=sampleLight(vUv-step*1.384615)*.316216;c+=sampleLight(vUv+step*3.230769)*.070270;c+=sampleLight(vUv-step*3.230769)*.070270;gl_FragColor=vec4(c,1.0);}'});
    var finalShader=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:null},bloom:{value:null}},vertexShader:postVertex,
      fragmentShader:'uniform sampler2D source;uniform sampler2D bloom;varying vec2 vUv;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}void main(){vec3 c=texture2D(source,vUv).rgb+texture2D(bloom,vUv).rgb*.30;c=aces(c*1.10);c=pow(c,vec3(1.0/2.2));float vignette=1.0-smoothstep(.15,.80,length((vUv-.5)*vec2(1.0,.85)));c*=.79+.21*vignette;gl_FragColor=vec4(c,1.0);}'});
    var quad=new T.Mesh(new T.PlaneGeometry(2,2),blurShader);postScene.add(quad);
    var lowMaterialCache={};
    function lightweightMaterial(m) {
      // The fitted face blends in bind space on the dog's continuous skin.
      // Keep that shader in both tiers instead of replacing it with plain fur.
      if(m.userData&&m.userData.neonDogFace)return m;
      if(!m.isMeshStandardMaterial)return m;
      if(lowMaterialCache[m.uuid])return lowMaterialCache[m.uuid];
      var low=new T.MeshLambertMaterial({
        color:m.color,map:m.map,emissive:m.emissive,emissiveMap:m.emissiveMap,
        emissiveIntensity:m.emissiveIntensity*.72,transparent:m.transparent,
        opacity:m.opacity,side:m.side,forceSinglePass:m.forceSinglePass,depthWrite:m.depthWrite,alphaTest:m.alphaTest,
        vertexColors:m.vertexColors,flatShading:m.flatShading
      });
      lowMaterialCache[m.uuid]=low;return low;
    }
    function contextUnavailable() { return recovering || context.isContextLost(); }
    function releasePostProcessing(abandon) {
      // A lost context has already released its GPU objects. Forget those old
      // handles after restoration rather than trying to delete invalid handles.
      if(!abandon){
        renderer.setRenderTarget(null);
        [renderTarget,bloomA,bloomB].forEach(function(target){if(target)target.dispose();});
      }
      renderTarget=bloomA=bloomB=null;
      blurShader.uniforms.source.value=null;
      finalShader.uniforms.source.value=null;finalShader.uniforms.bloom.value=null;
    }
    function releaseShadows(abandon) {
      if(key.shadow.map){if(!abandon)key.shadow.map.dispose();key.shadow.map=null;}
      if(key.shadow.mapPass){if(!abandon)key.shadow.mapPass.dispose();key.shadow.mapPass=null;}
    }
    function ensurePostProcessing() {
      if(renderTarget || quality!=='high' || contextUnavailable())return;
      renderTarget=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false,generateMipmaps:false});
      bloomA=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
      bloomB=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false,generateMipmaps:false});
      // No multisampled offscreen framebuffer, including on WebGL2 drivers.
      renderTarget.samples=bloomA.samples=bloomB.samples=0;
      finalShader.uniforms.source.value=renderTarget.texture;
      finalShader.uniforms.bloom.value=bloomB.texture;
    }
    function resize() {
      width=Math.max(1,canvas.clientWidth||window.innerWidth);height=Math.max(1,canvas.clientHeight||window.innerHeight);
      camera.aspect=width/height;camera.updateProjectionMatrix();
      if(contextUnavailable())return;
      // Physical drawing pixels are bounded in both modes, also on 4K/HiDPI.
      // UI remains at native CSS resolution because it is not drawn in WebGL.
      var budget=quality==='high'?1800000:700000;
      var maxDimension=Math.min(2048,renderer.capabilities.maxTextureSize||2048);
      var ratio=Math.min(window.devicePixelRatio||1,quality==='high'?1.5:1,Math.sqrt(budget/(width*height)),maxDimension/width,maxDimension/height)*resolutionScale;
      // Updating DPR and size together avoids briefly reallocating the previous
      // (possibly much larger) CSS viewport at the new device-pixel ratio.
      renderer.setDrawingBufferSize(width,height,ratio);
      if(quality==='high'){
        ensurePostProcessing();
        renderTarget.setSize(Math.max(1,Math.floor(width*ratio)),Math.max(1,Math.floor(height*ratio)));
        bloomA.setSize(Math.max(1,Math.floor(width*ratio*.38)),Math.max(1,Math.floor(height*ratio*.38)));
        bloomB.setSize(Math.max(1,Math.floor(width*ratio*.38)),Math.max(1,Math.floor(height*ratio*.38)));
      }
    }
    function setResolutionScale(value) {
      var next=Number(value);
      if(!Number.isFinite(next))return resolutionScale;
      next=clamp(next,.65,1);
      if(next===resolutionScale)return resolutionScale;
      resolutionScale=next;
      // Resize only the drawing buffers; HQ lighting and bloom remain enabled.
      // During context recovery resize safely stores the scale without GL work.
      resize();
      return resolutionScale;
    }
    function setQuality(value) {
      if(contextUnavailable()){quality='low';return quality;}
      quality=value==='high'?'high':'low';renderer.shadowMap.enabled=quality==='high';
      if(quality==='low'){releasePostProcessing(false);releaseShadows(false);}
      scene.traverse(function(part) {
        if(!part.isMesh)return;
        if(!part.userData.originalMaterial)part.userData.originalMaterial=part.material;
        var original=part.userData.originalMaterial;
        part.material=quality==='low'?lightweightMaterial(original):original;
      });
      applyArenaLightIntensity();
      if(currentArena)currentArena.detail.visible=quality==='high';
      resize();
      return quality;
    }
    function applyArenaLightIntensity(){
      if(!currentArena)return;
      var p=currentArena.palette,blend=beachBlend||0,low=quality==='low';
      hemi.intensity=lerp(p.hemiIntensity,2.1,blend)*(low?1.35/2.05:1);
      key.intensity=lerp(p.keyIntensity,3.25,blend)*(low?1.75/3.25:1);
      cool.intensity=lerp(p.coolIntensity,1.5,blend)*(low?1.6/2.4:1);
      warm.visible=teal.visible=!low&&p.accentLights&&blend<.1;
    }
    function prepareContextRecovery() {
      // Deliberately CPU-only: this may run from webglcontextlost itself.
      recovering=true;quality='low';shake=0;
    }
    function restoreContext() {
      if(context.isContextLost())return false;
      // THREE registered its restoration listener when the renderer was created;
      // its new internal state is ready before the shell invokes this method.
      releasePostProcessing(true);releaseShadows(true);
      recovering=false;
      renderer.resetState();
      setQuality('low');
      return true;
    }
    function graphicsInfo() {
      return {quality:quality,resolutionScale:resolutionScale,recovering:recovering,contextLost:context.isContextLost(),
        pixelWidth:canvas.width,pixelHeight:canvas.height,postProcessing:!!renderTarget,
        postTargetType:renderTarget?'UnsignedByteType':null,samples:renderTarget?renderTarget.samples:0,
        shadowMapSize:key.shadow.mapSize.x,webglVersion:contextDetails.version,renderer:contextDetails.renderer,
        cachedArenas:Object.keys(arenas).length,cachedFighters:Object.keys(fighterCache[0]).length+Object.keys(fighterCache[1]).length,
        characters:fighters.map(function(f){return f.character;}),drawCalls:lastFrameInfo.calls,triangles:lastFrameInfo.triangles,
        sceneAndShadowDrawCalls:lastFrameInfo.sceneAndShadowCalls,postProcessDrawCalls:lastFrameInfo.postProcessCalls,
        geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,beachActive:beachBlend>.05};
    }
    // Camera-relative movement and an orbiting shoulder camera share one yaw.
    var combatFraming=0;
    // Yaw 0 looks along +Z, matching the simulation's fighter orientation.
    var orbit={yaw:PI/2+.45,pitch:.40,distance:8.2,locked:true,manualUntil:0,lockOffset:.45};
    var cameraInitialized=false,cameraPlayer=0,cameraRight=new T.Vector3(),lookGoal=new T.Vector3();
    var cameraState={distance:8.2,pitch:.40,obstructed:false},cameraCollisionCache={},emptyCameraVolumes=[];
    var fallbackFighters=[{x:-2,z:0,yaw:PI/2,hp:100},{x:2,z:0,yaw:-PI/2,hp:100}];
    function angleDelta(target,current){return T.MathUtils.euclideanModulo(target-current+PI,PI*2)-PI;}
    function cameraNumber(value){value=Number(value);return Number.isFinite(value)?value:0;}
    function rotateCamera(dx,dy){
      dx=cameraNumber(dx);dy=cameraNumber(dy);
      if(orbit.locked){var offset=clamp(orbit.lockOffset-dx,-1.1,1.1);dx=orbit.lockOffset-offset;orbit.lockOffset=offset;}
      orbit.yaw=angleDelta(orbit.yaw-dx,0);orbit.pitch=clamp(orbit.pitch+dy,.12,1.05);orbit.manualUntil=clock+.9;
    }
    function rotatePreview(delta){previewYaw+=cameraNumber(delta);}
    function zoomCamera(delta){orbit.distance=clamp(orbit.distance+cameraNumber(delta),5.2,15);}
    function setLockOn(value){orbit.locked=!!value;if(orbit.locked){orbit.manualUntil=0;orbit.lockOffset=.45;}}
    function cameraInfo(){return {yaw:orbit.yaw,pitch:orbit.pitch,distance:orbit.distance,locked:orbit.locked,localPlayer:cameraPlayer,effectiveDistance:cameraState.distance,obstructed:cameraState.obstructed};}
    function cameraInput(x,z){return {x:-Math.cos(orbit.yaw)*x-Math.sin(orbit.yaw)*z,z:Math.sin(orbit.yaw)*x-Math.cos(orbit.yaw)*z};}
    function localPlayerIndex(state){return state&&state.localPlayer===1?1:0;}
    function resetCamera(state){
      var fs=state&&state.fighters;
      cameraPlayer=localPlayerIndex(state);
      var p=fs&&fs[cameraPlayer],e=fs&&fs[1-cameraPlayer];
      orbit.yaw=p&&e?Math.atan2(e.x-p.x,e.z-p.z)+.45:(cameraPlayer===1?-PI/2:PI/2)+.45;
      orbit.pitch=.40;orbit.distance=8.2;orbit.manualUntil=0;cameraInitialized=false;
      orbit.lockOffset=.45;cameraState.distance=8.2;cameraState.pitch=.40;cameraState.obstructed=false;
    }
    function setReducedMotion(value){reducedMotion=!!value;if(reducedMotion)shake=0;}
    function cameraVolumes(){
      if(!currentArena||beachBlend>=.4)return emptyCameraVolumes;
      var source=currentArena.colliders||emptyCameraVolumes,b=currentArena.bounds||13.5,cached=cameraCollisionCache[arenaId];
      if(cached&&cached.source===source&&cached.bounds===b&&cached.count===source.length){
        // Keep live collider objects; replacement at the same index still
        // invalidates the cache without allocating a snapshot every frame.
        var same=true;for(var ci=0;ci<source.length;ci++)if(cached.volumes[ci]!==source[ci]){same=false;break;}
        if(same)return cached.volumes;
      }
      var volumes=source.slice();
      function cylinder(x,z,r,bottom,top){volumes.push({x:x,z:z,radius:r,bottom:bottom,top:top});}
      function block(x0,x1,z0,z1,bottom,top){volumes.push({minX:x0,maxX:x1,minZ:z0,maxZ:z1,bottom:bottom,top:top});}
      // Camera-only proxies for nearby authored scenery. Avoid thousands of
      // detailed mesh raycasts without changing the simulation's clear floor.
      if(arenaId==='island'){
        [[-17.5,-17.9],[-21,-13.8],[18.9,-16.5],[23,-11],[-21.2,4],[21,8.4]].forEach(function(p){cylinder(p[0],p[1],2.1,0,11);});
        block(-4.3,4.3,-29.6,-22.4,0,5.2);
      }else if(arenaId==='nightclub'){
        block(-13,13,-b-5.2,-b-1.7,0,2.8);
        block(-12,12,-b-9.9,-b-8.4,0,8.3);
        for(var side=-1;side<=1;side+=2){
          var x=side*(b+9);block(x-3.2,x+3.2,-11.3,7.3,0,5.4);
          for(var i=0;i<7;i++)cylinder(side*(b+3+i%2*1.5),-7.5+i*2.05,.7,0,2.8);
        }
        block(b+3.2,b+6.6,5,12.6,0,2.3);
      }else if(arenaId==='seaside'){
        [[-19.4,1.8,1.75],[-23.8,8.1,1.9],[-19.8,23,1.75],[8.5,24,1.65]].forEach(function(p){cylinder(p[0],p[1],p[2],0,2.75);});
      }else if(arenaId==='helipad'){
        block(-16.15,-14.65,-16,-14.7,0,1.3);cylinder(15.5,-15.5,.8,0,3.65);cylinder(-15.6,15.5,.5,0,3.5);
      }
      cameraCollisionCache[arenaId]={source:source,bounds:b,count:source.length,volumes:volumes};return volumes;
    }
    function cameraClearDistance(origin,yaw,pitch,distance,volumes){
      var nx=-Math.sin(yaw)*Math.cos(pitch),ny=Math.sin(pitch),nz=-Math.cos(yaw)*Math.cos(pitch);
      var closest=distance,radius=Math.max(.30,camera.near*Math.tan(camera.fov*PI/360)*Math.max(1,camera.aspect)+.12);
      for(var i=0;i<volumes.length;i++){
        var c=volumes[i],enter=0,leave=closest;
        // A finite-volume intersection catches the front edge of a roof even
        // when the boom is already above it at the collider's centre.
        var low=(c.bottom===undefined?0:c.bottom)-radius,high=(c.top===undefined?5:c.top)+radius;
        if(Math.abs(ny)<.00001){if(origin.y<low||origin.y>high)continue;}
        else{var yl=(low-origin.y)/ny,yh=(high-origin.y)/ny;enter=Math.max(enter,Math.min(yl,yh));leave=Math.min(leave,Math.max(yl,yh));}
        if(c.radius!==undefined){
          var ox=origin.x-c.x,oz=origin.z-c.z,a=nx*nx+nz*nz,r=c.radius+radius;
          var half=ox*nx+oz*nz,disc=half*half-a*(ox*ox+oz*oz-r*r);
          if(a<.00001){if(ox*ox+oz*oz>r*r)continue;}
          else{if(disc<0)continue;var root=Math.sqrt(disc);enter=Math.max(enter,(-half-root)/a);leave=Math.min(leave,(-half+root)/a);}
        }else{
          // The two slab tests use scalars because this runs for every boom
          // candidate; temporary axis arrays otherwise multiply with scenery.
          var minX=c.minX-radius,maxX=c.maxX+radius,minZ=c.minZ-radius,maxZ=c.maxZ+radius,first,last;
          if(Math.abs(nx)<.00001){if(origin.x<minX||origin.x>maxX)leave=-1;}
          else{first=(minX-origin.x)/nx;last=(maxX-origin.x)/nx;enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));}
          if(Math.abs(nz)<.00001){if(origin.z<minZ||origin.z>maxZ)leave=-1;}
          else{first=(minZ-origin.z)/nz;last=(maxZ-origin.z)/nz;enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));}
        }
        if(leave>=enter&&leave>0)closest=Math.min(closest,Math.max(.05,enter-.04));
      }
      return closest;
    }
    function cameraFitDistance(p,e,yaw,pitch,distance){
      var tanFov=Math.tan(camera.fov*PI/360),safeTop=height<520?.29:.68,safeBottom=.80,safeSide=.82;
      var sine=Math.sin(yaw),cosine=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
      for(var bodyIndex=0;bodyIndex<2;bodyIndex++){
        var body=bodyIndex===0?p:e,bodyHeight=body.character==='orelha'?2.16:3.45,bodyRadius=body.character==='titan'?.88:.65;
        for(var corner=0;corner<8;corner++){
          var bx=(body.x||0)+(corner&1?bodyRadius:-bodyRadius)-focus.x;
          var by=(body.y||0)+(corner&2?bodyHeight:.02)-focus.y;
          var bz=(body.z||0)+(corner&4?bodyRadius:-bodyRadius)-focus.z;
          var screenX=-cosine*bx+sine*bz,screenY=sine*sp*bx+cp*by+cosine*sp*bz;
          var depth=sine*cp*bx-sp*by+cosine*cp*bz;
          distance=Math.max(distance,Math.abs(screenX)/(tanFov*camera.aspect*safeSide)-depth,Math.abs(screenY)/(tanFov*(screenY>0?safeTop:safeBottom))-depth);
        }
      }
      return distance;
    }
    function updateCamera(dt,state,fs){
      dt=clamp(cameraNumber(dt),0,.05);
      var local=localPlayerIndex(state);
      if(local!==cameraPlayer)resetCamera(state);
      var p=fs[local]||fs[0],e=fs[1-local]||p,menu=state.phase==='menu',dx=(e.x||0)-(p.x||0),dz=(e.z||0)-(p.z||0),gap=Math.hypot(dx,dz);
      var yaw=orbit.yaw,pitch=orbit.pitch,dist=orbit.distance,tracking=!menu&&orbit.locked,alpha=1-Math.exp(-dt*(menu?6:14));
      if(menu){
        var previewDog=p.character==='orelha';
        yaw=-.65+(reducedMotion?0:Math.sin(clock*.1)*.035);pitch=previewDog?.16:.12;dist=previewDog?5.5:6.6;
        cameraRight.set(-Math.cos(yaw),0,Math.sin(yaw));
        // The selected fighter owns the stage. Keep the rival out of the preview
        // and reserve the left side for the roster without turning faces away.
        var shift=width>900?-dist*.31:width>650?-dist*.22:0;
        if(width<650){dist=previewDog?7.2:9.5;pitch=.11;}
        lookGoal.set((p.x||0)+cameraRight.x*shift,previewDog?1.12:1.63,(p.z||0)+cameraRight.z*shift);
      }else{
        if(tracking&&gap>.25){
          if(clock>orbit.manualUntil)orbit.lockOffset=lerp(orbit.lockOffset,.45,1-Math.exp(-dt*5));
          var wanted=Math.atan2(dx,dz)+orbit.lockOffset,turn=angleDelta(wanted,orbit.yaw);
          orbit.yaw=angleDelta(orbit.yaw+clamp(turn*(1-Math.exp(-dt*10)),-dt*6.5,dt*6.5),0);
        }
        yaw=orbit.yaw;cameraRight.set(-Math.cos(yaw),0,Math.sin(yaw));
        var separation=clamp((gap-7)/13,0,1);
        var bias=tracking?lerp(.27,.42,separation):.04;
        if(tracking)pitch=lerp(orbit.pitch,Math.min(orbit.pitch,.22),separation);
        var shortScreen=height<520;
        var bodyFocus=p.character==='orelha'?1.2:1.65;
        lookGoal.set((p.x||0)+dx*bias+cameraRight.x*.86,(shortScreen?2.6:bodyFocus)+(p.y||0)*.35+(tracking?(e.y||0)*.18:0),(p.z||0)+dz*bias+cameraRight.z*.86);
        var arenaLimit=currentArena&&currentArena.bounds||13.5;
        lookGoal.x=clamp(lookGoal.x,-arenaLimit,arenaLimit);lookGoal.z=clamp(lookGoal.z,-arenaLimit,arenaLimit);
        if(shortScreen)dist=Math.max(dist,9.6);
        // Pull back only enough to read wide separation, retaining a player-led camera.
        if(tracking)dist=Math.max(dist,Math.min(16,5.2+gap*.37));
        if(width<height)dist=Math.max(dist,11.2);
        dist+=combatFraming*.25;
      }
      focus.lerp(lookGoal,cameraInitialized?alpha:1);
      var volumes=menu?emptyCameraVolumes:cameraVolumes(),baseDistance=dist,fit=tracking?cameraFitDistance(p,e,yaw,pitch,dist):dist;
      var clear=cameraClearDistance(focus,yaw,pitch,fit,volumes),avoidPitch=pitch;
      if(tracking&&clear<fit-.01){
        // Raise the boom before squeezing a locked duel against scenery. This
        // preserves both bodies without an automatic sideways orbit reversal.
        for(var attempt=1;attempt<=6;attempt++){
          var candidatePitch=Math.min(1.18,pitch+attempt*.16),candidateFit=cameraFitDistance(p,e,yaw,candidatePitch,baseDistance);
          var candidateClear=cameraClearDistance(focus,yaw,candidatePitch,candidateFit,volumes);
          if(candidateClear/candidateFit>clear/fit){avoidPitch=candidatePitch;fit=candidateFit;clear=candidateClear;}
          if(candidateClear>=candidateFit-.01)break;
        }
      }
      // Obstacle avoidance wins immediately; settling down from it is gradual.
      cameraState.pitch=cameraInitialized&&cameraState.pitch>avoidPitch?lerp(cameraState.pitch,avoidPitch,1-Math.exp(-dt*6)):avoidPitch;
      pitch=cameraState.pitch;fit=tracking?cameraFitDistance(p,e,yaw,pitch,baseDistance):baseDistance;
      var wantedDistance=fit;
      if(cameraInitialized)wantedDistance=lerp(cameraState.distance,fit,1-Math.exp(-dt*8));
      if(tracking)wantedDistance=Math.max(wantedDistance,fit);
      dist=cameraClearDistance(focus,yaw,pitch,wantedDistance,volumes);
      cameraState.distance=dist;cameraState.obstructed=dist<wantedDistance-.01||avoidPitch>orbit.pitch+.02;
      var horizontal=Math.cos(pitch)*dist;
      camTarget.set(focus.x-Math.sin(yaw)*horizontal,focus.y+Math.sin(pitch)*dist,focus.z-Math.cos(yaw)*horizontal);
      // Smoothing Cartesian positions would cut through collision volumes and
      // make movement disagree with yaw. Smooth only the focus and boom length.
      camera.position.copy(camTarget);
      cameraInitialized=true;shake=Math.max(0,shake-dt*.7);
      if(shake>0&&!reducedMotion){
        camera.position.x+=(random()-.5)*shake;camera.position.y+=(random()-.5)*shake*.7;
        var sx=camera.position.x-focus.x,sy=camera.position.y-focus.y,sz=camera.position.z-focus.z,shakenDistance=Math.hypot(sx,sy,sz);
        var safeDistance=cameraClearDistance(focus,Math.atan2(-sx,-sz),Math.atan2(sy,Math.hypot(sx,sz)),shakenDistance,volumes);
        if(safeDistance<shakenDistance){camTarget.copy(camera.position).sub(focus);camera.position.copy(focus).addScaledVector(camTarget,safeDistance/shakenDistance);}
      }
      camera.lookAt(focus);
      targetMarker.visible=!menu&&orbit.locked&&(e.hp===undefined||e.hp>0);
      targetMarker.position.set(e.x||0,(e.character==='orelha'?2.20:3.37)+(e.y||0),e.z||0);targetMarker.material.opacity=.62;
      key.target.position.set((p.x||0)*.3,0,(p.z||0)*.3);
    }
    var cinematicPose=[{},{}],cinematicPosition=new T.Vector3(),cinematicTarget=new T.Vector3();
    function update(dt,state) {
      dt=Math.min(.05,Math.max(0,dt===undefined?.016:dt));clock+=dt;
      state=state||{};if(state.arena&&state.arena!==arenaId)setArena(state.arena);
      var fs=state.fighters||fallbackFighters;
      var intro=state.phase==='intro'&&window.FightSim.introKind(state)&&currentArena.cutscene?currentArena.cutscene(state.phaseTime||0,state,reducedMotion):null;
      for(var i=0;i<2;i++){
        // Only player zero is rendered in the roster. Defer the hidden rival's
        // selection and pose until the intro/fight makes that actor visible.
        if(state.phase==='menu'&&i===1){showFighter(fighters[i],false);continue;}
        var f=fs[i]||fs[0],selected=selectedFighter(i,f.character);
        if(fighters[i]!==selected){showFighter(fighters[i],false);fighters[i]=selected;}
        showFighter(selected,state.phase!=='menu'||i===0);
        if(intro&&intro.active){
          var landing=intro.fighters[i],visual=Object.assign(cinematicPose[i],f,landing);
          visual.action=landing.cinematic==='chase'?(landing.runSpeed>.01?'sprint':'idle'):landing.jumpT>0&&landing.jumpT<1?'jump':'idle';
          visual.actionTime=landing.cinematic==='chase'?state.phaseTime:landing.jumpT;visual.actionDuration=1;visual.vx=visual.vz=0;
          pose(selected,visual,dt,i,false,fs[1-i]);selected.root.rotation.y=landing.yaw;selected.ring.visible=false;
          if(landing.jumpT===0&&landing.y>0&&selected.character!=='orelha'){
            selected.stance.position.y=-.34;selected.torso.rotation.x=.22;
            selected.legs[0].hip.rotation.x=selected.legs[1].hip.rotation.x=-.6;selected.legs[0].knee.rotation.x=selected.legs[1].knee.rotation.x=1.05;
          }
          if(landing.y>.05)selected.shadow.material.opacity*=.35;
        }else pose(selected,f,dt,i,state.phase==='menu',fs[1-i]);
      }
      var framingGoal=state.phase==='fight'&&window.NeonFeedback?window.NeonFeedback.framing(fs,reducedMotion):0;
      combatFraming=lerp(combatFraming,framingGoal,1-Math.exp(-dt*5));
      impactZoom*=Math.exp(-dt*12);impactRoll*=Math.exp(-dt*16);
      if(reducedMotion||state.phase!=='fight'){impactZoom=impactRoll=0;combatFraming=0;}
      var wantedFov=clamp(55+combatFraming-impactZoom,52,61);
      if(Math.abs(camera.fov-wantedFov)>.005){camera.fov=wantedFov;camera.updateProjectionMatrix();}
      updateCamera(dt,state,fs);
      if(!reducedMotion&&state.phase==='fight')camera.rotateZ(impactRoll);
      if(intro&&intro.active){
        var dissolve=clamp(((state.phaseTime||0)-5.05)/1.15,0,1),weight=Number.isFinite(intro.cameraWeight)?intro.cameraWeight:1-dissolve*dissolve*(3-2*dissolve);
        cinematicPosition.fromArray(intro.cameraPosition);cinematicTarget.fromArray(intro.cameraTarget);
        camera.position.lerp(cinematicPosition,weight);focus.lerp(cinematicTarget,weight);camera.lookAt(focus);targetMarker.visible=false;
      }
      portraitFill.visible=state.phase==='menu';
      if(portraitFill.visible){portraitFill.position.copy(camera.position);portraitFill.position.y+=1.8;portraitFill.target.position.set(fs[0].x||0,1.8,fs[0].z||0);}
      if(currentArena){
        for(var ai=0;!reducedMotion&&ai<currentArena.animated.length;ai++){
          var a=currentArena.animated[ai];
          if(a.type==='spin')a.mesh.rotation.y+=dt*a.rate;
          if(a.type==='cosmic'){a.mesh.rotation.z+=dt*a.rate;a.mesh.rotation.y=Math.sin(clock*a.rate)*.28;}
          if(a.type==='float'||a.type==='shard'){a.mesh.position.y=a.base+Math.sin(clock*.55+a.phase)*.55;if(a.type==='shard')a.mesh.rotation.y+=dt*a.rate;}
        }
        currentArena.detail.visible=quality==='high';
        if(currentArena.update)currentArena.update(clock,dt,reducedMotion,state);
      }
      skyUniforms.time.value=reducedMotion?0:clock;
      updateBeach(dt,state,fs);
      var sparksChanged=false;
      for(var k=0;k<sparks.length;k++) {
        var s=sparks[k];if(s.life<=0)continue;
        s.life=Math.max(0,s.life-dt);
        if(s.life>0){s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.vy-=12*dt;temp.position.set(s.x,s.y,s.z);temp.rotation.set(clock*9+k,clock*6,0);var sz=s.size*s.life/s.max;temp.scale.set(sz,sz*3.5,sz);}else temp.scale.set(0,0,0);
        temp.updateMatrix();sparksMesh.setMatrixAt(k,temp.matrix);sparksChanged=true;
      }
      if(sparksChanged)sparksMesh.instanceMatrix.needsUpdate=true;
      for(var w=0;w<waves.length;w++) {
        var wave=waves[w];if(wave.life<=0)continue;wave.life=Math.max(0,wave.life-dt);
        wave.mesh.visible=wave.life>0;var progress=1-wave.life/wave.max;wave.mesh.scale.setScalar(.13+progress*(wave.radius||1.35));wave.mesh.material.opacity=(1-progress)*.72;
      }
    }
    function render() {
      if(contextUnavailable())return;
      if(quality==='high'&&!renderTarget)resize();
      // r160 resets info after shadow rendering and on every render() by default.
      // Count the complete displayed frame, including shadows and the three post
      // passes, with exactly one reset. Reapplying this also covers restoration.
      renderer.info.autoReset=false;renderer.info.reset();
      renderer.toneMapping=quality==='low'?T.ACESFilmicToneMapping:T.NoToneMapping;
      renderer.setRenderTarget(quality==='low'?null:renderTarget);renderer.render(scene,camera);
      lastFrameInfo.sceneAndShadowCalls=renderer.info.render.calls;
      if(quality==='high'){
        quad.material=blurShader;blurShader.uniforms.source.value=renderTarget.texture;blurShader.uniforms.threshold.value=1;blurShader.uniforms.step.value.set(1.1/bloomA.width,0);
        renderer.setRenderTarget(bloomA);renderer.render(postScene,postCamera);
        blurShader.uniforms.source.value=bloomA.texture;blurShader.uniforms.threshold.value=0;blurShader.uniforms.step.value.set(0,1.1/bloomB.height);
        renderer.setRenderTarget(bloomB);renderer.render(postScene,postCamera);
        quad.material=finalShader;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
      }
      lastFrameInfo.calls=renderer.info.render.calls;lastFrameInfo.triangles=renderer.info.render.triangles;
      lastFrameInfo.postProcessCalls=lastFrameInfo.calls-lastFrameInfo.sceneAndShadowCalls;
    }
    setArena(options.arena||'island');camera.position.set(-8,5,0);camera.lookAt(focus);setQuality(quality);
    window.addEventListener('resize',resize);
    return {update:update,render:render,resize:resize,impact:impact,effect:effect,setQuality:setQuality,setResolutionScale:setResolutionScale,prepareContextRecovery:prepareContextRecovery,restoreContext:restoreContext,graphicsInfo:graphicsInfo,setArena:setArena,setReducedMotion:setReducedMotion,rotateCamera:rotateCamera,rotatePreview:rotatePreview,zoomCamera:zoomCamera,resetCamera:resetCamera,setLockOn:setLockOn,cameraInput:cameraInput,cameraInfo:cameraInfo,renderer:renderer,scene:scene,camera:camera};
  }
  window.NeonScene={create:create};
}());
