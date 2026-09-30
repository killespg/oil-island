/* NEON CLASH — procedural WebGL arena, no remote assets. */
(function () {
  'use strict';
  var T = window.THREE;
  if (!T) throw new Error('O motor 3D não foi carregado.');
  var PI = Math.PI;
  var clamp = T.MathUtils.clamp;
  var lerp = T.MathUtils.lerp;

  function create(canvas, options) {
    options = options || {};
    var quality = options.quality || 'high';
    // High quality has MSAA in its render target. Keeping the backbuffer simple
    // avoids compulsory multisampling on the lightweight GPU path.
    var renderer = new T.WebGLRenderer({canvas: canvas, antialias: false, alpha: false, powerPreference: 'high-performance'});
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    var scene = new T.Scene();
    scene.background = new T.Color(0x101322);
    scene.fog = new T.FogExp2(0x17192c, .022);
    var camera = new T.PerspectiveCamera(42, 1, .15, 180);
    var clock = 0, shake = 0, width = 1, height = 1;
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
      var buckets={};
      function visit(m) {
        if(!m.isMesh||m.isInstancedMesh||m.material.isShaderMaterial||Array.isArray(m.material))return;
        var key=m.material.uuid+'_'+m.castShadow+'_'+m.receiveShadow;
        (buckets[key]||(buckets[key]=[])).push(m);
      }
      if(recursive)parent.traverse(visit);else parent.children.forEach(visit);
      Object.keys(buckets).forEach(function(key) {
        var parts=buckets[key];if(parts.length<2)return;
        var geometries=[],count=0;
        parts.forEach(function(part) {
          part.updateMatrix();var g=part.geometry.clone();g.applyMatrix4(recursive?part.matrixWorld:part.matrix);
          if(g.index){var indexed=g;g=g.toNonIndexed();indexed.dispose();}
          geometries.push(g);count+=g.attributes.position.count;
        });
        var positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2),offset=0;
        geometries.forEach(function(g) {
          positions.set(g.attributes.position.array,offset*3);
          if(g.attributes.normal)normals.set(g.attributes.normal.array,offset*3);
          if(g.attributes.uv)uvs.set(g.attributes.uv.array,offset*2);
          offset+=g.attributes.position.count;g.dispose();
        });
        var combined=new T.BufferGeometry();combined.setAttribute('position',new T.BufferAttribute(positions,3));combined.setAttribute('normal',new T.BufferAttribute(normals,3));combined.setAttribute('uv',new T.BufferAttribute(uvs,2));combined.computeBoundingSphere();
        var merged=new T.Mesh(combined,parts[0].material);merged.castShadow=parts[0].castShadow;merged.receiveShadow=parts[0].receiveShadow;
        parts.forEach(function(part){part.parent.remove(part);});parent.add(merged);
      });
    }

    // A warm horizon behind the cold, densely layered city.
    var sky = new T.Mesh(new T.SphereGeometry(130,32,24),new T.ShaderMaterial({
      side:T.BackSide,depthWrite:false,
      vertexShader:'varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec3 vPosition;void main(){float h=normalize(vPosition).y;vec3 c=mix(vec3(.008,.013,.025),vec3(.004,.009,.022),smoothstep(-.15,.55,h));c+=vec3(.115,.025,.018)*exp(-pow((h-.06)*10.0,2.0));gl_FragColor=vec4(c,1.0);}'
    })); scene.add(sky);
    var moonMat=new T.MeshBasicMaterial({color:0xffaa76,transparent:true,opacity:.86,fog:false});
    var moon=mesh(new T.CircleGeometry(3.7,64),moonMat,scene,-12,8.0,-35,1,1,1);
    glow(scene,0xff795a,-12,8.0,-35,20,.24);
    var moonBands=new T.Group();scene.add(moonBands);
    var moonBandMat=new T.MeshBasicMaterial({color:0x643745,fog:false,transparent:true,opacity:.65});
    for(var mi=0;mi<4;mi++) box(moonBands,moonBandMat,-12,5.35+mi*.48,-34.96,6.1+mi*.37,.05+mi*.015,.012);

    var hemi=new T.HemisphereLight(0x9cbed4,0x111023,2.05); scene.add(hemi);
    var key=new T.DirectionalLight(0xffddc2,3.25); key.position.set(-4,11,5); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-11;key.shadow.camera.right=11;
    key.shadow.camera.top=9;key.shadow.camera.bottom=-8;key.shadow.camera.near=.5;key.shadow.camera.far=35;
    key.shadow.bias=-.00025;key.shadow.normalBias=.03;key.shadow.radius=3;scene.add(key);
    var cool=new T.DirectionalLight(0x40bddf,2.4);cool.position.set(7,6,-8);scene.add(cool);
    var warm=new T.PointLight(0xff6745,40,22,2);warm.position.set(-7,4,-4);scene.add(warm);
    var teal=new T.PointLight(0x46d6ee,28,20,2);teal.position.set(6,4,3);scene.add(teal);

    var towerGeo = new T.BoxGeometry(1,1,1);
    var towers = new T.InstancedMesh(towerGeo,material(0x172638,.25,.8),72);
    scene.add(towers);
    var winGeo=new T.PlaneGeometry(1,1);
    var windows=new T.InstancedMesh(winGeo,new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.62}),1800);
    scene.add(windows);
    var towerColor=new T.Color(), winColor=new T.Color();var windowCount=0;
    var windowPalette=[0x5b99ba,0x527791,0xb28376,0x739a94,0x989392];
    for(var bi=0;bi<72;bi++) {
      var tx=-49+(bi%24)*4.3+(random()-.5)*2.8;
      var tz=-14-Math.floor(bi/24)*12-random()*6;
      var th=3.5+random()*16, tw=1.7+random()*2.5, td=2+random()*3;
      temp.position.set(tx,(th-42.5)/2,tz);temp.rotation.set(0,0,0);temp.scale.set(tw,th+37.5,td);temp.updateMatrix();towers.setMatrixAt(bi,temp.matrix);
      towerColor.setHex(bi%3===0?0x273344:bi%3===1?0x1a2335:0x222a3d);towers.setColorAt(bi,towerColor);
      for(var wy=-1.5;wy<th-3.1;wy+=.53) {
        for(var wx=-tw/2+.25;wx<tw/2-.1;wx+=.43) {
          if(random()>.37 || windowCount>=1800) continue;
          temp.position.set(tx+wx,wy,tz+td/2+.012);temp.scale.set(.105+random()*.12,.19,1);temp.updateMatrix();windows.setMatrixAt(windowCount,temp.matrix);
          winColor.setHex(windowPalette[Math.floor(random()*windowPalette.length)]);windows.setColorAt(windowCount,winColor);windowCount++;
        }
      }
      if(bi%5===0) {
        var lineMat=new T.MeshBasicMaterial({color:bi%2?0x316b87:0x935060});
        box(scene,lineMat,tx-tw/2+.07,th/2-2.5,tz+td/2+.025,.035,th,.03);
        box(scene,material(0x29394b,.5,.5),tx,th-2.2,tz,.08,1.4,.08);
        glow(scene,bi%2?0x23ccea:0xff6854,tx,th-1.4,tz,.8,.55);
      }
    }
    windows.count=windowCount;
    towers.instanceMatrix.needsUpdate=true;windows.instanceMatrix.needsUpdate=true;
    var foregroundMat=material(0x152233,.5,.62);
    box(scene,foregroundMat,-12,-1.7,-7.8,4.8,4.8,6);
    box(scene,foregroundMat,12.5,-1.3,-10,6,5.8,5);
    var ventMat=material(0x324257,.6,.44);
    for(var v=0;v<4;v++) {
      var vent=box(scene,ventMat,-13+v*.63,.85,-7.2,.45,.8,1.2);vent.rotation.z=.08;
      for(var j=0;j<4;j++)box(scene,foregroundMat,-13+v*.63,.8+j*.12,-6.58,.4,.035,.025);
    }

    // Suspended octagonal deck and its light channels.
    var arena=new T.Group();scene.add(arena);
    var foundation=material(0x101a29,.55,.6);
    box(scene,foundation,0,-10.75,0,15.05,20.0,7.8);
    for(var support=-6;support<=6;support+=3) {
      box(scene,material(0x263547,.65,.42),support,-6,3.94,.16,11,.19);
      box(scene,new T.MeshBasicMaterial({color:0x244353}),support+.24,-5.5,3.953,.035,9,.012);
    }
    var stageMat=material(0x283543,.72,.4);
    var shape=new T.Shape();shape.moveTo(-7.4,-4.2);shape.lineTo(7.4,-4.2);shape.lineTo(8,-3.6);shape.lineTo(8,3.6);shape.lineTo(7.4,4.2);shape.lineTo(-7.4,4.2);shape.lineTo(-8,3.6);shape.lineTo(-8,-3.6);shape.closePath();
    var deck=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.52,bevelEnabled:true,bevelThickness:.055,bevelSize:.05,bevelSegments:1,steps:1}),stageMat);
    deck.rotation.x=PI/2;deck.position.y=-.03;deck.receiveShadow=true;arena.add(deck);
    box(arena,material(0x111b29,.7,.35),0,-.57,0,15,.28,7.8);
    var trimCyan=neon(0x45b6c5,2.1),trimWarm=neon(0xfd7656,1.5),trimWhite=neon(0xa6daca,1.2);
    rod(arena,trimCyan,-7.4,-.22,4.23,7.4,-.22,4.23,.024);
    rod(arena,trimWarm,-7.4,-.20,-4.23,7.4,-.20,-4.23,.024);
    rod(arena,trimCyan,-8.03,-.22,-3.6,-8.03,-.22,3.6,.024);
    rod(arena,trimCyan,8.03,-.22,-3.6,8.03,-.22,3.6,.024);
    for(var side=-1;side<=1;side+=2) {
      for(var ee=-1;ee<=1;ee+=2) rod(arena,trimCyan,side*7.4,-.22,ee*4.23,side*8.03,-.22,ee*3.6,.024);
    }
    for(var gi=0;gi<16;gi++) {
      box(arena,material(0x101b2a,.7,.4),-6.8+gi*.9,-.35,4.265,.54,.15,.09);
      box(arena,gi%3?trimWhite:trimWarm,-6.8+gi*.9,-.345,4.32,.3,.025,.02);
    }
    var floorTexture=texture(2048,1024,function(ctx,w,h) {
      ctx.fillStyle='#253342';ctx.fillRect(0,0,w,h);
      var g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(17,32,48,.1)');g.addColorStop(1,'rgba(11,16,27,.45)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.lineWidth=2;ctx.strokeStyle='rgba(108,143,162,.12)';
      for(var x=0;x<w;x+=128){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
      for(var y=0;y<h;y+=128){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      ctx.strokeStyle='rgba(160,190,191,.36)';ctx.lineWidth=4;ctx.strokeRect(62,65,w-124,h-130);
      ctx.strokeStyle='rgba(149,186,182,.18)';ctx.lineWidth=2;ctx.strokeRect(80,83,w-160,h-166);
      ctx.save();ctx.translate(w/2,h/2);ctx.strokeStyle='rgba(159,191,187,.27)';
      ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,270,0,PI*2);ctx.stroke();
      ctx.lineWidth=2;ctx.setLineDash([8,16]);ctx.beginPath();ctx.arc(0,0,290,0,PI*2);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(0,0,222,0,PI*2);ctx.stroke();
      ctx.rotate(-.15);ctx.fillStyle='rgba(145,177,174,.33)';ctx.font='900 108px Arial';ctx.textAlign='center';ctx.fillText('NC',0,26);
      ctx.font='bold 19px Arial';ctx.fillStyle='rgba(156,186,186,.4)';ctx.fillText('NEON CLASH  /  UNDERGROUND',0,78);ctx.restore();
      ctx.fillStyle='rgba(118,158,178,.4)';ctx.font='600 26px monospace';ctx.fillText('SECTOR 07',108,122);
      ctx.textAlign='right';ctx.fillText('NIGHT DIVISION',w-108,h-97);
      for(var t=0;t<13;t++){ctx.fillStyle=t%2?'rgba(157,181,108,.2)':'rgba(11,18,30,.3)';ctx.fillRect(107+t*35,h-142,23,46);}
      ctx.textAlign='left';ctx.font='bold 110px Arial';ctx.fillStyle='rgba(86,181,195,.2)';ctx.fillText('01',138,h/2+40);
      ctx.fillStyle='rgba(241,121,89,.18)';ctx.fillText('02',w-283,h/2+40);
      for(var n=0;n<2100;n++){ctx.fillStyle='rgba(205,215,208,'+(random()*.045)+')';ctx.fillRect(random()*w,random()*h,random()*7+1,1);}
    });
    var floorMat=new T.MeshStandardMaterial({map:floorTexture,color:0xc3cfdd,metalness:.38,roughness:.48});
    var floor=mesh(new T.PlaneGeometry(15.35,7.9),floorMat,arena,0,.033,0);floor.rotation.x=-PI/2;floor.receiveShadow=true;
    // Inset luminous corner ticks stay beneath the fighters.
    for(var ci=-1;ci<=1;ci+=2) for(var cj=-1;cj<=1;cj+=2) {
      box(arena,ci<0?trimCyan:trimWarm,ci*6.6,.052,cj*3.22,1.03,.017,.035);
      box(arena,ci<0?trimCyan:trimWarm,ci*7.10,.052,cj*2.90,.035,.017,.68);
    }

    var metal=material(0x394657,.8,.34),darkMetal=material(0x132031,.5,.52);
    for(var p=-1;p<=1;p+=2) {
      for(var q=-1;q<=1;q+=2) {
        var px=p*7.48,pz=q*3.72;
        box(arena,darkMetal,px,.61,pz,.35,1.25,.35,true);
        box(arena,metal,px,1.26,pz,.46,.17,.46,true);
        box(arena,p<0?trimCyan:trimWarm,px,.78,pz+.19,.075,.81,.025);
        box(arena,p<0?trimCyan:trimWarm,px,1.36,pz,.32,.033,.32);
        glow(arena,p<0?0x4ce4ee:0xff795a,px,1.36,pz,1.6,.28);
      }
      // Rear rail only: the foreground stays open for readability.
      rod(arena,metal,-7.4,p===-1?.65:1.12,-3.75,7.4,p===-1?.65:1.12,-3.75,.037);
    }
    for(var post=-6;post<=6;post+=3)rod(arena,darkMetal,post,0,-3.75,post,1.12,-3.75,.04);
    rod(arena,trimWarm,-7.25,1.10,-3.73,7.25,1.10,-3.73,.014);

    function billboard(label,subtitle,x,y,z,w,h,color) {
      var group=new T.Group();group.position.set(x,y,z);scene.add(group);
      box(group,metal,0,0,-.10,w+.14,h+.14,.18,true);
      var tex=texture(1024,384,function(ctx,cw,ch) {
        ctx.fillStyle='#111b28';ctx.fillRect(0,0,cw,ch);
        ctx.strokeStyle=color;ctx.lineWidth=8;ctx.strokeRect(22,22,cw-44,ch-44);
        ctx.fillStyle=color;ctx.textAlign='center';ctx.font='900 125px Arial';ctx.fillText(label,cw/2,210);
        ctx.font='bold 24px monospace';ctx.fillStyle='#94b5c5';ctx.fillText(subtitle,cw/2,275);
        for(var a=0;a<ch;a+=5){ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,a,cw,1);}
      });
      var m=new T.MeshBasicMaterial({map:tex,color:0xffffff});mesh(new T.PlaneGeometry(w,h),m,group,0,0,.002);
      rod(group,metal,-w*.32,-h/2,0,-w*.32,-h/2-1.15,0,.055);
      rod(group,metal,w*.32,-h/2,0,w*.32,-h/2-1.15,0,.055);
      glow(group,color,0,0,-.1,w*1.35,.11);return group;
    }
    var sign1=billboard('NIGHT / SHIFT','AFTER HOURS FIGHT CLUB',-5.3,2.85,-6.15,4.0,1.45,'#b5dcb2');sign1.rotation.y=.07;
    var sign2=billboard('NEO 東京','TOKYO  •  ROOFTOP 07',6.7,3.7,-8.4,3.3,1.23,'#ff8970');sign2.rotation.y=-.12;
    box(scene,metal,9.3,2.5,-6.7,.10,5,.1);
    box(scene,metal,9.3,4.93,-6.15,.12,.1,1.2);
    mesh(new T.CylinderGeometry(.22,.3,.25,10),metal,scene,9.3,4.83,-5.55);
    mesh(new T.CircleGeometry(.18,16),trimWhite,scene,9.3,4.70,-5.55).rotation.x=PI/2;
    var airPositions=new Float32Array(180*3);
    for(var ai=0;ai<180;ai++){airPositions[ai*3]=(random()-.5)*43;airPositions[ai*3+1]=random()*17;airPositions[ai*3+2]=-12+random()*20;}
    var airGeo=new T.BufferGeometry();airGeo.setAttribute('position',new T.BufferAttribute(airPositions,3));
    var air=new T.Points(airGeo,new T.PointsMaterial({color:0xb7d1d5,size:.022,transparent:true,opacity:.3,depthWrite:false}));scene.add(air);
    batchMeshes(scene,true);

    // The suits are built around real shoulder / elbow / hip / knee pivots.
    var shadowTex=texture(128,128,function(ctx,w,h){var g=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);g.addColorStop(0,'rgba(0,0,0,.57)');g.addColorStop(.45,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    function fighter(index) {
      var enemy=index===1,color=enemy?0xff795b:0x60e2f5;
      var armor=material(enemy?0xa36054:0x7299ae,.6,.37);
      var bright=material(enemy?0xce816b:0xa6c4cf,.56,.33);
      var dark=material(enemy?0x352a31:0x203044,.5,.5);
      var suit=material(0x101923,.25,.67);
      var accent=neon(color,3.15);
      var visor=new T.MeshBasicMaterial({color:color});
      var root=new T.Group();root.scale.setScalar(1.08);scene.add(root);
      var stance=new T.Group();root.add(stance);
      var torso=new T.Group();torso.position.y=1.34;stance.add(torso);
      // Pelvis and segmented abdomen.
      mesh(new T.CylinderGeometry(.3,.34,.24,6),dark,torso,0,.06,0,1,1,.72,true);
      box(torso,armor,0,.04,.215,.47,.16,.10,true);
      box(torso,accent,0,.07,.275,.13,.033,.018);
      for(var ab=0;ab<3;ab++)box(torso,ab===2?armor:dark,0,.23+ab*.105,.075,.51-ab*.04,.086,.33,true);
      // Broad, faceted breastplate.
      var chest=mesh(new T.CylinderGeometry(.46,.32,.69,6),armor,torso,0,.66,0,1,1,.62,true);chest.rotation.y=PI/6;
      var plateL=box(torso,bright,-.19,.72,.246,.32,.34,.085,true);plateL.rotation.z=-.13;
      var plateR=box(torso,bright,.19,.72,.246,.32,.34,.085,true);plateR.rotation.z=.13;
      var trimL=box(torso,accent,-.2,.86,.295,.32,.026,.019);trimL.rotation.z=-.14;
      var trimR=box(torso,accent,.2,.86,.295,.32,.026,.019);trimR.rotation.z=.14;
      var reactor=mesh(new T.CylinderGeometry(.078,.078,.027,12),accent,torso,0,.66,.292);reactor.rotation.x=PI/2;
      box(torso,dark,0,.64,-.27,.44,.48,.13,true);
      box(torso,accent,0,.66,-.345,.038,.3,.017);
      mesh(cylinderGeo,suit,torso,0,1.02,0,.125,.18,.125,true);
      // A helmet with a recessed luminous visor and a sculpted jaw.
      var head=new T.Group();head.position.set(0,1.22,.015);torso.add(head);
      var helmet=mesh(new T.CylinderGeometry(.235,.27,.42,8),bright,head,0,.025,0,1,1,.86,true);helmet.rotation.y=PI/8;
      box(head,dark,0,.047,.218,.39,.15,.055,true);
      box(head,visor,0,.069,.250,.33,.047,.025);
      glow(head,color,0,.065,.26,.52,.21);
      box(head,armor,0,-.094,.229,.25,.11,.08,true);
      box(head,dark,0,-.11,.277,.11,.049,.021);
      var leftJaw=box(head,armor,-.2,-.045,.11,.087,.25,.21,true);leftJaw.rotation.z=-.1;
      var rightJaw=box(head,armor,.2,-.045,.11,.087,.25,.21,true);rightJaw.rotation.z=.1;
      box(head,dark,0,.24,-.036,.13,.045,.25,true);
      box(head,accent,0,.265,-.028,.045,.014,.22);
      if(enemy) {
        for(var horn=-1;horn<=1;horn+=2){var spike=mesh(new T.ConeGeometry(.075,.28,4),armor,head,horn*.23,.29,-.055,1,1,1,true);spike.rotation.z=-horn*.36;}
      } else {
        box(head,accent,-.273,.067,-.021,.025,.13,.07);
        box(head,accent,.273,.067,-.021,.025,.13,.07);
      }
      var arms=[];
      for(var as=-1;as<=1;as+=2) {
        var shoulder=new T.Group();shoulder.position.set(as*.48,.82,0);torso.add(shoulder);
        mesh(sphereGeo,suit,shoulder,0,-.045,0,.18,.18,.18,true);
        var cap=mesh(new T.CylinderGeometry(.22,.195,.25,6),armor,shoulder,as*.018,-.03,0,1,1,.92,true);cap.rotation.z=as*.2;
        box(shoulder,accent,as*.179,-.06,.025,.032,.14,.22);
        mesh(cylinderGeo,dark,shoulder,0,-.3,0,.134,.38,.132,true);
        box(shoulder,armor,0,-.28,.12,.17,.3,.061,true);
        var elbow=new T.Group();elbow.position.y=-.55;shoulder.add(elbow);
        mesh(sphereGeo,suit,elbow,0,0,0,.116,.119,.116,true);
        mesh(new T.CylinderGeometry(.17,.205,.40,6),armor,elbow,0,-.25,0,1,1,.84,true);
        box(elbow,bright,0,-.25,.139,.20,.31,.047,true);
        box(elbow,accent,as*.12,-.29,.125,.038,.23,.037);
        mesh(cylinderGeo,dark,elbow,0,-.49,0,.14,.085,.12,true);
        var fist=new T.Group();fist.position.y=-.57;elbow.add(fist);
        box(fist,bright,0,0,.02,.25,.2,.23,true);
        box(fist,dark,0,-.09,.055,.25,.06,.20,true);
        for(var kn=0;kn<3;kn++)box(fist,accent,-.078+kn*.078,-.012,.148,.043,.07,.018);
        var aura=glow(fist,color,0,0,0,.85,0);aura.visible=false;
        arms.push({shoulder:shoulder,elbow:elbow,fist:fist,aura:aura});
      }
      var legs=[];
      for(var ls=-1;ls<=1;ls+=2) {
        var hip=new T.Group();hip.position.set(ls*.235,1.36,ls*.10);stance.add(hip);
        mesh(sphereGeo,suit,hip,0,-.02,0,.16,.18,.16,true);
        mesh(new T.CylinderGeometry(.193,.151,.52,6),armor,hip,0,-.30,0,1,1,.88,true);
        box(hip,bright,0,-.27,.158,.23,.38,.065,true);
        box(hip,accent,ls*.145,-.26,.13,.035,.29,.02);
        var knee=new T.Group();knee.position.y=-.65;hip.add(knee);
        mesh(sphereGeo,suit,knee,0,0,0,.13,.13,.13,true);
        mesh(new T.CylinderGeometry(.161,.115,.48,6),dark,knee,0,-.27,0,1,1,.96,true);
        box(knee,armor,0,-.21,.13,.235,.39,.09,true);
        var kneecap=mesh(new T.SphereGeometry(.15,4,3),bright,knee,0,.006,.133,1,.92,.51,true);
        box(knee,accent,0,-.1,.18,.032,.19,.02);
        var boot=new T.Group();boot.position.set(0,-.59,.08);knee.add(boot);
        box(boot,dark,0,.035,.03,.26,.22,.43,true);
        box(boot,armor,0,.072,.135,.27,.12,.25,true);
        box(boot,suit,0,-.075,.047,.28,.055,.48,true);
        box(boot,accent,0,-.029,.283,.19,.022,.019);
        legs.push({hip:hip,knee:knee,boot:boot});
      }
      var beltTag=box(torso,enemy?armor:dark,.22,-.11,.09,.18,.38,.075,true);beltTag.rotation.z=-.15;
      box(torso,accent,.22,-.19,.135,.10,.025,.02);
      var shadow=mesh(new T.PlaneGeometry(2.25,1.8),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,opacity:.9}),scene,0,.059,0);shadow.rotation.x=-PI/2;
      var ring=mesh(new T.RingGeometry(.67,.687,64),new T.MeshBasicMaterial({color:color,transparent:true,opacity:.48,side:T.DoubleSide,depthWrite:false}),scene,0,.06,0);ring.rotation.x=-PI/2;
      var auraRing=mesh(new T.TorusGeometry(.64,.016,6,48),accent,root,0,1.45,0);auraRing.rotation.x=PI/2;auraRing.visible=false;
      var pivots=[];root.traverse(function(part){if(part.isGroup)pivots.push(part);});
      pivots.forEach(function(pivot){batchMeshes(pivot,false);});
      return {root:root,stance:stance,torso:torso,head:head,arms:arms,legs:legs,shadow:shadow,ring:ring,auraRing:auraRing,accent:accent,color:color,phase:index*1.8};
    }
    var fighters=[fighter(0),fighter(1)];

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
    function impact(x,z,color,power) {
      power=power||1;sparkColor.set(color||0xc5ffff);shake=Math.max(shake,.10*Math.min(2.2,power));
      var count=Math.floor(15+power*10);
      for(var i=0;i<count;i++) {
        var s=sparks[sparkCursor];s.life=.22+random()*.3;s.max=s.life;s.x=x;s.y=1.4+random()*.45;s.z=z;
        s.vx=(random()-.5)*9*power;s.vy=(random()-.25)*7;s.vz=(random()-.5)*6;s.size=.028+random()*.034;
        sparksMesh.setColorAt(sparkCursor,sparkColor);sparkCursor=(sparkCursor+1)%sparks.length;
      }
      sparksMesh.instanceColor.needsUpdate=true;
      var wa=waves.find(function(w){return w.life<=0;})||waves[0];wa.life=wa.max;wa.mesh.visible=true;wa.mesh.position.set(x,1.52,z);wa.mesh.material.color.copy(sparkColor);wa.mesh.quaternion.copy(camera.quaternion);
    }

    function pose(rig,f,dt,index) {
      var elapsed=f.actionTime||0,duration=Math.max(.15,f.actionDuration||.5),t=clamp(elapsed/duration,0,1);
      var action=f.action||'idle',walking=action==='walk'||Math.abs(f.vx||0)+Math.abs(f.vz||0)>.12;
      var bob=Math.sin(clock*3+rig.phase)*.025,step=Math.sin(clock*10+rig.phase);
      var dead=action==='ko'||f.hp<=0;
      rig.root.position.set(f.x||0,(f.y||0)+bob+.032,f.z||0);
      var goal=(f.face|| (index===0?1:-1))===1?PI/2-.24:-PI/2+.24;
      var diff=T.MathUtils.euclideanModulo(goal-rig.root.rotation.y+PI,PI*2)-PI;
      rig.root.rotation.y+=diff*Math.min(1,dt*22);
      rig.stance.rotation.set(0,0,0);rig.stance.position.set(0,0,0);
      rig.torso.rotation.set(.075,Math.sin(clock*1.9+rig.phase)*.028,0);
      rig.head.rotation.set(-.05,0,0);
      var a0=rig.arms[0],a1=rig.arms[1],l0=rig.legs[0],l1=rig.legs[1];
      a0.shoulder.rotation.set(-.42,0,.13);a1.shoulder.rotation.set(-.18,0,-.22);
      a0.elbow.rotation.set(-1.45,0,0);a1.elbow.rotation.set(-1.5,0,0);
      a0.fist.rotation.set(.1,0,0);a1.fist.rotation.set(.1,0,0);
      l0.hip.rotation.set(-.22,0,.04);l1.hip.rotation.set(.18,0,-.10);
      l0.knee.rotation.set(.20,0,0);l1.knee.rotation.set(.21,0,0);
      l0.boot.rotation.x=-.02;l1.boot.rotation.x=-.20;
      a0.aura.visible=false;a1.aura.visible=false;rig.auraRing.visible=false;
      if(walking&&!dead) {
        rig.root.position.y+=Math.abs(step)*.045;
        l0.hip.rotation.x=-.15+step*.43;l1.hip.rotation.x=.1-step*.43;
        l0.knee.rotation.x=.16+Math.max(0,-step)*.45;l1.knee.rotation.x=.18+Math.max(0,step)*.45;
        l0.boot.rotation.x=-.08;l1.boot.rotation.x=-.08;
        rig.torso.rotation.z=step*.025;
      }
      var strike=Math.sin(PI*clamp((t-.1)/.72,0,1));
      strike=Math.pow(Math.max(0,strike),.65);
      if(action==='punch') {
        var lead=(f.combo||1)%2===0?a1:a0;
        lead.shoulder.rotation.x=-.38-strike*1.10;lead.shoulder.rotation.y=(lead===a0?1:-1)*strike*.12;
        lead.elbow.rotation.x=-1.45+strike*1.38;
        rig.torso.rotation.y=(lead===a0?-1:1)*strike*.29;
        rig.torso.rotation.x=.08+strike*.12;
        rig.stance.position.z=strike*.13;
      } else if(action==='kick') {
        l1.hip.rotation.x=.2-strike*1.82;l1.hip.rotation.z=-.12-strike*.15;
        l1.knee.rotation.x=.25+Math.sin(t*PI*2)*.9*(1-strike*.75);
        l1.boot.rotation.x=-.1;
        rig.torso.rotation.x=.04-strike*.24;
        rig.torso.rotation.y=-strike*.4;
        a1.shoulder.rotation.x=.1+strike*.9;a1.elbow.rotation.x=-1;
        rig.stance.position.y=strike*.08;
      } else if(action==='special') {
        var charge=t<.30?Math.sin(t/.30*PI/2):1;
        var blast=Math.sin(PI*clamp((t-.23)/.7,0,1));
        a0.shoulder.rotation.x=-.30-blast*1.25;a1.shoulder.rotation.x=-.30-blast*1.25;
        a0.shoulder.rotation.z=.2-blast*.18;a1.shoulder.rotation.z=-.2+blast*.18;
        a0.elbow.rotation.x=-1.7+blast*1.6;a1.elbow.rotation.x=-1.7+blast*1.6;
        rig.torso.rotation.x=.09+blast*.13;
        rig.auraRing.visible=true;rig.auraRing.scale.setScalar(1+charge*.2+Math.sin(clock*27)*.03);rig.auraRing.rotation.z=clock*4;
        a0.aura.visible=true;a1.aura.visible=true;a0.aura.material.opacity=.5*charge;a1.aura.material.opacity=.5*charge;
        a0.aura.scale.setScalar(1+charge);a1.aura.scale.setScalar(1+charge);
      } else if(action==='dodge') {
        var crouch=Math.sin(t*PI);
        rig.stance.position.y=-.42*crouch;rig.torso.rotation.x=.3;
        l0.hip.rotation.x=-.65*crouch;l1.hip.rotation.x=-.35*crouch;
        l0.knee.rotation.x=.95*crouch;l1.knee.rotation.x=.80*crouch;
        rig.stance.rotation.z=.14*crouch;
      } else if(action==='jump'||(f.y||0)>.1) {
        l0.hip.rotation.x=-.75;l0.knee.rotation.x=.94;l1.hip.rotation.x=.3;l1.knee.rotation.x=.70;
        a0.shoulder.rotation.x=-.72;a1.shoulder.rotation.x=-.32;
      } else if(action==='hurt') {
        var recoil=Math.sin(PI*Math.min(1,t*1.7));
        rig.torso.rotation.x=-.24*recoil;rig.head.rotation.x=-.18*recoil;
        a0.shoulder.rotation.x=-.2;a1.shoulder.rotation.x=.2;
        a0.elbow.rotation.x=-.85;a1.elbow.rotation.x=-.8;
        rig.stance.position.z=-.18*recoil;
      }
      if(f.blocking||action==='block') {
        a0.shoulder.rotation.set(-.73,-.12,.2);a1.shoulder.rotation.set(-.73,.12,-.2);
        a0.elbow.rotation.x=-1.55;a1.elbow.rotation.x=-1.55;
        a0.fist.rotation.z=-.18;a1.fist.rotation.z=.18;
        rig.torso.rotation.x=.13;rig.head.rotation.x=.11;
      }
      if(dead) {
        var fall=clamp(elapsed/.64,0,1);fall=1-Math.pow(1-fall,3);
        rig.stance.rotation.x=-fall*1.46;rig.stance.position.y=-fall*.02;
        rig.torso.rotation.x=-.10;
        a0.shoulder.rotation.set(.30,0,.75);a1.shoulder.rotation.set(.1,0,-.72);
        a0.elbow.rotation.x=-.3;a1.elbow.rotation.x=-.2;
        l0.hip.rotation.x=-.08;l1.hip.rotation.x=.08;l0.knee.rotation.x=.15;l1.knee.rotation.x=.3;
        rig.root.position.y=.16*fall+.035;
      }
      rig.shadow.position.x=f.x||0;rig.shadow.position.z=(f.z||0)+(dead?-.5:0);
      rig.shadow.material.opacity=.85/(1+(f.y||0)*.7);
      rig.shadow.scale.setScalar(1+(f.y||0)*.22);
      rig.ring.position.set(f.x||0,.063,f.z||0);rig.ring.material.opacity=dead?.1:.32+Math.sin(clock*2)*.07;
    }

    // A compact HDR bloom chain gives the practical lights a soft optical glow.
    var hdrType=renderer.capabilities.isWebGL2?T.HalfFloatType:T.UnsignedByteType;
    var renderTarget=new T.WebGLRenderTarget(1,1,{type:hdrType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true});
    renderTarget.samples=renderer.capabilities.isWebGL2?2:0;
    var bloomA=new T.WebGLRenderTarget(1,1,{type:hdrType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
    var bloomB=new T.WebGLRenderTarget(1,1,{type:hdrType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
    var postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    var postVertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    var blurShader=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:renderTarget.texture},step:{value:new T.Vector2()},threshold:{value:1}},vertexShader:postVertex,
      fragmentShader:'uniform sampler2D source;uniform vec2 step;uniform float threshold;varying vec2 vUv;vec3 sampleLight(vec2 p){vec3 c=texture2D(source,p).rgb;return threshold>0.0?max(c-vec3(.95),vec3(0.0)):c;}void main(){vec3 c=sampleLight(vUv)*.227027;c+=sampleLight(vUv+step*1.384615)*.316216;c+=sampleLight(vUv-step*1.384615)*.316216;c+=sampleLight(vUv+step*3.230769)*.070270;c+=sampleLight(vUv-step*3.230769)*.070270;gl_FragColor=vec4(c,1.0);}'});
    var finalShader=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:renderTarget.texture},bloom:{value:bloomB.texture}},vertexShader:postVertex,
      fragmentShader:'uniform sampler2D source;uniform sampler2D bloom;varying vec2 vUv;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}void main(){vec3 c=texture2D(source,vUv).rgb+texture2D(bloom,vUv).rgb*.42;c=aces(c*1.10);c=pow(c,vec3(1.0/2.2));float vignette=1.0-smoothstep(.15,.80,length((vUv-.5)*vec2(1.0,.85)));c*=.79+.21*vignette;gl_FragColor=vec4(c,1.0);}'});
    var quad=new T.Mesh(new T.PlaneGeometry(2,2),blurShader);postScene.add(quad);
    var lowMaterialCache={};
    function lightweightMaterial(m) {
      if(!m.isMeshStandardMaterial)return m;
      if(lowMaterialCache[m.uuid])return lowMaterialCache[m.uuid];
      var low=new T.MeshLambertMaterial({
        color:m.color,map:m.map,emissive:m.emissive,emissiveMap:m.emissiveMap,
        emissiveIntensity:m.emissiveIntensity*.72,transparent:m.transparent,
        opacity:m.opacity,side:m.side,depthWrite:m.depthWrite,alphaTest:m.alphaTest,
        vertexColors:m.vertexColors,flatShading:m.flatShading
      });
      lowMaterialCache[m.uuid]=low;return low;
    }
    function resize() {
      width=Math.max(1,canvas.clientWidth||window.innerWidth);height=Math.max(1,canvas.clientHeight||window.innerHeight);
      // A pixel budget preserves crisp mobile rendering while capping the work
      // needed by old desktop GPUs. UI text remains at native CSS resolution.
      var ratio=quality==='low'?Math.min(1,Math.sqrt(420000/(width*height))):Math.min(window.devicePixelRatio||1,1.6);
      renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
      renderTarget.setSize(Math.floor(width*ratio),Math.floor(height*ratio));
      bloomA.setSize(Math.max(1,Math.floor(width*ratio*.38)),Math.max(1,Math.floor(height*ratio*.38)));
      bloomB.setSize(Math.max(1,Math.floor(width*ratio*.38)),Math.max(1,Math.floor(height*ratio*.38)));
    }
    function setQuality(value) {
      quality=value==='low'?'low':'high';renderer.shadowMap.enabled=quality==='high';
      scene.traverse(function(part) {
        if(!part.isMesh)return;
        if(!part.userData.originalMaterial)part.userData.originalMaterial=part.material;
        var original=part.userData.originalMaterial;
        part.material=quality==='low'?lightweightMaterial(original):original;
      });
      hemi.intensity=quality==='low'?1.35:2.05;
      key.intensity=quality==='low'?1.75:3.25;
      cool.intensity=quality==='low'?1.6:2.4;
      warm.visible=quality==='high';teal.visible=quality==='high';
      air.visible=quality==='high';resize();
    }
    function update(dt,state) {
      dt=Math.min(.05,Math.max(0,dt||.016));clock+=dt;
      state=state||{};var fs=state.fighters||[{x:-2,z:0,face:1,hp:100},{x:2,z:0,face:-1,hp:100}];
      for(var i=0;i<2;i++)pose(fighters[i],fs[i]||fs[0],dt,i);
      var mid=((fs[0].x||0)+(fs[1].x||0))*.5;
      var midZ=((fs[0].z||0)+(fs[1].z||0))*.5;
      var distance=Math.abs((fs[0].x||0)-(fs[1].x||0));
      var isMenu=state.phase==='menu';
      var menuOffset=isMenu&&width>800?-3.5:0;
      var goalX=isMenu?clamp(mid*.55,-1.8,1.8)+menuOffset:clamp(mid,-4.8,4.8);
      focus.x=lerp(focus.x,goalX,Math.min(1,dt*3));focus.y=lerp(focus.y,isMenu?1.15:1.0,Math.min(1,dt*3));focus.z=lerp(focus.z,midZ*.35,Math.min(1,dt*3));
      var spread=clamp((distance-5)*.42,0,2.5);
      var baseDistance=isMenu?14.0:11.0;
      var halfSpan=Math.max(Math.abs((fs[0].x||0)-focus.x),Math.abs((fs[1].x||0)-focus.x))+1.35;
      var horizontalFit=halfSpan/(Math.tan(camera.fov*PI/360)*camera.aspect)+1.8;
      var viewDistance=isMenu?baseDistance+spread:Math.max(baseDistance+spread,horizontalFit);
      camTarget.set(focus.x+viewDistance*.293,focus.y+viewDistance*.371,focus.z+viewDistance);
      camera.position.lerp(camTarget,Math.min(1,dt*3.7));
      shake=Math.max(0,shake-dt*.55);
      if(shake>0){camera.position.x+=(random()-.5)*shake;camera.position.y+=(random()-.5)*shake;}
      camera.lookAt(focus);
      air.rotation.y=Math.sin(clock*.025)*.08;air.position.y=Math.sin(clock*.1)*.3;
      for(var k=0;k<sparks.length;k++) {
        var s=sparks[k];s.life=Math.max(0,s.life-dt);
        if(s.life>0){s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;s.vy-=12*dt;temp.position.set(s.x,s.y,s.z);temp.rotation.set(clock*9+k,clock*6,0);var sz=s.size*s.life/s.max;temp.scale.set(sz,sz*3.5,sz);}else temp.scale.set(0,0,0);
        temp.updateMatrix();sparksMesh.setMatrixAt(k,temp.matrix);
      }
      sparksMesh.instanceMatrix.needsUpdate=true;
      for(var w=0;w<waves.length;w++) {
        var wave=waves[w];if(wave.life<=0)continue;wave.life=Math.max(0,wave.life-dt);
        wave.mesh.visible=wave.life>0;var p=1-wave.life/wave.max;wave.mesh.scale.setScalar(.13+p*1.35);wave.mesh.material.opacity=(1-p)*.72;
      }
    }
    function render() {
      if(quality==='low'){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
      renderer.toneMapping=T.NoToneMapping;renderer.setRenderTarget(renderTarget);renderer.render(scene,camera);
      quad.material=blurShader;blurShader.uniforms.source.value=renderTarget.texture;blurShader.uniforms.threshold.value=1;blurShader.uniforms.step.value.set(2.5/bloomA.width,0);
      renderer.setRenderTarget(bloomA);renderer.render(postScene,postCamera);
      blurShader.uniforms.source.value=bloomA.texture;blurShader.uniforms.threshold.value=0;blurShader.uniforms.step.value.set(0,2.5/bloomB.height);
      renderer.setRenderTarget(bloomB);renderer.render(postScene,postCamera);
      quad.material=finalShader;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
    }
    camera.position.set(4.1,6.2,14);camera.lookAt(focus);setQuality(quality);
    window.addEventListener('resize',resize);
    return {update:update,render:render,resize:resize,impact:impact,setQuality:setQuality,renderer:renderer,scene:scene,camera:camera};
  }
  window.NeonScene={create:create};
}());
