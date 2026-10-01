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
        var ancestor=m;while(ancestor&&ancestor!==parent){if(ancestor.userData.keepDynamic)return;ancestor=ancestor.parent;}
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

    // Three genuinely different places, all authored locally from procedural surfaces.
    var arenaId='', arenas={}, currentArena=null, reducedMotion=!!options.reducedMotion;
    var arenaBounds={skyline:8.5,reactor:9,void:10};
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
    var warm=new T.PointLight(0xff694a,38,32,2);warm.position.set(-8,5,-6);scene.add(warm);
    var teal=new T.PointLight(0x39d9ff,26,28,2);teal.position.set(7,6,5);scene.add(teal);
    var steel=material(0x354555,.66,.4),blackSteel=material(0x142331,.62,.48);
    var panelTex=texture(256,256,function(c,w,h){
      c.fillStyle='#89929a';c.fillRect(0,0,w,h);c.strokeStyle='#616973';c.lineWidth=5;c.strokeRect(8,8,w-16,h-16);
      c.strokeStyle='#aab4bc';c.lineWidth=2;c.beginPath();c.moveTo(16,58);c.lineTo(238,58);c.moveTo(58,16);c.lineTo(58,238);c.stroke();
      for(var p=0;p<1700;p++){c.fillStyle='rgba(255,255,255,'+(random()*.14)+')';c.fillRect(random()*w,random()*h,1+random()*12,1);}
      c.fillStyle='#434b51';[20,236].forEach(function(x){[20,236].forEach(function(y){c.beginPath();c.arc(x,y,3,0,PI*2);c.fill();});});
    });
    function floorTexture(id){return texture(2048,2048,function(c,w,h){
      var orange=id==='reactor',cosmic=id==='void';c.fillStyle=orange?'#383b40':cosmic?'#272238':'#263845';c.fillRect(0,0,w,h);
      var cell=128;
      for(var y=0;y<h;y+=cell)for(var x=0;x<w;x+=cell){
        c.fillStyle='rgba(0,0,0,'+(.04+random()*.13)+')';c.fillRect(x+3,y+3,cell-6,cell-6);
        c.strokeStyle=cosmic?'rgba(140,123,197,.23)':'rgba(139,170,189,.19)';c.lineWidth=2;c.strokeRect(x+4,y+4,cell-8,cell-8);
        if(!cosmic){c.fillStyle='rgba(199,211,214,.25)';c.fillRect(x+11,y+11,3,3);c.fillRect(x+cell-14,y+cell-14,3,3);}
        if(orange)for(var gr=0;gr<5;gr++){c.strokeStyle='rgba(10,14,19,.34)';c.beginPath();c.moveTo(x+20,y+25+gr*17);c.lineTo(x+105,y+25+gr*17);c.stroke();}
      }
      c.save();c.translate(w/2,h/2);c.strokeStyle=orange?'rgba(255,160,62,.45)':cosmic?'rgba(162,134,249,.58)':'rgba(145,226,221,.34)';
      [390,408,515].forEach(function(r,i){c.lineWidth=i===1?3:8;c.beginPath();c.arc(0,0,r,0,PI*2);c.stroke();});
      c.setLineDash([10,24]);c.lineWidth=5;c.beginPath();c.arc(0,0,535,0,PI*2);c.stroke();c.setLineDash([]);
      for(var angle=0;angle<12;angle++){c.save();c.rotate(angle*PI/6);c.fillStyle=orange?'rgba(248,174,70,.4)':'rgba(124,183,198,.28)';c.fillRect(-5,550,10,60);c.restore();}
      c.textAlign='center';c.fillStyle=orange?'rgba(234,163,88,.40)':cosmic?'rgba(149,120,218,.4)':'rgba(129,203,218,.32)';c.font='900 205px Arial';c.fillText(orange?'06':cosmic?'Ø':'NC',0,55);
      c.font='600 27px monospace';c.fillText(orange?'THERMAL / CONTAINMENT':cosmic?'BEYOND THE SIGNAL':'NIGHT DIVISION / 2077',0,112);c.restore();
      c.strokeStyle=orange?'rgba(251,159,66,.48)':cosmic?'rgba(150,131,211,.45)':'rgba(123,190,198,.3)';c.lineWidth=8;c.strokeRect(75,75,w-150,h-150);
      c.font='bold 34px monospace';c.fillStyle='#9ba7ad';c.fillText(orange?'REACTOR 06':cosmic?'THE VOID':'SKYLINE / 07',116,152);
      c.textAlign='right';c.fillText('NC // FIGHT DIVISION',w-116,h-115);
      for(var i=0;i<36;i++){c.fillStyle=i%2?'rgba(20,23,29,.5)':orange?'rgba(255,166,57,.5)':'rgba(135,173,167,.22)';c.fillRect(115+i*22,h-205,16,32);}
      for(var n=0;n<6000;n++){c.fillStyle='rgba(211,225,230,'+(random()*.09)+')';c.fillRect(random()*w,random()*h,random()*6+.5,1);}
    });}
    function makeSign(parent,label,sub,x,y,z,w,h,color,angle){
      var g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle||0;parent.add(g);
      box(g,blackSteel,0,0,-.11,w+.18,h+.18,.22);
      var tex=texture(1024,384,function(c,cw,ch){c.fillStyle='#08131c';c.fillRect(0,0,cw,ch);c.strokeStyle=color;c.lineWidth=7;c.strokeRect(18,18,cw-36,ch-36);c.textAlign='center';c.fillStyle=color;c.font='900 112px Arial';c.fillText(label,cw/2,198);c.fillStyle='#a6c1cd';c.font='600 25px monospace';c.fillText(sub,cw/2,269);for(var s=0;s<ch;s+=5){c.fillStyle='rgba(0,0,0,.16)';c.fillRect(0,s,cw,1);}});
      mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex}),g,0,0,.015);glow(g,color,0,0,0,w*1.5,.15);return g;
    }
    function ring(parent,r,thick,mat,x,y,z,rotation){var m=mesh(new T.TorusGeometry(r,thick,8,80),mat,parent,x,y,z);m.rotation.x=rotation===undefined?PI/2:rotation;return m;}
    function buildArena(id){
      var g=new T.Group(),detail=new T.Group(),animated=[],colliders=[],b=arenaBounds[id],size=(b+.95)*2;
      scene.add(g);g.add(detail);var cyan=neon(id==='reactor'?0xffa644:id==='void'?0xa983ff:0x45e4e4,2.3);
      var rim=neon(id==='void'?0x56dafa:0xfe734e,2.0);
      box(g,blackSteel,0,-.47,0,size+.28,.88,size+.28,true);
      box(g,steel,0,-.85,0,size-.5,.18,size-.5);
      var fm=new T.MeshStandardMaterial({map:floorTexture(id),color:0xdce5ef,metalness:id==='skyline'?.48:.42,roughness:id==='skyline'?.34:.55});
      var floor=mesh(new T.PlaneGeometry(size,size),fm,g,0,.015,0);floor.rotation.x=-PI/2;floor.receiveShadow=true;
      for(var side=-1;side<=1;side+=2){
        box(g,cyan,0,-.18,side*(b+.99),size,.06,.04);box(g,cyan,side*(b+.99),-.18,0,.04,.06,size);
        box(g,cyan,0,.024,side*b,size-1.9,.013,.035);box(g,cyan,side*b,.024,0,.035,.013,size-1.9);
        for(var q=-1;q<=1;q+=2){
          box(g,steel,side*(b+.64),.25,q*(b+.64),.34,.5,.34,true);box(g,cyan,side*(b+.64),.53,q*(b+.64),.34,.045,.34);
          glow(detail,id==='reactor'?0xffa74e:id==='void'?0xb999ff:0x46dded,side*(b+.64),.56,q*(b+.64),2,.38);
        }
        for(var tick=-b+.5;tick<b;tick+=1.5){box(g,steel,tick,-.47,side*(b+1.08),.58,.17,.08);box(g,tick<0?cyan:rim,tick,-.45,side*(b+1.13),.28,.032,.015);}
      }
      if(id==='skyline'){
        box(g,material(0x122333,.4,.66),0,-14,0,size-1.5,26,size-1.5);
        var buildings=new T.InstancedMesh(boxGeo,material(0x1e2d43,.4,.73),100);g.add(buildings);
        var wins=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.74}),12500);g.add(wins);var wc=0,col=new T.Color();
        var shades=[0x55a6ca,0x87bdc0,0x8d93c6,0xce8c83,0xffb77e];
        for(var i=0;i<100;i++){
          var a=i*2.39996,r=27+Math.floor(i/20)*8+random()*7,x=Math.sin(a)*r,z=Math.cos(a)*r,h=12+random()*38,w=2.4+random()*4.2,d=2.4+random()*4;
          temp.position.set(x,h/2-18,z);temp.rotation.set(0,-a,0);temp.scale.set(w,h,d);temp.updateMatrix();buildings.setMatrixAt(i,temp.matrix);col.setHex(i%2?0x24314a:0x172b3f);buildings.setColorAt(i,col);
          for(var y=-10;y<h-18;y+=.83)for(var wx=-w/2+.3;wx<w/2;wx+=.68){if(random()>.47||wc>=12500)continue;var dx=Math.cos(a)*wx-Math.sin(a)*d*.501,dz=Math.sin(a)*wx+Math.cos(a)*d*.501;temp.position.set(x+dx,y,z+dz);temp.rotation.set(0,-a,0);temp.scale.set(.20,.32,1);temp.updateMatrix();wins.setMatrixAt(wc,temp.matrix);col.setHex(shades[Math.floor(random()*shades.length)]);wins.setColorAt(wc++,col);}
          if(i<28){rod(g,i%3?cyan:rim,x-w*.4,h-18,z,x-w*.4,-8,z,.028);box(g,steel,x,h-17.3,z,.08,1.4,.08);glow(detail,0xff7e6f,x,h-16.6,z,.9,.55);}
        }
        wins.count=wc;buildings.instanceMatrix.needsUpdate=true;wins.instanceMatrix.needsUpdate=true;
        // Nearby neighbouring rooftops provide parallax without blocking the arena.
        for(var side=-1;side<=1;side+=2){box(g,blackSteel,side*17,-3,-9,6,5,10);for(var v=0;v<4;v++){box(g,steel,side*17,-.16,-12+v*1.7,2.2,.9,1.25);for(var sl=0;sl<6;sl++)box(g,blackSteel,side*17-.83+sl*.33,.31,-12+v*1.7,.11,.02,.92);}}
        makeSign(g,'NIGHT / SHIFT','AFTER HOURS FIGHT CLUB',-9,5,-20,7,2.65,'#7ef0df',.22);
        makeSign(g,'NEON 東京','THE CITY NEVER SLEEPS',13,9,-25,7.7,2.8,'#ff9476',-.22);
        makeSign(g,'2077','THE LAST LIGHT',-25,9,11,5.2,2.4,'#aeb7ff',1.7);
        var moon=mesh(new T.CircleGeometry(6,80),new T.MeshBasicMaterial({color:0xff9f84,fog:false}),g,-38,23,-80);glow(detail,0xff765f,-38,23,-80,32,.28);
        for(var band=0;band<6;band++)box(g,new T.MeshBasicMaterial({color:0x674c67,fog:false}),-38,18.7+band*.65,-79.98,8.1+band*.42,.07+band*.018,.015);
        for(var puddle=0;puddle<13;puddle++){var p=mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({color:puddle%2?0x4db5ce:0xe07869,transparent:true,opacity:.04,depthWrite:false}),detail,(random()-.5)*size,.029,(random()-.5)*size,1+random()*3,random()*.3+.15,1);p.rotation.x=-PI/2;}
      }else if(id==='reactor'){
        var orange=neon(0xff9b32,3),hot=neon(0xffdd91,3.5),metal=material(0x565453,.73,.42);
        // An elevated containment machine hangs over the arena, with all supports outside play.
        for(var p=0;p<8;p++){
          var a=p*PI/4,x=Math.sin(a)*21,z=Math.cos(a)*21;
          colliders.push({x:x,z:z,radius:2.05,bottom:-5,top:24});
          box(g,blackSteel,x,8,z,2.4,25,2.4,true);box(g,metal,x,8,z,2.8,.6,2.8);
          rod(g,metal,x,16,z,Math.sin(a)*5,14,Math.cos(a)*5,.25);
          rod(g,orange,x-.5,2,z,x-.5,15,z,.055);
          mesh(new T.CylinderGeometry(1.55,1.75,7,14),metal,g,x,1.8,z,1,1,1,true);
          for(var t=0;t<3;t++)ring(g,1.79,.09,orange,x,-.5+t*2.2,z);
          glow(detail,0xff7738,x,3,z,7,.26);
        }
        mesh(new T.CylinderGeometry(4.5,3.6,3,24),blackSteel,g,0,14.6,0,1,1,1,true);
        mesh(new T.CylinderGeometry(2,2.5,3,24),orange,g,0,14.2,0);
        ring(g,4.65,.15,metal,0,13.2,0);ring(g,4.65,.07,orange,0,13.15,0);ring(g,4.5,.16,metal,0,16,0);
        for(var a=0;a<3;a++){var turbine=new T.Group();turbine.position.set(0,12.9+a*.28,0);g.add(turbine);var r=ring(turbine,5.4+a*.6,.055,a%2?hot:orange,0,0,0);turbine.rotation.z=a*.08;animated.push({mesh:turbine,type:'spin',rate:(a%2?-1:1)*(.15+a*.08)});}
        for(var tx=-24;tx<=24;tx+=6){box(g,blackSteel,tx,5,-28,5.95,24,.7);box(g,metal,tx,5,28,5.95,24,.7);box(g,orange,tx,8,-27.58,.07,12,.08);}
        for(var side=-1;side<=1;side+=2){rod(g,metal,side*13,-1,-24,side*13,-1,24,.62);rod(g,orange,side*13,-.98,-24,side*13,-.98,24,.12);}
        makeSign(g,'REACTOR / 06','CONTAINMENT UNSTABLE',0,5,-24,9,2.8,'#ffb34e');
        makeSign(g,'CAUTION','THERMAL DISCHARGE',22,5,0,5,2,'#ffc779',-PI/2);
        for(var vent=-6;vent<=6;vent+=3){box(g,blackSteel,vent,.04,-8,1.4,.05,.4);for(var slit=0;slit<4;slit++)box(g,orange,vent-.48+slit*.32,.075,-8,.07,.025,.32);}
      }else{
        var obsidian=material(0x343047,.75,.27),purple=neon(0xb68bff,2.6),ice=neon(0x78e9ff,2.4);
        mesh(new T.ConeGeometry(12,9,4),obsidian,g,0,-5.3,0,1,1,1).rotation.z=PI;
        for(var j=0;j<18;j++){
          var a=j*2.39996,r=18+random()*24,x=Math.sin(a)*r,z=Math.cos(a)*r;
          var ob=new T.Group();ob.position.set(x,-2+random()*9,z);ob.rotation.set((random()-.5)*.18,a+PI,(random()-.5)*.25);g.add(ob);
          var hh=5+random()*10,ww=1.1+random()*1.1;colliders.push({x:x,z:z,radius:ww,bottom:ob.position.y-hh*.6-1,top:ob.position.y+hh*.6+1});box(ob,obsidian,0,0,0,ww,hh,ww*.85);
          box(ob,purple,-ww*.46,0,ww*.438,.04,hh-.2,.035);box(ob,ice,ww*.46,0,ww*.438,.025,hh-.2,.035);
          box(ob,purple,0,hh*.35,ww*.44,ww*.93,.045,.03);glow(ob,0xa385ff,0,hh*.3,0,ww*4,.22);
          animated.push({mesh:ob,type:'float',base:ob.position.y,phase:j,rate:.25});
        }
        for(var s=0;s<30;s++){
          var angle=s*2.39996,r=15+random()*19;
          var shard=mesh(new T.OctahedronGeometry(1,0),obsidian,g,Math.sin(angle)*r,-4+random()*9,Math.cos(angle)*r,.35+random()*.5,.5+random()*1.4,.4+random()*.5);shard.rotation.set(random(),random(),random());animated.push({mesh:shard,type:'shard',base:shard.position.y,phase:s,rate:.18});
        }
        var gate=new T.Group();gate.position.set(0,14,-47);gate.rotation.y=.15;g.add(gate);
        [10,10.4,12].forEach(function(r,i){var rr=ring(gate,r,i===0?.11:.045,i===1?ice:purple,0,0,0,0);rr.rotation.y=i*.27;animated.push({mesh:rr,type:'cosmic',rate:.055*(i+1)});});
        glow(detail,0x8058e5,0,14,-48,43,.34);glow(detail,0x653bb8,40,20,-65,90,.13);
        for(var q=0;q<4;q++){var ar=ring(g,3+q*.2,.016,q%2?ice:purple,0,.046,0);}
      }
      animated.forEach(function(a){a.mesh.userData.keepDynamic=true;});
      batchMeshes(g,true);
      return {group:g,detail:detail,animated:animated,bounds:b,colliders:colliders};
    }
    // Environmental particles use one fixed buffer, independent from combat feedback.
    var airPositions=new Float32Array(600*3),airGeo=new T.BufferGeometry();
    for(var ai=0;ai<600;ai++){airPositions[ai*3]=(random()-.5)*90;airPositions[ai*3+1]=-3+random()*36;airPositions[ai*3+2]=(random()-.5)*90;}
    airGeo.setAttribute('position',new T.BufferAttribute(airPositions,3));
    var air=new T.Points(airGeo,new T.PointsMaterial({color:0xb9d3ee,size:.045,transparent:true,opacity:.48,depthWrite:false}));scene.add(air);
    var rainPositions=new Float32Array(420*6),rainGeo=new T.BufferGeometry();
    for(var ri=0;ri<420;ri++){var ro=ri*6;rainPositions[ro]=(random()-.5)*42;rainPositions[ro+1]=random()*20;rainPositions[ro+2]=(random()-.5)*42;rainPositions[ro+3]=rainPositions[ro]-.055;rainPositions[ro+4]=rainPositions[ro+1]-.46;rainPositions[ro+5]=rainPositions[ro+2];}
    rainGeo.setAttribute('position',new T.BufferAttribute(rainPositions,3));var rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:0x9ecbdf,transparent:true,opacity:.22,depthWrite:false}));scene.add(rain);
    function setArena(id){
      id=arenaBounds[id]?id:'skyline';if(id===arenaId)return;arenaId=id;
      if(currentArena)currentArena.group.visible=false;
      currentArena=arenas[id]||(arenas[id]=buildArena(id));currentArena.group.visible=true;
      var palettes={skyline:[0x080e20,0x55344c,0x17283b,.012,0xaed9ef,0xffdabf,0x3daeff],reactor:[0x100e13,0x512b19,0x221815,.015,0xedc49b,0xffd5b1,0xfd742d],void:[0x0a0720,0x271c58,0x161331,.009,0xb5bdff,0xe1d4ff,0x865cfd]},p=palettes[id];
      skyUniforms.top.value.setHex(p[0]);skyUniforms.horizon.value.setHex(p[1]);scene.fog.color.setHex(p[2]);scene.fog.density=p[3];hemi.color.setHex(p[4]);key.color.setHex(p[5]);cool.color.setHex(p[6]);
      warm.color.setHex(id==='reactor'?0xff822f:id==='void'?0xab72ff:0xff755d);teal.color.setHex(id==='reactor'?0xffc678:0x55d9ff);
      if(typeof lowMaterialCache!=='undefined'&&lowMaterialCache)setQuality(quality);
    }

    // The suits are built around real shoulder / elbow / hip / knee pivots.
    var shadowTex=texture(128,128,function(ctx,w,h){var g=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);g.addColorStop(0,'rgba(0,0,0,.57)');g.addColorStop(.45,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);});
    function fighter(index) {
      var enemy=index===1,color=enemy?0xff795b:0x60e2f5;
      var armor=new T.MeshStandardMaterial({color:enemy?0xc97965:0x7aaabb,map:panelTex,metalness:.55,roughness:.36});
      var bright=new T.MeshStandardMaterial({color:enemy?0xe09c7b:0xc0d4dc,map:panelTex,metalness:.48,roughness:.34});
      [armor,bright].forEach(function(m){m.onBeforeCompile=function(shader){shader.uniforms.rimColor={value:new T.Color(color)};shader.fragmentShader="uniform vec3 rimColor;\n"+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\n totalEmissiveRadiance += rimColor * pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0)*.38;");};m.customProgramCacheKey=function(){return "fighter-rim";};});
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
      var slashMat=new T.MeshBasicMaterial({color:color,transparent:true,opacity:0,side:T.DoubleSide,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false});
      var slash=mesh(new T.RingGeometry(.80,1.00,40,1,0,PI*1.45),slashMat,root,0,1.63,.35);slash.visible=false;
      var slash2=mesh(new T.RingGeometry(.90,.92,40,1,0,PI*1.3),slashMat.clone(),root,0,1.55,.35);slash2.visible=false;
      var shield=mesh(new T.RingGeometry(.65,.69,40),new T.MeshBasicMaterial({color:0xbcffdf,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}),root,0,1.88,.70);shield.visible=false;
      var chargeRing=mesh(new T.RingGeometry(1.0,1.035,60),new T.MeshBasicMaterial({color:color,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}),root,0,.03,0);chargeRing.rotation.x=-PI/2;chargeRing.visible=false;
      return {root:root,stance:stance,torso:torso,head:head,arms:arms,legs:legs,shadow:shadow,ring:ring,auraRing:auraRing,accent:accent,color:color,phase:index*1.8,slash:slash,slash2:slash2,shield:shield,chargeRing:chargeRing};
    }
    var fighters=[fighter(0),fighter(1)];
    var markerTexture=texture(96,96,function(c,w,h){c.strokeStyle='#fff3ce';c.lineWidth=5;[[17,17],[79,17],[17,79],[79,79]].forEach(function(p){var sx=p[0]<48?1:-1,sy=p[1]<48?1:-1;c.beginPath();c.moveTo(p[0]+sx*18,p[1]);c.lineTo(p[0],p[1]);c.lineTo(p[0],p[1]+sy*18);c.stroke();});c.fillStyle='#fff3ce';c.beginPath();c.arc(48,48,3,0,PI*2);c.fill();});
    var targetMarker=new T.Sprite(new T.SpriteMaterial({map:markerTexture,transparent:true,opacity:.7,depthWrite:false,depthTest:false}));targetMarker.scale.set(.56,.56,1);scene.add(targetMarker);
    var hazardRoot=new T.Group();scene.add(hazardRoot);hazardRoot.visible=false;
    var hazardRing=mesh(new T.RingGeometry(.965,1,80),new T.MeshBasicMaterial({color:0xffa343,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false,toneMapped:false}),hazardRoot);hazardRing.rotation.x=-PI/2;
    var hazardFill=mesh(new T.CircleGeometry(.963,64),new T.MeshBasicMaterial({color:0xff762d,transparent:true,opacity:.1,side:T.DoubleSide,depthWrite:false}),hazardRoot,0,.003,0);hazardFill.rotation.x=-PI/2;
    var hazardProgress=mesh(new T.RingGeometry(.95,1,64),hazardRing.material.clone(),hazardRoot,0,.007,0);hazardProgress.rotation.x=-PI/2;
    for(var hr=0;hr<8;hr++){var ha=hr*PI/4;var tick=box(hazardRoot,new T.MeshBasicMaterial({color:0xffd38a,transparent:true,opacity:.8}),Math.sin(ha)*.87,.012,Math.cos(ha)*.87,.04,.01,.14);tick.rotation.y=ha;}
    var hazardColumn=mesh(new T.CylinderGeometry(.94,.94,2,40,1,true),new T.MeshBasicMaterial({color:0xff9c42,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}),hazardRoot,0,1,0);
    var hazardGlare=glow(hazardRoot,0xffa350,0,.8,0,4,.5);

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
      power=power||1;sparkColor.set(color||0xc5ffff);if(!reducedMotion)shake=Math.max(shake,.12*Math.min(2.2,power));
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
      if(type==='attack'&&data.action==='special'){
        var wa=waves.find(function(w){return w.life<=0;})||waves[0];wa.max=.68;wa.radius=4.2;wa.life=wa.max;wa.mesh.visible=true;wa.mesh.position.set(x,.12,z);wa.mesh.material.color.setHex(color);wa.mesh.rotation.set(PI/2,0,0);
      }
    }

    function pose(rig,f,dt,index) {
      var elapsed=f.actionTime||0,duration=Math.max(.15,f.actionDuration||.5),t=clamp(elapsed/duration,0,1);
      var action=f.action||'idle',walking=action==='walk'||action==='sprint'||Math.abs(f.vx||0)+Math.abs(f.vz||0)>.12;
      var bob=reducedMotion?0:Math.sin(clock*3+rig.phase)*.025,step=Math.sin(clock*(action==='sprint'?15:10)+rig.phase);
      var dead=action==='ko'||f.hp<=0;
      rig.root.position.set(f.x||0,(f.y||0)+bob+.032,f.z||0);
      var goal=Number.isFinite(f.yaw)?f.yaw:(f.face|| (index===0?1:-1))===1?PI/2:-PI/2;
      if((action==='punch'||action==='kick'||action==='special')&&Number.isFinite(f._attackYaw))goal=f._attackYaw;
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
      var moveSpec=window.FightSim&&window.FightSim.moves&&window.FightSim.moves[action];
      var windup=moveSpec?moveSpec.windup:duration*.25;
      var strike=Math.sin(PI*clamp((elapsed-windup*.5)/Math.max(.12,duration-windup*.5),0,1));
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
      var offensive=action==='punch'||action==='kick'||action==='special';
      var attackAlpha=offensive?Math.sin(PI*clamp((elapsed-windup*.74)/Math.max(.10,duration-windup*.74),0,1)):0;
      rig.slash.visible=attackAlpha>.05&&!dead;rig.slash2.visible=attackAlpha>.12&&!dead;
      rig.slash.rotation.set(action==='kick'?-.9:-.45,0,-t*PI*1.3+(index?1:-1)*.5);
      rig.slash2.rotation.copy(rig.slash.rotation);rig.slash2.rotation.z+=.2;
      var reach=action==='special'?1.8:action==='kick'?1.5:1;
      rig.slash.scale.set(reach,reach,reach);rig.slash2.scale.set(reach*1.13,reach*1.13,reach*1.13);
      rig.slash.material.opacity=attackAlpha*(action==='special'?.62:.42);rig.slash2.material.opacity=attackAlpha*.6;
      rig.shield.visible=!!(f.blocking||action==='block')&&!dead;
      rig.shield.material.opacity=f._parryWindow>0?.94:.38;rig.shield.rotation.z=reducedMotion?0:clock*.5;
      rig.chargeRing.visible=action==='special'&&!dead;rig.chargeRing.scale.setScalar(1+t*1.8);rig.chargeRing.material.opacity=(1-t)*.75;
      rig.shadow.position.x=f.x||0;rig.shadow.position.z=(f.z||0)+(dead?-.5:0);
      rig.shadow.material.opacity=.85/(1+(f.y||0)*.7);
      rig.shadow.scale.setScalar(1+(f.y||0)*.22);
      rig.ring.position.set(f.x||0,.063,f.z||0);rig.ring.material.opacity=dead?.1:.32+Math.sin(clock*2)*.07;
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
      hemi.intensity=quality==='low'?1.35:2.05;
      key.intensity=quality==='low'?1.75:3.25;
      cool.intensity=quality==='low'?1.6:2.4;
      warm.visible=quality==='high';teal.visible=quality==='high';
      air.visible=quality==='high';rain.visible=quality==='high'&&!reducedMotion&&arenaId==='skyline';resize();
      return quality;
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
        cachedArenas:Object.keys(arenas).length};
    }
    // Camera-relative movement and an orbiting shoulder camera share one yaw.
    // Yaw 0 looks along +Z, matching the simulation's fighter orientation.
    var orbit={yaw:PI/2+.45,pitch:.40,distance:8.2,locked:true,manualUntil:0};
    var cameraInitialized=false,cameraPlayer=0,cameraRight=new T.Vector3(),lookGoal=new T.Vector3();
    var fallbackFighters=[{x:-2,z:0,yaw:PI/2,hp:100},{x:2,z:0,yaw:-PI/2,hp:100}];
    function angleDelta(target,current){return T.MathUtils.euclideanModulo(target-current+PI,PI*2)-PI;}
    function rotateCamera(dx,dy){orbit.yaw-=Number(dx)||0;orbit.pitch=clamp(orbit.pitch+(Number(dy)||0),.10,1.05);orbit.manualUntil=clock+3.5;}
    function zoomCamera(delta){orbit.distance=clamp(orbit.distance+(Number(delta)||0),5.2,15);}
    function setLockOn(value){orbit.locked=!!value;if(orbit.locked)orbit.manualUntil=0;}
    function cameraInfo(){return {yaw:orbit.yaw,pitch:orbit.pitch,distance:orbit.distance,locked:orbit.locked,localPlayer:cameraPlayer};}
    function cameraInput(x,z){return {x:-Math.cos(orbit.yaw)*x-Math.sin(orbit.yaw)*z,z:Math.sin(orbit.yaw)*x-Math.cos(orbit.yaw)*z};}
    function localPlayerIndex(state){return state&&state.localPlayer===1?1:0;}
    function resetCamera(state){
      var fs=state&&state.fighters;
      cameraPlayer=localPlayerIndex(state);
      var p=fs&&fs[cameraPlayer],e=fs&&fs[1-cameraPlayer];
      orbit.yaw=p&&e?Math.atan2(e.x-p.x,e.z-p.z)+.45:(cameraPlayer===1?-PI/2:PI/2)+.45;
      orbit.pitch=.40;orbit.distance=8.2;orbit.manualUntil=0;cameraInitialized=false;
    }
    function setReducedMotion(value){reducedMotion=!!value;if(reducedMotion)shake=0;rain.visible=quality==='high'&&!reducedMotion&&arenaId==='skyline';}
    function updateCamera(dt,state,fs){
      var local=localPlayerIndex(state);
      if(local!==cameraPlayer)resetCamera(state);
      var p=fs[local]||fs[0],e=fs[1-local]||p,menu=state.phase==='menu',dx=(e.x||0)-(p.x||0),dz=(e.z||0)-(p.z||0),gap=Math.hypot(dx,dz);
      var yaw=orbit.yaw,pitch=orbit.pitch,dist=orbit.distance,alpha=1-Math.exp(-dt*6);
      if(menu){
        yaw=-.80+(reducedMotion?0:Math.sin(clock*.1)*.10);pitch=.22;dist=width>800?11.8:14.2;
        cameraRight.set(-Math.cos(yaw),0,Math.sin(yaw));
        // Put the pair in the open right side of the main menu composition.
        var shift=width>800?-3.75:0;
        lookGoal.set(((p.x||0)+(e.x||0))*.5+cameraRight.x*shift,1.65,((p.z||0)+(e.z||0))*.5+cameraRight.z*shift);
      }else{
        if(orbit.locked&&clock>orbit.manualUntil&&gap>.25){
          var wanted=Math.atan2(dx,dz)+.45,turn=angleDelta(wanted,orbit.yaw);
          orbit.yaw+=clamp(turn*(1-Math.exp(-dt*7)),-dt*3.4,dt*3.4);
        }
        yaw=orbit.yaw;cameraRight.set(-Math.cos(yaw),0,Math.sin(yaw));
        var tracking=orbit.locked&&clock>orbit.manualUntil;
        var separation=clamp((gap-7)/13,0,1);
        var bias=tracking?lerp(.23,.34,separation):.05;
        if(tracking)pitch=lerp(orbit.pitch,Math.min(orbit.pitch,.22),separation);
        var shortScreen=height<520;
        lookGoal.set((p.x||0)+dx*bias+cameraRight.x*.96,(shortScreen?2.6:1.65)+(p.y||0)*.30,(p.z||0)+dz*bias+cameraRight.z*.96);
        if(shortScreen)dist=Math.max(dist,9.6);
        // Pull back only enough to read wide separation, retaining a player-led camera.
        if(tracking)dist=Math.max(dist,Math.min(16,5.2+gap*.37));
        if(width<height)dist=Math.max(dist,11.2);
      }
      focus.lerp(lookGoal,cameraInitialized?alpha:1);
      if(!menu&&tracking){
        // Fit both bodies into the usable viewport; short screens reserve space for HUD.
        var tanFov=Math.tan(camera.fov*PI/360),safeTop=height<520?.29:.66,safeBottom=.80,safeSide=.80;
        var sine=Math.sin(yaw),cosine=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
        for(var bodyIndex=0;bodyIndex<2;bodyIndex++){
          var body=bodyIndex===0?p:e;
          for(var endIndex=0;endIndex<2;endIndex++){
            var bodyY=endIndex===0?0:3.45;
            var bx=(body.x||0)-focus.x,by=(body.y||0)+bodyY-focus.y,bz=(body.z||0)-focus.z;
            var screenX=-cosine*bx+sine*bz,screenY=sine*sp*bx+cp*by+cosine*sp*bz;
            var depth=sine*cp*bx-sp*by+cosine*cp*bz;
            dist=Math.max(dist,Math.abs(screenX)/(tanFov*camera.aspect*safeSide)-depth);
            dist=Math.max(dist,Math.abs(screenY)/(tanFov*(screenY>0?safeTop:safeBottom))-depth);
          }
        }
      }
      var horizontal=Math.cos(pitch)*dist;
      camTarget.set(focus.x-Math.sin(yaw)*horizontal,focus.y+Math.sin(pitch)*dist,focus.z-Math.cos(yaw)*horizontal);
      // Test only a handful of coarse outer props, never thousands of city windows.
      if(!menu&&currentArena){
        var vx=camTarget.x-focus.x,vy=camTarget.y-focus.y,vz=camTarget.z-focus.z;
        var length=Math.hypot(vx,vy,vz),closest=length,nx=vx/length,ny=vy/length,nz=vz/length;
        for(var colliderIndex=0;colliderIndex<currentArena.colliders.length;colliderIndex++){
          var c=currentArena.colliders[colliderIndex];
          var along=((c.x-focus.x)*nx+(c.z-focus.z)*nz)/(nx*nx+nz*nz);
          if(along<=1.3||along>closest+c.radius)continue;
          var off=Math.hypot(focus.x+nx*along-c.x,focus.z+nz*along-c.z),atY=focus.y+ny*along;
          if(off<c.radius&&atY>c.bottom-.5&&atY<c.top+.5)closest=Math.min(closest,Math.max(2.8,along-Math.sqrt(c.radius*c.radius-off*off)-.4));
        }
        if(closest<length)camTarget.set(focus.x+nx*closest,focus.y+ny*closest,focus.z+nz*closest);
      }
      camera.position.lerp(camTarget,cameraInitialized?1-Math.exp(-dt*(menu?3.5:10)):1);
      cameraInitialized=true;shake=Math.max(0,shake-dt*.7);
      if(shake>0&&!reducedMotion){camera.position.x+=(random()-.5)*shake;camera.position.y+=(random()-.5)*shake*.7;}
      camera.lookAt(focus);
      targetMarker.visible=!menu&&orbit.locked&&(e.hp===undefined||e.hp>0);
      targetMarker.position.set(e.x||0,3.37+(e.y||0),e.z||0);targetMarker.material.opacity=.62;
      key.target.position.set((p.x||0)*.3,0,(p.z||0)*.3);
    }
    function update(dt,state) {
      dt=Math.min(.05,Math.max(0,dt===undefined?.016:dt));clock+=dt;
      state=state||{};if(state.arena&&state.arena!==arenaId)setArena(state.arena);
      var fs=state.fighters||fallbackFighters;
      for(var i=0;i<2;i++)pose(fighters[i],fs[i]||fs[0],dt,i);
      updateCamera(dt,state,fs);
      if(currentArena){
        for(var ai=0;!reducedMotion&&ai<currentArena.animated.length;ai++){
          var a=currentArena.animated[ai];
          if(a.type==='spin')a.mesh.rotation.y+=dt*a.rate;
          if(a.type==='cosmic'){a.mesh.rotation.z+=dt*a.rate;a.mesh.rotation.y=Math.sin(clock*a.rate)*.28;}
          if(a.type==='float'||a.type==='shard'){a.mesh.position.y=a.base+Math.sin(clock*.55+a.phase)*.55;if(a.type==='shard')a.mesh.rotation.y+=dt*a.rate;}
        }
        currentArena.detail.visible=quality==='high';
      }
      skyUniforms.time.value=clock;air.visible=quality==='high';air.material.color.setHex(arenaId==='reactor'?0xffb661:arenaId==='void'?0xc6c1ff:0xb8d2e4);
      air.material.size=arenaId==='void'?.072:.033;air.material.opacity=arenaId==='void'?.8:.40;
      if(!reducedMotion){air.rotation.y=clock*.009;air.position.y=Math.sin(clock*.12)*.6;}
      rain.visible=quality==='high'&&!reducedMotion&&arenaId==='skyline';
      if(rain.visible){for(var ri=0;ri<420;ri++){var ro=ri*6;rainPositions[ro+1]-=dt*12;rainPositions[ro+4]-=dt*12;if(rainPositions[ro+1]<-.5){rainPositions[ro+1]=20;rainPositions[ro+4]=19.54;}}rainGeo.attributes.position.needsUpdate=true;}
      var hz=state.hazard,hazardOn=arenaId==='reactor'&&hz&&(hz.warning||hz.active);
      hazardRoot.visible=!!hazardOn;
      if(hazardOn){
        hazardRoot.position.set(hz.x||0,.055,hz.z||0);hazardRoot.scale.setScalar(hz.radius||2.45);
        hazardRing.material.color.setHex(hz.active?0xffeed0:0xff9f42);hazardFill.material.opacity=hz.active?.32:.08;
        hazardProgress.scale.setScalar(hz.active?1:clamp((hz.phaseTime||0)/(hz.warningDuration||1.7),.02,1));
        hazardProgress.material.opacity=hz.active?.7:.38;
        hazardColumn.visible=!!hz.active;hazardColumn.material.opacity=hz.active?.18:0;
        hazardRing.material.opacity=hz.active?.95:reducedMotion?.8:.57+Math.sin(clock*10)*.22;
        hazardGlare.visible=!!hz.active;hazardGlare.material.opacity=hz.active?.4:0;
      }
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
      if(quality==='low'){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setRenderTarget(null);renderer.render(scene,camera);return;}
      renderer.toneMapping=T.NoToneMapping;renderer.setRenderTarget(renderTarget);renderer.render(scene,camera);
      quad.material=blurShader;blurShader.uniforms.source.value=renderTarget.texture;blurShader.uniforms.threshold.value=1;blurShader.uniforms.step.value.set(1.1/bloomA.width,0);
      renderer.setRenderTarget(bloomA);renderer.render(postScene,postCamera);
      blurShader.uniforms.source.value=bloomA.texture;blurShader.uniforms.threshold.value=0;blurShader.uniforms.step.value.set(0,1.1/bloomB.height);
      renderer.setRenderTarget(bloomB);renderer.render(postScene,postCamera);
      quad.material=finalShader;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);
    }
    setArena(options.arena||'skyline');camera.position.set(-8,5,0);camera.lookAt(focus);setQuality(quality);
    window.addEventListener('resize',resize);
    return {update:update,render:render,resize:resize,impact:impact,effect:effect,setQuality:setQuality,setResolutionScale:setResolutionScale,prepareContextRecovery:prepareContextRecovery,restoreContext:restoreContext,graphicsInfo:graphicsInfo,setArena:setArena,setReducedMotion:setReducedMotion,rotateCamera:rotateCamera,zoomCamera:zoomCamera,resetCamera:resetCamera,setLockOn:setLockOn,cameraInput:cameraInput,cameraInfo:cameraInfo,renderer:renderer,scene:scene,camera:camera};
  }
  window.NeonScene={create:create};
}());
