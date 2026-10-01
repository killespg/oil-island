/* NEON CLASH — continuous, articulated character clothing and anatomy. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var sourceCache=[],atlasCache=[],canvasCache=[],organicGeometryCache={},organicShoeGeometry=null;
  var palette = {
    veterano: {skin:0x97664e, shirt:0x101b2c, trousers:0x3e6087, shoe:0x292e32, width:.438, waist:.373, depth:.277, arm:.146, thigh:.202, shin:.149, scale:1.00},
    titan: {skin:0x59391f, shirt:0xc7c9c6, trousers:0x0c1632, shoe:0xc6ccc9, width:.443, waist:.405, depth:.264, arm:.185, thigh:.215, shin:.135, scale:1.07},
    mimico: {skin:0xad7751, shirt:0x352944, trousers:0x3c506c, shoe:0x3b3830, width:.416, waist:.426, depth:.27, arm:.177, thigh:.264, shin:.385, scale:1.015},
    pixel: {skin:0xad7654, shirt:0x15191f, trousers:0x293e54, shoe:0x202b32, width:.393, waist:.34, depth:.23, arm:.129, thigh:.188, shin:.137, scale:.98}
  };

  // Images and procedural pixels are immutable across player slots. Keep only
  // their textures shared; each rig still owns its material colour/roughness.
  function canvasTexture(T,key,width,height,draw){
    var cached=canvasCache.find(function(entry){return entry.engine===T&&entry.key===key;});
    if(cached)return cached.texture;
    var canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    draw(canvas.getContext('2d'));
    var texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    canvasCache.push({engine:T,key:key,texture:texture});return texture;
  }
  function sourceTexture(T,source,ready,anisotropy){
    if(source.isTexture){if(source.image&&ready)ready(source);return source;}
    var uri=typeof source==='string'?source:source.src;
    var found=sourceCache.find(function(entry){return entry.engine===T&&entry.source===uri;});
    if(found){if(ready){if(found.ready)ready(found.texture);else found.listeners.push(ready);}return found.texture;}
    var record={engine:T,source:uri,texture:null,ready:false,listeners:ready?[ready]:[]};sourceCache.push(record);
    record.texture=new T.TextureLoader().load(uri,function(texture){record.ready=true;record.texture=texture;record.listeners.forEach(function(callback){callback(texture);});record.listeners=[];});
    record.texture.colorSpace=T.SRGBColorSpace;record.texture.anisotropy=anisotropy===undefined?4:anisotropy;return record.texture;
  }
  function fabricTexture(T){
    return canvasTexture(T,'fabric',256,256,function(fabricContext){
      var pixels=fabricContext.createImageData(256,256),seed=9124;
      for(var fy=0;fy<256;fy++)for(var fx=0;fx<256;fx++){
        seed=(seed*1664525+1013904223)>>>0;
        var grain=235+(seed>>>28)-7+(fx%4===0?5:0)-(fy%4===0?5:0);
        if(fx>240&&fy<15)grain=255;
        var pi=(fy*256+fx)*4;pixels.data[pi]=pixels.data[pi+1]=pixels.data[pi+2]=grain;pixels.data[pi+3]=255;
      }
      fabricContext.putImageData(pixels,0,0);
    });
  }
  function denimTexture(T){
    return canvasTexture(T,'denim',512,512,function(denimContext){
      var denimPixels=denimContext.createImageData(512,512),denimSeed=9328;
      for(var ty=0;ty<512;ty++)for(var tx=0;tx<512;tx++){
        denimSeed=(denimSeed*1664525+1013904223)>>>0;
        var twill=(tx+ty*2)%7<2?20:-4;
        var wash=Math.sin(tx*.021+Math.sin(ty*.029))*27+Math.cos(ty*.048)*11+Math.cos(tx*.064-ty*.013)*8;
        var thread=192+twill+wash+(denimSeed>>>28)-8,di=(ty*512+tx)*4;
        denimPixels.data[di]=thread;denimPixels.data[di+1]=thread;denimPixels.data[di+2]=thread;denimPixels.data[di+3]=255;
      }
      denimContext.putImageData(denimPixels,0,0);
    });
  }

  function build(T, rig, id, options) {
    options=options||{};
    var p=palette[id]||palette.veterano;
    var roomy=id==='mimico', vet=id==='veterano', titan=id==='titan',longSleeves=roomy||vet;
    var fabricSources=window.NeonFabricTextures||{},jeans=roomy||vet||id==='pixel',realDenim=jeans&&!!fabricSources.denim;
    var trouserColor=realDenim?(vet?0xb1c0d3:roomy?0xa9b0ba:0x929ca9):p.trousers;
    var pending=[];
    var cloth=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.96,metalness:0});
    var skin=new T.MeshStandardMaterial({color:p.skin,roughness:.84,metalness:0});
    var seams=new T.MeshStandardMaterial({color:roomy?0x211723:0x282b2b,roughness:.93,metalness:0});
    var shoeMaterial=new T.MeshStandardMaterial({color:p.shoe,roughness:.83,metalness:0});
    var pantsMaterial=cloth;
    if(typeof document!=='undefined'){
      if(fabricSources.cloth||fabricSources.skin){
        var sharedAtlas=atlasCache.find(function(entry){return entry.engine===T&&entry.cloth===fabricSources.cloth&&entry.skin===fabricSources.skin;});
        if(sharedAtlas)cloth.map=sharedAtlas.texture;
        else{
          var fabric=fabricTexture(T).image;
          // The mutable atlas has its own texture; loading reference images
          // must never replace the image of the shared procedural fallback.
          cloth.map=new T.CanvasTexture(fabric);cloth.map.colorSpace=T.SRGBColorSpace;
          sharedAtlas={engine:T,cloth:fabricSources.cloth,skin:fabricSources.skin,clothImage:null,skinImage:null,texture:cloth.map};atlasCache.push(sharedAtlas);
          function refreshAtlas(){
            var source=sharedAtlas.clothImage||fabric,atlas=document.createElement('canvas');
            atlas.width=source.naturalWidth||source.width;atlas.height=source.naturalHeight||source.height;
            var atlasContext=atlas.getContext('2d'),patchWidth=atlas.width/16,patchHeight=atlas.height/16;
            // Retain the asset's native resolution; reserve only a tiny swatch
            // for bare-skin UVs so sleeves never project textile onto hands.
            atlasContext.drawImage(source,0,0);atlasContext.fillStyle='#fff';atlasContext.fillRect(atlas.width-patchWidth,0,patchWidth,patchHeight);
            if(sharedAtlas.skinImage)atlasContext.drawImage(sharedAtlas.skinImage,atlas.width-patchWidth,0,patchWidth,patchHeight);
            sharedAtlas.texture.image=atlas;sharedAtlas.texture.anisotropy=4;sharedAtlas.texture.needsUpdate=true;
          }
          if(fabricSources.cloth)sourceTexture(T,fabricSources.cloth,function(tex){sharedAtlas.clothImage=tex.image;refreshAtlas();});
          if(fabricSources.skin)sourceTexture(T,fabricSources.skin,function(tex){sharedAtlas.skinImage=tex.image;refreshAtlas();});
        }
      }else cloth.map=fabricTexture(T);
      if(fabricSources.skin)skin.map=sourceTexture(T,fabricSources.skin);
      if(realDenim){
        var denimMap=sourceTexture(T,fabricSources.denim);
        denimMap.wrapS=denimMap.wrapT=T.RepeatWrapping;denimMap.repeat.set(2.2,2.2);
        // Denim is matte in both graphics modes. Compress only the sampled
        // fiber contrast; the original image and its native detail stay intact.
        pantsMaterial=new T.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:denimMap});
        pantsMaterial.onBeforeCompile=function(shader){
          var denimChunk=T.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
            'sampledDiffuseColor.rgb = mix(vec3(0.050, 0.074, 0.119), sampledDiffuseColor.rgb, 0.38);\n\tdiffuseColor *= sampledDiffuseColor;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',denimChunk);
        };
        pantsMaterial.customProgramCacheKey=function(){return 'neon-matte-denim-v1';};
      }else if(jeans){
        pantsMaterial=cloth.clone();pantsMaterial.map=denimTexture(T);
        pantsMaterial.bumpMap=pantsMaterial.map;pantsMaterial.bumpScale=.008;pantsMaterial.roughness=1;
      }
    }

    function group(parent,x,y,z,bone) {
      var g=bone?new T.Bone():new T.Group();g.position.set(x||0,y||0,z||0);parent.add(g);return g;
    }
    function add(parent,geometry,material) {
      var m=new T.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    }
    function color(value,multiplier) {
      var c=new T.Color(value);if(multiplier!==undefined)c.multiplyScalar(multiplier);return c;
    }

    // Each row defines a complete cross-section. No sphere/cylinder assemblies:
    // the same connected surface crosses the elbow or knee and deforms with it.
    function loft(rows,segments,paint,weights,shape) {
      var positions=[],colors=[],uv=[],indices=[],skinIndices=[],skinWeights=[];
      var bottomToTop=rows[rows.length-1][0]>rows[0][0];
      rows.forEach(function(r,ri) {
        for(var j=0;j<=segments;j++) {
          var a=j/segments*TAU,cs=Math.cos(a),sn=Math.sin(a);
          var point={x:cs*r[1]+(r[3]||0),y:r[0],z:sn*r[2]+(r[4]||0)};
          if(shape)shape(point,r,ri,a);
          positions.push(point.x,point.y,point.z);
          var c=paint?paint(point,r,ri,a):color(0xffffff);
          colors.push(c.r,c.g,c.b);uv.push(point.plain?.944+j/segments*.052:j/segments*.90,point.plain?.944+ri/(rows.length-1)*.052:ri/(rows.length-1)*.90);
          if(weights) {
            var w=weights(point.y,point);skinIndices.push(0,1,2,w[3]?3:0);skinWeights.push(w[0],w[1],w[2]||0,w[3]||0);
          }
        }
      });
      for(var r=0;r<rows.length-1;r++)for(var n=0;n<segments;n++) {
        var a=r*(segments+1)+n,b=a+1,c=a+segments+1,d=c+1;
        if(bottomToTop)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c);
      }
      var geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      if(weights){geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));}
      geo.setIndex(indices);geo.computeVertexNormals();
      // Weld the duplicated UV-seam normals so a lit line never appears there.
      var normals=geo.attributes.normal;
      for(var k=0;k<rows.length;k++){
        var first=k*(segments+1),last=first+segments;
        var nx=normals.getX(first)+normals.getX(last),ny=normals.getY(first)+normals.getY(last),nz=normals.getZ(first)+normals.getZ(last);
        var length=Math.hypot(nx,ny,nz)||1;normals.setXYZ(first,nx/length,ny/length,nz/length);normals.setXYZ(last,nx/length,ny/length,nz/length);
      }
      geo.computeBoundingSphere();return geo;
    }
    function smooth(a,b,value) {
      var t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);
    }
    function armWeights(y) {
      if(y<-.5)y=-.5+(y+.5)/.92;
      if(y<-1.035)y=-1.035+(y+1.035)/.90;
      var elbow=1-smooth(-.65,-.355,y),hand=1-smooth(-1.07,-.975,y);
      var anchor=smooth(-.065,.07,y)*.90;
      return [(1-elbow)*(1-hand)*(1-anchor),elbow*(1-hand)*(1-anchor),hand*(1-anchor),anchor];
    }
    function legWeights(y) {
      var knee=1-smooth(-.87,-.535,y);return [1-knee,knee,0];
    }
    function skinned(parent,geometry,position,bones) {
      var m=new T.SkinnedMesh(geometry,cloth);m.position.copy(position);m.castShadow=true;m.receiveShadow=true;
      // Poses change every frame, so the rest-pose sphere cannot safely cull a limb.
      m.frustumCulled=false;parent.add(m);pending.push({mesh:m,bones:bones});return m;
    }
    function line(parent,points,radius,material) {
      var path=new T.CatmullRomCurve3(points.map(function(v){return new T.Vector3(v[0],v[1],v[2]);}));
      return add(parent,new T.TubeGeometry(path,Math.max(3,points.length*2),radius,5,false),material);
    }

    // These two fighters are authored as complete implicit surfaces. Shoulders,
    // armpits, elbows, wrists and the pelvis are actual connected topology.
    if((vet||id==='pixel')&&window.NeonOrganic)return organicHuman();
    function organicHuman(){
      var O=window.NeonOrganic,U=O.smoothUnion,E=O.ellipsoid,C=O.capsule;
      var torso=rig.torso=group(rig.stance,0,1.51,0,true);
      var head=rig.head=group(torso,0,1.21,vet?.025:.01);
      if(window.NeonFaces)window.NeonFaces.build(T,head,id);
      var upperBones=[torso],lowerBones=[rig.stance],armData=[];
      var cachedOrganic=organicGeometryCache[id];
      rig.arms=[];rig.legs=[];
      var spread=.205,cs=Math.cos(spread),ss=Math.sin(spread),shoulderX=vet?.438:.421,shoulderY=.785;
      for(var side=-1;side<=1;side+=2){
        var shoulder=group(torso,side*shoulderX,shoulderY,0,true);shoulder.rotation.z=side*spread;
        var elbow=group(shoulder,0,-.50,0,true),fist=group(elbow,0,-.4922,.015,true);
        upperBones.push(shoulder,elbow,fist);
        var start=[side*shoulderX,shoulderY,0],mid=[side*(shoulderX+.5*ss),shoulderY-.5*cs,0],wrist=[side*(shoulderX+.9922*ss),shoulderY-.9922*cs,.015];
        armData.push({side:side,start:start,mid:mid,wrist:wrist,dir:[side*ss,-cs,0],trapezius:[side*.125,.888,-.002],sleeveEnd:[start[0]+side*ss*.29,start[1]-cs*.29,0],thumbStart:[-side*.066,-.014,.03],thumbEnd:[-side*.068,-.096,.072],upperRadius:vet?[.146,.119]:[.135,.111],foreRadius:vet?[.122,.091]:[.112,.086],sleeveRadius:[.156,.141],shoulderIndex:side<0?1:4});
        var aura=options.glow?options.glow(fist,rig.color,0,0,0,.85,0):new T.Sprite(new T.SpriteMaterial({transparent:true,opacity:0}));
        if(!options.glow)fist.add(aura);aura.visible=false;rig.arms.push({shoulder:shoulder,elbow:elbow,fist:fist,aura:aura});
        var hip=group(rig.stance,side*.223,1.51,0,true),knee=group(hip,0,-.70,0,true),boot=group(knee,0,-.68,.06,true);
        lowerBones.push(hip,knee,boot);rig.legs.push({hip:hip,knee:knee,boot:boot});
      }
      function coreField(x,y,z){
        var chest=E(x,y,z,0,.62,-.008,vet?.403:.385,.304,vet?.265:.249);
        var abdomen=E(x,y,z,0,.30,.009,vet?.373:.351,.325,vet?.277:.259);
        var trunk=U(chest,abdomen,.115);
        // Clothing keeps its full section at the hem instead of ending in an
        // ellipsoid cap. It overlaps the entire waistband, including the hips.
        var hemT=smooth(-.080,.33,y),hemX=.469+(vet?-.097:-.119)*hemT;
        var hemZ=(vet?.319:.307)+(vet?-.041:-.048)*hemT;
        // A softly squared cloth section has room over both trouser hips.
        // An ellipse narrows too early at the rear quarter and lets the raised
        // thigh cap poke through the jacket even in the neutral fighting pose.
        var hem=(Math.pow(Math.pow(Math.abs(x)/hemX,2.8)+Math.pow(Math.abs(z-.008)/hemZ,2.8),1/2.8)-1)*Math.min(hemX,hemZ);
        hem=Math.max(hem,y-.36,-y-.080);
        trunk=U(trunk,hem,.035);
        trunk=Math.max(trunk,-y-.080);
        var a=armData[x<0?0:1];trunk=U(trunk,C(x,y,z,a.trapezius,a.start,vet?.139:.132),.065);
        return U(trunk,E(x,y,z,0,1.00,-.005,.121,.20,.113),.038);
      }
      function armField(x,y,z,a){
        var upper=C(x,y,z,a.start,a.mid,a.upperRadius);
        if(!vet){
          upper=U(upper,C(x,y,z,a.start,a.sleeveEnd,a.sleeveRadius),.016);
        }
        var fore=C(x,y,z,a.mid,a.wrist,a.foreRadius);
        var limb=U(upper,fore,.032);
        var dx=x-a.wrist[0],dy=y-a.wrist[1],hz=z-a.wrist[2];
        if(Math.abs(dx)>.23||Math.abs(dy+.07)>.235||Math.abs(hz)>.18)return limb;
        // Hand coordinates follow the A-pose forearm, so there is no wrist seam.
        var hx=dx*cs+dy*a.side*ss,hy=-dx*a.side*ss+dy*cs;
        var hand=E(hx,hy,hz,0,-.078,.011,.085,.103,.074);
        for(var finger=0;finger<4;finger++)hand=U(hand,E(hx,hy,hz,-.054+finger*.036,-.143,.052,.023,.039,.032),.016);
        hand=U(hand,C(hx,hy,hz,a.thumbStart,a.thumbEnd,.032),.023);
        return U(limb,hand,.022);
      }
      function bodyField(x,y,z){
        return U(coreField(x,y,z),armField(x,y,z,armData[x<0?0:1]),.036);
      }
      var regionX,regionY,regionZ,regionValue;
      function armRegion(x,y,z){
        if(x===regionX&&y===regionY&&z===regionZ)return regionValue;
        var a=armData[x<0?0:1];
        var t=(x-a.start[0])*a.dir[0]+(y-a.start[1])*a.dir[1];
        var amount=smooth(-.036,.045,coreField(x,y,z)-armField(x,y,z,a));
        regionX=x;regionY=y;regionZ=z;return(regionValue={arm:a,t:t,amount:amount});
      }
      function upperPaint(x,y,z){
        return{color:color(p.shirt,.9),uv:[(Math.atan2(z,x)/TAU+1)%1*.90,(y+.5)/1.78*.90]};
      }
      function upperSkin(x,y,z){
        var area=armRegion(x,y,z),a=area.arm,weight=area.amount,elbow=smooth(.38,.60,area.t),hand=smooth(.895,1.045,area.t);
        return{indices:[0,a.shoulderIndex,a.shoulderIndex+1,a.shoulderIndex+2],weights:[1-weight,weight*(1-elbow)*(1-hand),weight*elbow*(1-hand),weight*hand]};
      }
      var upperGeometry=cachedOrganic?cachedOrganic.upper:O.build(T,{bounds:{min:[-.94,-.55,-.41],max:[.94,1.28,.445]},resolution:[46,60,26],field:bodyField,paint:upperPaint,skin:upperSkin});
      var upperMesh=skinned(rig.stance,upperGeometry,new T.Vector3(0,1.51,0),upperBones);upperMesh.name='organic-upper-body';
      // The cloth/skin border is evaluated per fragment. Vertex colors alone
      // make a straight cuff jagged on a skinned marching-tetrahedra surface.
      if(!upperGeometry.attributes.organicArm){
        var armCoordinates=[],upperPositions=upperGeometry.attributes.position;
        for(var vi=0;vi<upperPositions.count;vi++){var region=armRegion(upperPositions.getX(vi),upperPositions.getY(vi),upperPositions.getZ(vi));armCoordinates.push(region.amount,region.t);}
        upperGeometry.setAttribute('organicArm',new T.Float32BufferAttribute(armCoordinates,2));
      }
      var organicMaterial=new T.MeshLambertMaterial({color:0xffffff,vertexColors:true,map:cloth.map});
      organicMaterial.onBeforeCompile=function(shader){
        shader.uniforms.organicSkin={value:color(p.skin)};
        shader.uniforms.organicCuff={value:vet?.947:.265};
        shader.uniforms.organicCollar={value:vet?1.025:.898};
        shader.vertexShader='attribute vec2 organicArm; varying vec2 vOrganicArm; varying vec3 vOrganicPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOrganicArm = organicArm; vOrganicPosition = position;');
        shader.fragmentShader='uniform vec3 organicSkin; uniform float organicCuff; uniform float organicCollar; varying vec2 vOrganicArm; varying vec3 vOrganicPosition;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat neckLine = organicCollar - 0.014 * clamp(vOrganicPosition.z / 0.11, -1.0, 1.0);\nfloat bareNeck = step(abs(vOrganicPosition.x), 0.145) * step(neckLine, vOrganicPosition.y);\nfloat bareArm = step(0.56, vOrganicArm.x) * step(organicCuff, vOrganicArm.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, organicSkin, max(bareNeck, bareArm));');
      };
      organicMaterial.customProgramCacheKey=function(){return 'neon-organic-cuffs-v2';};
      upperMesh.material=organicMaterial;
      for(var cuffIndex=0;cuffIndex<2;cuffIndex++){
        var cuff=add(vet?rig.arms[cuffIndex].elbow:rig.arms[cuffIndex].shoulder,new T.TorusGeometry(vet?.091:.139,.003,5,28),seams);
        cuff.rotation.x=Math.PI/2;cuff.position.y=vet?-.443:-.260;cuff.position.z=vet?.013:0;
      }

      var thighStarts=[[-.223,.018,0],[.223,.018,0]],knees=[[-.223,-.70,0],[.223,-.70,0]],ankles=[[-.223,-1.31,0],[.223,-1.31,0]];
      function pantsField(x,y,z){
        var pelvis=E(x,y,z,0,.002,0,vet?.370:.359,.177,vet?.253:.242);
        var legs=1e3;
        var first=x<-.09?0:x>.09?1:0,last=Math.abs(x)>.09?first+1:2;
        for(var i=first;i<last;i++){
          var thigh=C(x,y,z,thighStarts[i],knees[i],[vet?.202:.195,.151]);
          var calf=C(x,y,z,knees[i],ankles[i],[.149,.097]);
          calf=U(calf,E(x,y,z,knees[i][0],-.951,knees[i][2]-.018,.145,.225,.154),.025);
          var leg=U(thigh,calf,.034);
          // Broad, low-amplitude folds follow the trouser surface.
          if(y<-.35&&y> -1.27){var a=Math.atan2(z-knees[i][2],x-knees[i][0]);leg+=Math.sin(y*19+a*2.4)*.0035*Math.exp(-Math.pow((y+.78)/.5,2));}
          legs=Math.min(legs,leg);
        }
        return Math.max(U(pelvis,legs,.030),y-.126);
      }
      function pantsSkin(x,y,z){
        var anchor=smooth(-.23,.055,y);
        if(Math.abs(x)<.095&&y>-.27){var right=smooth(-.095,.095,x);return{indices:[0,1,4,0],weights:[anchor,(1-anchor)*(1-right),(1-anchor)*right,0]};}
        var base=x<0?1:4,knee=1-smooth(-.86,-.55,y),foot=1-smooth(-1.335,-1.19,y);
        return{indices:[0,base,base+1,base+2],weights:[anchor,(1-anchor)*(1-knee),(1-anchor)*knee*(1-foot),(1-anchor)*knee*foot]};
      }
      var lowerGeometry=cachedOrganic?cachedOrganic.lower:O.build(T,{bounds:{min:[-.51,-1.46,-.32],max:[.51,.245,.35]},resolution:[36,64,22],field:pantsField,
        paint:function(x,y,z){var center=x<0?-.223:.223;return{color:color(trouserColor,.9),uv:[(Math.atan2(z,x-center)/TAU+1)%1*.9,(y+1.46)/1.7*.9]};},skin:pantsSkin});
      var lowerMesh=skinned(rig.stance,lowerGeometry,new T.Vector3(0,1.51,0),lowerBones);lowerMesh.material=pantsMaterial;lowerMesh.name='organic-pants-and-pelvis';rig.pelvis=lowerMesh;
      if(vet){
        var jeanThread=new T.MeshStandardMaterial({color:0x938970,roughness:1,metalness:0});
        for(var seamSide=0;seamSide<2;seamSide++){
          var sign=seamSide===0?-1:1;
          line(rig.legs[seamSide].hip,[[sign*.195,-.12,0],[sign*.181,-.30,0],[sign*.166,-.50,0],[sign*.155,-.63,0]],.0023,jeanThread);
          line(rig.legs[seamSide].knee,[[sign*.150,-.04,0],[sign*.147,-.21,0],[sign*.128,-.41,0],[sign*.103,-.58,0]],.0023,jeanThread);
        }
      }
      if(!cachedOrganic)organicGeometryCache[id]={upper:upperGeometry,lower:lowerGeometry};

      for(var footIndex=0;footIndex<2;footIndex++){
        var shoeGeometry=organicShoeGeometry||(organicShoeGeometry=O.build(T,{bounds:{min:[-.16,-.095,-.22],max:[.16,.235,.375]},resolution:[14,12,20],field:function(x,y,z){
          var heel=E(x,y,z,0,.018,-.083,.100,.081,.105),toe=E(x,y,z,0,-.002,.212,.111,.059,.122);
          var sole=U(heel,E(x,y,z,0,.025,.073,.105,.077,.145),.045);sole=U(sole,toe,.027);
          sole=U(sole,E(x,y,z,0,.089,-.050,.079,.106,.08),.027);return Math.max(sole,-y-.052);
        }}));
        add(rig.legs[footIndex].boot,shoeGeometry,shoeMaterial);
        for(var lace=0;lace<3;lace++)line(rig.legs[footIndex].boot,[[-.058,.100-lace*.009,.05+lace*.035],[0,.117-lace*.013,.059+lace*.035],[.058,.100-lace*.009,.050+lace*.035]],.0038,seams);
      }
      function frontAt(x,y){
        var outer=.39,inner=-.15,last=outer;
        for(var z=outer;z>=inner;z-=.008){if(bodyField(x,y,z)<=0){var lo=z,hi=last;for(var i=0;i<8;i++){var mid=(lo+hi)*.5;if(bodyField(x,y,mid)<0)lo=mid;else hi=mid;}return hi+.005;}last=z;}
        return .08;
      }
      function surfaceGraphic(map,w,h,cx,cy){
        var positions=[],uv=[],indices=[],n=16;
        for(var yy=0;yy<=n;yy++)for(var xx=0;xx<=n;xx++){var x=cx+(xx/n-.5)*w,y=cy+(yy/n-.5)*h;positions.push(x,y,frontAt(x,y));uv.push(xx/n,yy/n);}
        for(var j=0;j<n;j++)for(var i=0;i<n;i++){var a=j*(n+1)+i;indices.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}
        var geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
        add(torso,geo,new T.MeshStandardMaterial({map:map,transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-1}));
      }
      if(vet){
        var zip=new T.MeshStandardMaterial({color:0x92754b,roughness:.62,metalness:.2}),zipPoints=[];
        for(var zp=0;zp<9;zp++){var zy=.46+zp*.055;zipPoints.push([0,zy,frontAt(0,zy)+.002]);}line(torso,zipPoints,.0048,zip);
        var pull=add(torso,new T.TorusGeometry(.018,.0035,5,12),zip);pull.position.set(0,.735,frontAt(0,.735)+.004);pull.scale.y=1.4;
        for(var pocketSide=-1;pocketSide<=1;pocketSide+=2){var points=[];for(var pi=0;pi<4;pi++){var px=pocketSide*(.246-pi*.013),py=.1+pi*.045;points.push([px,py,frontAt(px,py)]);}line(torso,points,.0035,seams);}
      }
      if(typeof document!=='undefined'){
        var artMap=canvasTexture(T,vet?'organic-veterano-badge':'organic-pixel-badge',256,vet?320:128,function(ctx){
        if(vet){ctx.strokeStyle='#ae2531';ctx.lineWidth=11;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(128,18);ctx.lineTo(211,140);ctx.lineTo(128,299);ctx.lineTo(44,140);ctx.closePath();ctx.stroke();ctx.font='bold 154px serif';ctx.textAlign='center';ctx.fillStyle='#ae2531';ctx.fillText('N',128,212);}
        else{ctx.strokeStyle='#3acbcc';ctx.lineWidth=10;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(75,25);ctx.bezierCurveTo(45,24,28,54,22,97);ctx.bezierCurveTo(21,117,41,119,55,105);ctx.lineTo(80,83);ctx.lineTo(177,83);ctx.lineTo(202,105);ctx.bezierCurveTo(218,118,239,117,234,96);ctx.bezierCurveTo(227,53,210,24,181,25);ctx.closePath();ctx.stroke();ctx.fillStyle='#cbe7e3';ctx.fillRect(59,48,42,13);ctx.fillRect(73,34,13,42);[['#eb4f99',179,40],['#eab93f',201,60],['#72ccee',159,60],['#8ddca4',179,79]].forEach(function(b){ctx.fillStyle=b[0];ctx.beginPath();ctx.arc(b[1],b[2],8,0,TAU);ctx.fill();});}
        });
        surfaceGraphic(artMap,vet?.095:.415,vet?.119:.207,vet?.177:0,vet?.67:.64);
      }
      rig.root.scale.setScalar(p.scale);rig.root.updateMatrixWorld(true);pending.forEach(function(entry){entry.mesh.bind(new T.Skeleton(entry.bones));});
      rig.bodyStyle='organic-connected-v7';return rig;
    }

    var torso=rig.torso=group(rig.stance,0,1.51,0);
    var upper=roomy?.407:titan?.444:vet?.366:.358;
    var waist=p.waist;
    var bodyRows=[[-.105,waist*.985,p.depth*.99,0,-.004],[-.055,waist*.99,p.depth],[.005,waist,p.depth],[.045,waist*1.015,p.depth*1.01],
      [.13,waist,p.depth],[.28,waist*.995,p.depth*1.01],[.45,waist*1.015,p.depth],
      [.60,upper*.965,p.depth*.985],[.685,upper,p.depth*.96],[.689,upper,p.depth*.96],
      [.785,upper*1.01,p.depth*.91],[.86,upper*.99,p.depth*.855],[.925,upper*.79,p.depth*.73],
      [.98,.193,.147],[1.005,.137,.124],[1.013,.128,.119]];
    if(titan){bodyRows[0]=[-.105,waist*.98,p.depth*.99];bodyRows[1]=[-.058,waist*.991,p.depth];}
    function decal(map,w,h,cy) {
      var pos=[],uv=[],idx=[],n=20;
      for(var dy=0;dy<=n;dy++)for(var dx=0;dx<=n;dx++){
        var u=dx/n,v=dy/n,x=(u-.5)*w,y=(v-.5)*h+cy,row=0;
        while(row<bodyRows.length-2&&bodyRows[row+1][0]<y)row++;
        var lo=bodyRows[row],hi=bodyRows[row+1],t=Math.max(0,Math.min(1,(y-lo[0])/(hi[0]-lo[0])));
        var rx=lo[1]+(hi[1]-lo[1])*t,rz=lo[2]+(hi[2]-lo[2])*t;
        x=(u-.5)*Math.min(w,rx*(titan?1.94:1.80));
        var ang=Math.acos(Math.max(-.98,Math.min(.98,x/rx)));
        var fold=y<.72?Math.cos(ang*7+(row+t)*.36)*(roomy?.016:.008):0;
        pos.push(x,y,(rz+fold)*Math.sin(ang)+.012);uv.push(u,v);
      }
      for(var j=0;j<n;j++)for(var i=0;i<n;i++){var a=j*(n+1)+i;idx.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}
      var g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
      return add(torso,g,new T.MeshStandardMaterial({map:map,transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-1}));
    }
    add(torso,loft(bodyRows,36,function(v,r,ri,a) {
      var tint=roomy&&v.y<.672&&Math.sin(a)>.18&&Math.abs(Math.cos(a))<.90?0xb02151:p.shirt;
      var front=Math.max(0,Math.sin(a));
      // Restrained textile variation, not painted hard bands or armor highlights.
      var crease=(v.y<.6?Math.sin(a*5+.4)*.035:0)+Math.sin(a*3)*.018;
      return color(tint,.86+front*.045+crease);
    },null,function(v,r,ri,a) {
      if(v.y<.72){var fold=Math.cos(a*7+ri*.36)*(roomy?.016:.008);v.x+=Math.cos(a)*fold;v.z+=Math.sin(a)*fold;}
      if(v.y>.75&&v.y<.99)v.y-=Math.pow(Math.abs(Math.cos(a)),1.5)*.06;
      if(v.y>.92)v.y-=Math.max(0,Math.sin(a))*.11*smooth(.92,1.01,v.y);
      if(roomy&&v.y>=.685&&v.y<=.689)v.y+=Math.abs(Math.cos(a))*.055-.025;
    }),cloth);

    // The neck emerges through a real crew-neck opening. The head builder owns
    // facial proportions; it is not scaled up to disguise an undersized body.
    add(torso,loft([[.895,.121,.108],[.97,.118,.107],[1.09,.109,.106],[1.22,.125,.112]],20),skin);
    var collarRows=longSleeves?[[.975,.153,.145],[1.025,.156,.143],[1.115,.146,.130],[1.13,.13,.114]]:
      [[.985,.145,.133],[1.005,.145,.131],[1.018,.132,.120],[1.018,.125,.113]];
    add(torso,loft(collarRows,32,function(){return color(p.shirt,.8);},null,function(v,r,ri,a){v.y-=Math.max(0,Math.sin(a))*(titan?.113:longSleeves?.205:.103);}),cloth);

    if(roomy){
      // The reference is a short windbreaker. A rose placket continues through
      // the blue-violet yoke and collar, with dark snap fasteners.
      var rose=new T.MeshStandardMaterial({color:0xac224d,roughness:.93,metalness:0});
      var strip=new T.BufferGeometry();strip.setAttribute('position',new T.Float32BufferAttribute([
        -.027,-.097,.278,.027,-.097,.278,-.027,.20,.280,.027,.20,.280,-.027,.46,.279,.027,.46,.279,-.027,.67,.267,.027,.67,.267,
        -.027,.87,.252,.027,.87,.252,-.027,.905,.17,.027,.905,.17,-.027,.918,.13,.027,.918,.13],3));
      var stripIndex=[];for(var sp=0;sp<6;sp++){var si=sp*2;stripIndex.push(si,si+1,si+2,si+1,si+3,si+2);}strip.setIndex(stripIndex);strip.computeVertexNormals();add(torso,strip,rose);
      [[-.047,.283],[.185,.285],[.419,.285],[.671,.276],[.881,.243],[.912,.15]].forEach(function(button){var snap=add(torso,new T.CylinderGeometry(.0105,.0105,.006,10),seams);snap.rotation.x=Math.PI/2;snap.position.set(0,button[0],button[1]);});
      line(torso,[[-.35,.06,.166],[-.305,.18,.215],[-.26,.29,.244]],.006,seams);
      line(torso,[[.35,.06,.166],[.305,.18,.215],[.26,.29,.244]],.006,seams);
      add(torso,loft([[-.110,waist*.985,p.depth*1.01],[-.067,waist*.997,p.depth*1.017]],36,function(v,r,ri,a){return color(Math.sin(a)>.10?0x992047:p.shirt);}),cloth);
    }else if(vet){
      var zipMaterial=new T.MeshStandardMaterial({color:0x92754b,roughness:.61,metalness:.28});
      line(torso,[[0,.48,.246],[0,.68,.239],[0,.89,.201],[0,.917,.142]],.0065,zipMaterial);
      var pull=add(torso,new T.TorusGeometry(.024,.0045,5,12),zipMaterial);pull.position.set(0,.765,.235);pull.scale.y=1.48;
      var rib=new T.MeshStandardMaterial({color:0x0d1522,roughness:.98,metalness:0});
      line(torso,[[-.27,.12,.144],[-.235,.255,.185],[-.22,.34,.195]],.006,rib);
      line(torso,[[.27,.12,.144],[.235,.255,.185],[.22,.34,.195]],.006,rib);
      add(torso,loft([[.006,waist*1.014,p.depth*1.02],[.048,waist*1.014,p.depth*1.02]],32,function(){return color(0x0b1424);}),cloth);
      if(typeof document!=='undefined'){
        var crestMap=canvasTexture(T,'veterano-badge',128,160,function(crestContext){
        crestContext.strokeStyle='#a8202c';crestContext.lineWidth=6;crestContext.lineJoin='round';
        crestContext.beginPath();crestContext.moveTo(64,10);crestContext.lineTo(105,70);crestContext.lineTo(64,146);crestContext.lineTo(24,70);crestContext.closePath();crestContext.stroke();
        crestContext.font='bold 77px serif';crestContext.textAlign='center';crestContext.fillStyle='#a8202c';crestContext.fillText('N',64,105);
        });
        var badge=add(torso,new T.PlaneGeometry(.103,.134),new T.MeshStandardMaterial({map:crestMap,transparent:true,depthWrite:false,roughness:1}));badge.position.set(.197,.659,.198);badge.rotation.y=.36;
      }
    }else if(id==='pixel'&&typeof document!=='undefined'){
      var map=canvasTexture(T,'pixel-badge',256,128,function(cx){
      cx.clearRect(0,0,256,128);cx.strokeStyle='#3acbcc';cx.lineWidth=10;cx.lineJoin='round';
      cx.beginPath();cx.moveTo(75,25);cx.bezierCurveTo(45,24,28,54,22,97);cx.bezierCurveTo(21,117,41,119,55,105);cx.lineTo(80,83);cx.lineTo(177,83);cx.lineTo(202,105);cx.bezierCurveTo(218,118,239,117,234,96);cx.bezierCurveTo(227,53,210,24,181,25);cx.closePath();cx.stroke();
      cx.fillStyle='#cbe7e3';cx.fillRect(59,48,42,13);cx.fillRect(73,34,13,42);
      [['#eb4f99',179,40],['#eab93f',201,60],['#72ccee',159,60],['#8ddca4',179,79]].forEach(function(button){cx.fillStyle=button[0];cx.beginPath();cx.arc(button[1],button[2],8,0,TAU);cx.fill();});
      cx.fillStyle='#dd6898';cx.fillRect(112,53,12,5);cx.fillRect(132,53,12,5);
      });
      decal(map,.47,.235,.641);
    }

    if(titan){
      if(window.NeonTitanShirtArtwork){
        var artwork=window.NeonTitanShirtArtwork;
        var artMap=sourceTexture(T,artwork,null,1);
        artMap.colorSpace=T.SRGBColorSpace;
        decal(artMap,.81,.97,.407);
      }
      var silver=new T.MeshStandardMaterial({color:0xcdd5d2,emissive:0x444948,emissiveIntensity:.1,metalness:.2,roughness:.45});
      for(var chain=0;chain<2;chain++)line(torso,[[-.14,1.0,.065],[-.156,.909,.21],[-.11,.842-chain*.021,.253],[0,.827-chain*.025,.265],[.11,.846-chain*.021,.25],[.156,.913,.21],[.14,1.0,.065]],.0125-chain*.0025,silver);
    }

    var head=rig.head=group(torso,0,1.21,vet?.025:.01);
    if(window.NeonFaces)window.NeonFaces.build(T,head,id);
    rig.arms=[];rig.legs=[];

    for(var side=-1;side<=1;side+=2){
      var shoulder=group(torso,side*p.width,roomy?.795:vet?.784:.798,vet?.014:0,true);
      var elbow=group(shoulder,0,-.50,0,true);
      var fist=group(elbow,0,-.535*.92,.015,true);
      var a=p.arm,fore=roomy?.161:titan?.143:vet?.125:.119;
      var armRows;
      if(longSleeves){
        armRows=[[.09,.025,.03],[.045,a*.78,a*.82],[.00,a*.95,a*.91],[-.13,a*1.035,a*.96],[-.275,a*1.025,a*.94],
          [-.395,a*.96,a*.91],[-.475,a*.89,a*.86],[-.54,a*.86,a*.85],[-.645,fore*1.08,fore*1.04],[-.79,fore*1.02,fore*.98],
          [-.88,fore*.93,fore*.88],[-.95,.112,.105],[-.982,.107,.10],[-.988,.087,.079],[-1.034,.084,.08],
          [-1.075,.100,.082,0,.013],[-1.14,.111,.095,0,.024],[-1.205,.108,.086,0,.029],[-1.245,.077,.061,0,.025],[-1.26,.007,.007,0,.021]];
      }else if(titan){
        armRows=[[.082,.012,.014],[.038,a*.73,a*.79],[-.025,a*.97,a*.96],[-.16,a*1.08,a],[-.31,a*1.105,a*1.03],[-.427,a*1.13,a*1.04],[-.47,a*1.11,a*1.035],[-.483,a*1.11,a*1.035],[-.49,.122,.118],[-.54,.129,.124],[-.64,.137,.128],[-.74,.13,.121],[-.86,.109,.104],[-.95,.087,.09],[-1.035,.084,.087],[-1.073,.107,.084,0,.011],[-1.14,.12,.099,0,.026],[-1.205,.115,.092,0,.030],[-1.254,.085,.064,0,.026],[-1.271,.007,.007,0,.022]];
      }else{
        armRows=[[.080,.012,.022],[.035,a*.73,a*.77],[.0,a*.96,a*.945],[-.09,a*1.035,a],[-.19,a*1.025,a*.98],
          [-.262,a*1.01,a*.958],[-.269,a*1.015,a*.96],[-.278,a*.818,a*.80],[-.327,a*.855,a*.79],[-.417,a*.76,a*.71],
          [-.49,a*.714,a*.715],[-.542,fore*.96,fore*.955],[-.622,fore*1.09,fore],[-.733,fore*1.005,fore*.96],
          [-.855,fore*.79,fore*.79],[-.945,fore*.67,fore*.70],[-1.035,fore*.63,fore*.67],
          [-1.073,.101,.079,0,.011],[-1.14,.117,.096,0,.026],[-1.205,.112,.089,0,.030],[-1.254,.082,.06,0,.026],[-1.271,.007,.007,0,.022]];
      }
      skinned(torso,loft(armRows,32,function(v,r,ri,a) {
        var garmentY=v.garmentY;
        var isCloth=longSleeves?garmentY>-.986:titan?garmentY>-.486:garmentY>-.273;
        v.plain=!isCloth;
        var base=isCloth?(roomy&&garmentY<-.95?0xa7244e:p.shirt):p.skin;
        var shade=isCloth?.87+Math.cos(a*5+ri*.34)*.030:1;
        return color(base,shade);
      },armWeights,function(v,r,ri,a){
        v.garmentY=v.y;
        if(ri<3)v.x-=side*(ri===0?.103:ri===1?.056:.023);
        if(longSleeves&&v.y<-.18&&v.y>-.95){var f=Math.sin(a*5+ri*.77)*(roomy?.016:.008);v.x+=Math.cos(a)*f;v.z+=Math.sin(a)*f;}
        // Sculpted knuckle plane instead of four round balls glued to a mitten.
        if(v.y<-1.105&&Math.sin(a)>.3)v.z+=Math.pow(Math.cos(v.x*44),2)*.006;
        if(v.y<-1.035){v.x*=.90;v.z=.015+(v.z-.015)*.90;v.y=-1.035+(v.y+1.035)*.90;}
        if(v.y<-.50)v.y=-.50+(v.y+.50)*.92;
      }),shoulder.position,[shoulder,elbow,fist,torso]);

      // A tapered thumb folds across the fist; only this small independent mesh
      // is separate, and its root stays buried in the continuous palm.
      var thumb=add(fist,loft([[.018,.018,.025,side*.074,.029],[-.023,.038,.036,side*.103,.067],[-.078,.041,.031,side*.094,.090],[-.111,.025,.024,side*.063,.098],[-.13,.007,.01,side*.044,.088]],12),skin);
      thumb.name='folded-thumb';thumb.scale.setScalar(.90);
      if(titan&&side>0){var bracelet=add(elbow,new T.TorusGeometry(.098,.009,6,32),silver);bracelet.rotation.x=Math.PI/2;bracelet.position.y=-.449*.92;}
      var aura=options.glow?options.glow(fist,rig.color,0,0,0,.85,0):new T.Sprite(new T.SpriteMaterial({transparent:true,opacity:0}));
      if(!options.glow)fist.add(aura);aura.visible=false;
      rig.arms.push({shoulder:shoulder,elbow:elbow,fist:fist,aura:aura});

      var hip=group(rig.stance,side*(roomy?.25:.217),1.51,side*.053,true);
      var knee=group(hip,0,-.70,0,true),boot=group(knee,0,-.68,.06,true);
      var thigh=p.thigh,shin=p.shin;
      var legRows=roomy?[[.12,.035,.045],[.04,.121,.12],[-.08,.145,.15],[-.16,.205,.205],[-.24,.236,.229],
        [-.40,.260,.245],[-.55,.279,.25],[-.68,.294,.242],[-.80,shin*.83,shin*.715],
        [-.94,shin*.93,shin*.805],[-1.10,shin*.995,shin*.85],[-1.24,shin*1.04,shin*.90],[-1.35,shin*1.075,shin*.925],[-1.423,shin*1.04,shin*.94],[-1.441,shin*1.017,shin*.919]]:
        [[.12,.035,.045],[.06,.08,.105],[-.08,.116,.126],[-.23,thigh*.975,thigh*.95],[-.4,thigh*.86,thigh*.84],
          [-.555,thigh*.74,thigh*.77],[-.70,thigh*.69,thigh*.73],[-.81,shin*1.075,shin*1.095],[-.95,shin*1.05,shin*1.08],
          [-1.09,shin*.94,shin],[-1.22,shin*.84,shin*.90],[-1.295,shin*.82,shin*.89],[-1.33,shin*.84,shin*.90]];
      if(titan)legRows=[[.12,.05,.055],[.055,.199,.19],[-.08,.239,.217],[-.24,.243,.221],[-.40,.246,.218],[-.54,.246,.21],[-.568,.243,.209],[-.576,.142,.134],[-.655,.139,.136],[-.715,.136,.133],[-.8,.143,.141],[-.93,.148,.145],[-1.035,.132,.128],[-1.103,.12,.115],[-1.11,.125,.12],[-1.15,.117,.111],[-1.235,.095,.089],[-1.3,.087,.086],[-1.334,.087,.086]];
      var trouserLeg=skinned(rig.stance,loft(legRows,32,function(v,r,ri,a) {
        var out=Math.cos(a)*side;
        var seam=Math.pow(Math.max(0,out),32)*.05;
        var bare=titan&&v.y<-.572&&v.y> -1.106,sock=titan&&v.y<=-1.106;v.plain=bare;
        var wash=roomy?Math.max(0,Math.sin(a))*(realDenim?.075:.28)*Math.exp(-Math.pow((v.y+.52)/.46,2)):0;
        var dye=color(bare?p.skin:sock?0xc3cecd:trouserColor,bare?1:.87-seam+Math.cos(a*(sock?18:5)+ri*.5)*(roomy?.045:.018));
        if(wash)dye.lerp(new T.Color(realDenim?0xe1e2e4:0x8191a4),wash);
        return dye;
      },legWeights,function(v,r,ri,a){
        // Bury the upper inseam inside the continuous pelvis rather than
        // leaving two detached tubes and a protruding central wedge.
        if(v.y>-.30)v.x-=side*.060*smooth(-.30,.10,v.y);
        var fold=roomy?.017:.005;
        if(ri>1&&!(titan&&v.y<-.57)){v.x+=Math.cos(a)*Math.sin(a*5+ri*.31)*fold;v.z+=Math.sin(a)*Math.sin(a*5+ri*.31)*fold;}
        if(roomy&&v.y<-.28){var diagonal=Math.sin(a*2.3+v.y*22)*.022*Math.exp(-Math.pow((v.y+.77)/.48,2));v.z+=Math.max(0,Math.sin(a))*diagonal;v.x+=Math.cos(a)*diagonal*.45;}
        if(roomy&&ri>8)v.y+=Math.cos(a*3+side)*.020;
      }),hip.position,[hip,knee,boot]);
      if(jeans)trouserLeg.material=pantsMaterial;

      if(jeans){
        var stitchPos=[],stitchIndex=[],stitchBones=[],stitchWeights=[];
        function trouserSurface(y,a){
          var row=0;while(row<legRows.length-2&&legRows[row+1][0]>y)row++;
          var lo=legRows[row],hi=legRows[row+1],f=(y-lo[0])/(hi[0]-lo[0]);
          var rx=lo[1]+(hi[1]-lo[1])*f,rz=lo[2]+(hi[2]-lo[2])*f;
          var fold=Math.sin(a*5+(row+f)*.31)*(roomy?.017:.005);
          var x=Math.cos(a)*(rx+fold+.004),z=Math.sin(a)*(rz+fold+.004);
          if(y>-.30)x-=side*.060*smooth(-.30,.10,y);
          if(roomy&&y<-.28){var diagonal=Math.sin(a*2.3+y*22)*.022*Math.exp(-Math.pow((y+.77)/.48,2));z+=Math.max(0,Math.sin(a))*diagonal;x+=Math.cos(a)*diagonal*.45;}
          return[x,y,z];
        }
        function stitchQuad(a,b,c,d){
          var offset=stitchPos.length/3;[a,b,c,d].forEach(function(point){stitchPos.push(point[0],point[1],point[2]);var weight=legWeights(point[1]);stitchBones.push(0,1,2,0);stitchWeights.push(weight[0],weight[1],0,0);});
          stitchIndex.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
        }
        var seamAngle=side>0?.27:Math.PI-.27;
        for(var seamLine=0;seamLine<2;seamLine++)for(var thread=0;thread<27;thread++){
          var top=-.20-thread*.042,bottom=top-.023,angle=seamAngle+seamLine*.040;
          stitchQuad(trouserSurface(top,angle-.006),trouserSurface(top,angle+.006),trouserSurface(bottom,angle+.006),trouserSurface(bottom,angle-.006));
        }
        var hem=roomy?-1.405:-1.30;
        for(var hemLine=0;hemLine<2;hemLine++)for(var hemStitch=0;hemStitch<58;hemStitch++){
          var ha=hemStitch/58*TAU,hy=hem+hemLine*.025;
          stitchQuad(trouserSurface(hy-.002,ha),trouserSurface(hy-.002,ha+.065),trouserSurface(hy+.002,ha+.065),trouserSurface(hy+.002,ha));
        }
        var stitchGeometry=new T.BufferGeometry();stitchGeometry.setAttribute('position',new T.Float32BufferAttribute(stitchPos,3));stitchGeometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(stitchBones,4));stitchGeometry.setAttribute('skinWeight',new T.Float32BufferAttribute(stitchWeights,4));stitchGeometry.setIndex(stitchIndex);stitchGeometry.computeVertexNormals();
        var stitching=skinned(rig.stance,stitchGeometry,hip.position,[hip,knee,boot]);stitching.material=new T.MeshStandardMaterial({color:0x8a775a,roughness:.94,metalness:0,side:T.DoubleSide});stitching.name='denim-double-stitch';
      }

      if(titan&&side>0&&typeof document!=='undefined'){
        var initialsMap=canvasTexture(T,'titan-initials',256,192,function(letters){
        letters.fillStyle='#ffffff';letters.font='italic 900 151px Arial Black, Arial, sans-serif';letters.textAlign='center';letters.fillText('AS',127,153);
        });
        var ip=[],iu=[],ii=[],isi=[],isw=[];
        for(var py=0;py<=8;py++)for(var px=0;px<=8;px++){
          var sx=(px/8-.5)*.286+.045,sy=(py/8-.5)*.218-.419;
          ip.push(sx,sy,Math.sqrt(Math.max(.01,1-Math.pow(sx/.25,2)))*.216+.009);iu.push(px/8,py/8);
          var lw=legWeights(sy);isi.push(0,1,2,0);isw.push(lw[0],lw[1],0,0);
        }
        for(var jy=0;jy<8;jy++)for(var jx=0;jx<8;jx++){var at=jy*9+jx;ii.push(at,at+1,at+9,at+1,at+10,at+9);}
        var ig=new T.BufferGeometry();ig.setAttribute('position',new T.Float32BufferAttribute(ip,3));ig.setAttribute('uv',new T.Float32BufferAttribute(iu,2));ig.setAttribute('skinIndex',new T.Uint16BufferAttribute(isi,4));ig.setAttribute('skinWeight',new T.Float32BufferAttribute(isw,4));ig.setIndex(ii);ig.computeVertexNormals();
        var badge=skinned(rig.stance,ig,hip.position,[hip,knee,boot]);badge.material=new T.MeshStandardMaterial({map:initialsMap,transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-1});
      }

      // A longitudinal shoe last gives a heel, arch, raised instep and flat toe.
      var footRows=[[-.16,.002,.002,0,.055],[-.155,.055,.045,0,.055],[-.126,.119,.074,0,.045],[-.025,.134,.093,0,.047],
        [.076,.141,.100,0,.037],[.17,.145,.082,0,.017],[.278,.126,.058,0,.001],[.318,.074,.042,0,-.004],[.327,.01,.018,0,-.005],[.329,.001,.001,0,-.005]];
      var foot=loft(footRows,20,null,null,function(v,r,ri,a){
        var along=v.y;v.y=v.z;v.z=along;
        if(v.y<-.05)v.y=-.05;
      });
      // Swapping y and z reverses handedness, so restore outward triangle order.
      var footIndex=foot.index.array;for(var ft=0;ft<footIndex.length;ft+=3){var swap=footIndex[ft+1];footIndex[ft+1]=footIndex[ft+2];footIndex[ft+2]=swap;}foot.computeVertexNormals();
      add(boot,foot,shoeMaterial);
      if(!roomy){
        var laceMat=new T.MeshStandardMaterial({color:titan?0xc2c9c7:0x999e9c,roughness:1,metalness:0});
        for(var lace=0;lace<3;lace++)line(boot,[[-.06,.123-lace*.012,.031+lace*.041],[0,.13-lace*.012,.047+lace*.041],[.06,.12-lace*.012,.035+lace*.041]],.005,laceMat);
      }
      rig.legs.push({hip:hip,knee:knee,boot:boot});
    }
    // A single continuous pelvis joins both trouser legs. The waistband stays
    // under the shirt while the crotch blends into the two moving hip bones.
    var pelvisWidth=roomy?.379:titan?.366:p.waist*.92;
    var pelvisRows=[[-.24,.035,.023],[-.217,.084,.038],[-.17,pelvisWidth*.60,.091],[-.09,pelvisWidth*.94,p.depth*.69],[-.005,pelvisWidth,p.depth*.91],[.09,pelvisWidth*.91,p.depth*.84],[.125,.22,.15]];
    var pelvisMesh=skinned(rig.stance,loft(pelvisRows,36,function(v,r,ri,a){return color(trouserColor,.87+Math.max(0,Math.sin(a))*.035);},function(y,v){
      var anchor=.60+.37*smooth(-.25,.055,y),right=smooth(-.22,.22,v.x);return[(1-right)*(1-anchor),right*(1-anchor),anchor];
    },function(v,r,ri,a){if(roomy&&ri>1){var fold=Math.cos(a*7+ri*.3)*.004;v.x+=Math.cos(a)*fold;v.z+=Math.sin(a)*fold;}}),new T.Vector3(0,1.51,0),[rig.legs[0].hip,rig.legs[1].hip,rig.stance]);
    pelvisMesh.material=pantsMaterial;pelvisMesh.name='continuous-pelvis';rig.pelvis=pelvisMesh;
    rig.root.scale.setScalar(p.scale);
    rig.root.updateMatrixWorld(true);
    pending.forEach(function(entry){entry.mesh.bind(new T.Skeleton(entry.bones));});
    rig.bodyStyle='continuous-skinned-v5';
    return rig;
  }

  window.NeonHumans={build:build};
}());
