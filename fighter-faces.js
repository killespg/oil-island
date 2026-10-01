/* NEON CLASH — sculpted heads with a shared, projected portrait atlas. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var atlasCache = null;
  var scalpGrainCache = null;
  // [source image y, half-width in world space, half-width in the portrait].
  // The outside edge remains inside the painted silhouette at every height.
  var definitions = {
    veterano: {
      cell: [0, 0], top: .035, bottom: .875, height: .535, skin: 0xb78568,
      hair: 0x99948b, beard: 0x8a8070, eyes: .423, nose: .55, mouth: .687,
      sideHair: .355, backHair: .57,
      rows: [[.035,.006,.010],[.06,.092,.145],[.105,.147,.224],[.18,.179,.265],[.26,.184,.273],
        [.355,.172,.244],[.44,.165,.228],[.53,.163,.232],[.635,.150,.213],[.73,.132,.193],
        [.80,.107,.160],[.847,.065,.104],[.875,.003,.007]]
    },
    titan: {
      cell: [1, 0], top: .032, bottom: .902, height: .552, skin: 0x855236,
      hair: 0x211f1e, beard: 0x252322, eyes: .450, nose: .567, mouth: .704,
      sideHair: .31, backHair: .57,
      rows: [[.032,.006,.010],[.057,.092,.145],[.10,.148,.229],[.18,.184,.278],[.25,.188,.277],
        [.35,.180,.267],[.45,.177,.251],[.54,.176,.246],[.64,.165,.229],[.735,.145,.211],
        [.815,.121,.175],[.869,.082,.118],[.902,.003,.008]]
    },
    mimico: {
      cell: [0, 1], top: .023, bottom: .828, height: .525, skin: 0xd2a17d,
      hair: 0x382a21, beard: 0x856b53, eyes: .407, nose: .535, mouth: .642,
      sideHair: .345, backHair: .535,
      rows: [[.023,.005,.008],[.053,.091,.142],[.115,.156,.235],[.205,.192,.300],[.282,.202,.319],
        [.321,.203,.320],[.338,.194,.301],[.345,.169,.249],[.43,.166,.242],
        [.52,.161,.229],[.63,.145,.212],[.722,.117,.180],[.79,.075,.116],[.828,.003,.008]]
    },
    pixel: {
      cell: [1, 1], top: .112, bottom: .897, height: .538, skin: 0xcf9b79,
      hair: 0x1265a3, beard: 0xb62968, eyes: .476, nose: .596, mouth: .697,
      sideHair: .365, backHair: .55,
      rows: [[.112,.006,.014],[.142,.076,.123],[.19,.139,.218],[.25,.166,.259],[.325,.172,.268],
        [.405,.174,.262],[.49,.174,.259],[.575,.165,.247],[.68,.159,.240],[.775,.139,.213],
        [.835,.106,.165],[.879,.057,.087],[.897,.003,.007]]
    }
  };

  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp(t) { return Math.max(0, Math.min(1, t)); }
  function smooth(a, b, v) { var t = clamp((v-a)/(b-a)); return t*t*(3-2*t); }
  function bell(v, center, width) { var d = (v-center)/width; return Math.exp(-d*d); }
  function profile(d, value, column) {
    for (var i=1; i<d.rows.length; i++) {
      if (value <= d.rows[i][0]) {
        var before=d.rows[i-1], after=d.rows[i];
        return mix(before[column],after[column],clamp((value-before[0])/(after[0]-before[0])));
      }
    }
    return d.rows[d.rows.length-1][column];
  }
  function level(d, sourceY) { return .275-(sourceY-d.top)/(d.bottom-d.top)*d.height; }

  function sampleRows(d) {
    var rows=[];
    for(var r=0;r<=48;r++)rows.push(mix(d.top,d.bottom,r/48));
    d.rows.forEach(function(row){rows.push(row[0]);});
    rows.sort(function(a,b){return a-b;});
    return rows.filter(function(value,index){return !index||value-rows[index-1]>.00001;});
  }

  function rearPoint(d,sourceY,angle) {
    var t=clamp((sourceY-d.top)/(d.bottom-d.top));
    var radius=profile(d,sourceY,1),sine=Math.sin(angle),cosine=Math.cos(angle),rear=Math.max(0,-cosine);
    // The occiput has its own oval profile. A face extruded straight backward
    // creates a vertical wall; a real skull is fullest above the ear and tapers
    // into the neck, with the jaw rising behind the chin.
    var outline=[[0,.018],[.055,.102],[.15,.166],[.29,.198],[.43,.195],[.57,.172],[.71,.129],[.83,.091],[1,.066]];
    var depth=outline[outline.length-1][1];
    for(var i=1;i<outline.length;i++)if(t<=outline[i][0]){
      depth=mix(outline[i-1][1],outline[i][1],smooth(outline[i-1][0],outline[i][0],t));break;
    }
    return {
      x:sine*radius*(1+.035*rear*bell(t,.38,.26)),
      y:level(d,sourceY)+.115*smooth(.53,.96,t)*Math.pow(rear,1.8),
      z:cosine*depth-.013
    };
  }

  function scalpGrain(T) {
    if(typeof document==='undefined')return null;
    if(scalpGrainCache&&scalpGrainCache.engine===T)return scalpGrainCache.texture;
    var canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
    var context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height),seed=382901;
    for(var y=0;y<canvas.height;y++)for(var x=0;x<canvas.width;x++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      var strand=Math.sin(x*1.81+Math.sin(y*.035)*1.5)*4+Math.sin(x*.71+y*.095)*2;
      var value=240+strand+(seed>>>28)-7,at=(y*canvas.width+x)*4;
      pixels.data[at]=pixels.data[at+1]=pixels.data[at+2]=value;pixels.data[at+3]=255;
    }
    context.putImageData(pixels,0,0);
    var texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    texture.wrapS=T.RepeatWrapping;texture.wrapT=T.ClampToEdgeWrapping;texture.anisotropy=4;
    scalpGrainCache={engine:T,texture:texture};return texture;
  }

  function atlas(T) {
    var source = global.NeonFaceAtlas;
    if (!source) return null;
    if (!atlasCache || atlasCache.engine!==T || atlasCache.source!==source) {
      var texture = new T.TextureLoader().load(source);
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
      texture.magFilter = T.LinearFilter;
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.anisotropy = 4;
      atlasCache = {engine:T, source:source, texture:texture,
        material:new T.MeshBasicMaterial({map:texture,color:0xffffff})};
    }
    return atlasCache;
  }

  function headGeometry(T, d, front) {
    var samples=sampleRows(d), positions=[], uv=[], colors=[], indices=[], segments=40;
    samples.forEach(function(sourceY) {
      var radius=profile(d,sourceY,1), imageRadius=profile(d,sourceY,2);
      var headDepth=.163*Math.pow(Math.max(.015,radius/.181),.48);
      for(var s=0;s<=segments;s++) {
        var angle=(front?-.5:.5)*Math.PI+s/segments*Math.PI;
        var sine=Math.sin(angle), cosine=Math.cos(angle), x=sine*radius;
        var z=cosine*headDepth-.013;
        if(front) {
          // The portrait follows actual brow, orbital, nasal, lip and chin planes.
          // The nose is part of this surface, with no separate sphere or mask.
          var features=.026*bell(x,0,.024)*bell(sourceY,d.nose-.075,.079)
            +.061*bell(x,0,.029)*bell(sourceY,d.nose,.034)
            +.015*bell(x,0,.055)*bell(sourceY,d.nose+.016,.019)
            -.013*(bell(x,-.065,.035)+bell(x,.065,.035))*bell(sourceY,d.eyes,.041)
            +.010*(bell(x,-.079,.04)+bell(x,.079,.04))*bell(sourceY,d.eyes+.11,.080)
            +.011*bell(x,0,.061)*bell(sourceY,d.mouth,.031)
            +.013*bell(x,0,.074)*bell(sourceY,d.bottom-.061,.065);
          z+=features*Math.pow(Math.max(0,cosine),3);
        }
        var rear=front?null:rearPoint(d,sourceY,angle);
        positions.push(rear?rear.x:x,rear?rear.y:level(d,sourceY),rear?rear.z:z);
        var imageX=.498+sine*imageRadius;
        if(front)uv.push((d.cell[0]+imageX)*.5,1-(d.cell[1]+sourceY)*.5);
        else uv.push(s/segments,1-(sourceY-d.top)/(d.bottom-d.top));
        var edge=Math.abs(sine), skin=new T.Color(d.skin), hair=new T.Color(d.hair), beard=new T.Color(d.beard);
        var threshold=mix(d.backHair,d.sideHair,Math.pow(edge,4));
        var hairy=1-smooth(threshold-.012,threshold+.012,sourceY);
        // Pixel's temples are clipped close; the tied blue crown stays on top.
        if(d===definitions.pixel&&sourceY>.285)hair.set(0x504640);
        skin.lerp(hair,hairy);
        var beardCoverage=smooth(.56,.70,sourceY)*smooth(.56,.87,edge)*(1-hairy);
        if(d===definitions.mimico)beardCoverage*=.12;
        skin.lerp(beard,beardCoverage);
        skin.multiplyScalar(front?.73+.27*edge:.90+.10*edge);
        colors.push(skin.r,skin.g,skin.b);
      }
    });
    for(var row=0;row<samples.length-1;row++)for(var col=0;col<segments;col++){
      var a=row*(segments+1)+col,b=a+1,c=a+segments+1,e=c+1;
      indices.push(a,c,b,b,c,e);
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    return geometry;
  }

  function portraitTransition(T,d) {
    var samples=sampleRows(d),positions=[],uv=[],colors=[],indices=[],segments=12;
    for(var side=-1;side<=1;side+=2){
      var start=positions.length/3;
      samples.forEach(function(sourceY){
        for(var s=0;s<=segments;s++){
          var t=s/segments,angle=side*(Math.PI*.5+t*.38),point=rearPoint(d,sourceY,angle);
          positions.push(point.x+Math.sin(angle)*.0012,point.y,point.z+Math.cos(angle)*.0012);
          uv.push((d.cell[0]+.498+Math.sin(angle)*profile(d,sourceY,2))*.5,1-(d.cell[1]+sourceY)*.5);
          colors.push(1,1,1,1-smooth(.02,1,t));
        }
      });
      for(var row=0;row<samples.length-1;row++)for(var col=0;col<segments;col++){
        var a=start+row*(segments+1)+col,b=a+1,c=a+segments+1,e=c+1;
        if(side>0)indices.push(a,c,b,b,c,e);else indices.push(a,b,c,b,e,c);
      }
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,4));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
  }

  function earGeometry(T,d,side) {
    var positions=[],colors=[],indices=[],segments=24,rings=12;
    var cy=level(d,d.eyes+.065),cx=side*(profile(d,d.eyes+.065,1)-.003);
    for(var r=0;r<=rings;r++)for(var i=0;i<=segments;i++){
      var p=r/rings,angle=i/segments*TAU;
      var c=Math.cos(angle),s=Math.sin(angle);
      var earWidth=.013*(1+.11*s),earHeight=.061;
      var y=cy+p*s*earHeight;
      // The rolled rim, concha and small tragus share one folded ear shell.
      var ridge=.010*bell(p,.81,.17);
      var x=cx+side*(.016+p*c*earWidth+ridge-.005*(1-p*p));
      var z=-.013+p*c*.037+.005*p*s;
      positions.push(x,y,z);
      var color=new T.Color(d.skin);
      color.multiplyScalar(.78+.20*p+.04*Math.max(0,s));
      colors.push(color.r,color.g,color.b);
    }
    for(var row=0;row<rings;row++)for(var col=0;col<segments;col++){
      var a=row*(segments+1)+col,b=a+1,c=a+segments+1,e=c+1;
      if(side>0)indices.push(a,c,b,b,c,e);else indices.push(a,b,c,b,e,c);
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }

  function addMesh(T,parent,geometry,material,name) {
    var mesh=new T.Mesh(geometry,material);mesh.name=name||'';mesh.castShadow=true;
    // The atlas already contains its diffuse shading; neon light must not erase
    // skin tone or make the eyes turn into luminous dots.
    mesh.receiveShadow=false;parent.add(mesh);return mesh;
  }
  function tube(T,parent,points,radius,material,name) {
    var path=new T.CatmullRomCurve3(points.map(function(p){return new T.Vector3(p[0],p[1],p[2]);}));
    return addMesh(T,parent,new T.TubeGeometry(path,points.length*4,radius,6,false),material,name);
  }

  function hairDetailGeometry(T,d,id) {
    var positions=[],indices=[],colors=[];
    var count=id==='pixel'?14:id==='veterano'?16:0;
    for(var strand=0;strand<count;strand++){
      var start=positions.length/3,phase=strand*2.39996323;
      var angle=phase%TAU,spread=id==='pixel'?.017:.085;
      var rootX=Math.cos(angle)*spread,rootZ=Math.sin(angle)*spread-.013;
      var baseY=id==='pixel'?.246:.237;
      var height=id==='pixel'?.084+(strand%4)*.009:.026+(strand%4)*.003;
      for(var segment=0;segment<=9;segment++){
        var t=segment/9;
        var reachX=id==='pixel'?.060:.055,reachZ=id==='pixel'?.044:.032;
        var x=rootX+Math.cos(angle)*t*t*reachX;
        var y=baseY+Math.sin(t*Math.PI*.64)*height;
        var z=rootZ+Math.sin(angle)*t*t*reachZ;
        var tangent=new T.Vector3(Math.cos(angle)*2*t*reachX,Math.cos(t*Math.PI*.64)*Math.PI*.64*height,Math.sin(angle)*2*t*reachZ).normalize();
        var across=new T.Vector3().crossVectors(tangent,new T.Vector3(0,0,1)).normalize();
        var other=new T.Vector3().crossVectors(tangent,across).normalize();
        var radius=(id==='pixel'?.010:.004)*(1-t)*(.75+.25*Math.sin(t*Math.PI));
        for(var side=0;side<=6;side++){
          var a=side/6*TAU;
          var ca=Math.cos(a)*radius,sa=Math.sin(a)*radius;
          positions.push(x+across.x*ca+other.x*sa,y+across.y*ca+other.y*sa,z+across.z*ca+other.z*sa);
          var color=new T.Color(id==='pixel'?(strand%3?0x0864a8:0x1687c2):(strand%3?0xb2aca0:0xddd7ca));
          colors.push(color.r,color.g,color.b);
        }
      }
      for(var r=0;r<9;r++)for(var s=0;s<6;s++){
        var a=start+r*7+s,b=a+1,c=a+7,e=c+1;indices.push(a,b,c,b,e,c);
      }
    }
    if(!count)return null;
    var geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }

  function bucketHat(T,head) {
    // One continuous cotton shell runs from the gently rounded crown down into
    // a soft, sloping brim. The side brim hangs lower than the front opening.
    var rows=[[.305,.004,.004],[.302,.084,.076],[.293,.147,.131],
      [.275,.178,.155],[.236,.187,.161],[.194,.195,.171],[.164,.202,.178],
      [.149,.215,.192],[.123,.234,.214],[.090,.251,.235],[.059,.269,.256],[.039,.282,.270]];
    var positions=[],colors=[],indices=[],segments=64,edge=[],crownSeam=[];
    rows.forEach(function(row,index){
      var brim=clamp((index-6)/(rows.length-7));
      for(var segment=0;segment<=segments;segment++){
        var a=segment/segments*TAU,s=Math.sin(a),c=Math.cos(a);
        var fold=Math.sin(a*5+.4)*.0027+Math.sin(a*9-.8)*.0012;
        var sideDrop=.033*Math.max(0,c)-.050*s*s;
        var y=row[0]+brim*sideDrop+fold*(.25+brim);
        var x=s*(row[1]+fold*(.5+brim));
        var z=c*(row[2]+fold*(.5+brim))-.013;
        positions.push(x,y,z);
        var shade=.94+Math.cos(a*5+.4)*.025+Math.max(0,c)*.022;
        var color=new T.Color(0xe8e7e0).multiplyScalar(shade);
        colors.push(color.r,color.g,color.b);
        if(index===rows.length-1&&segment%2===0)edge.push([x,y-.001,z]);
        if(index===6&&segment%2===0)crownSeam.push([x+s*.0015,y+.003,z+c*.0015]);
      }
    });
    for(var row=0;row<rows.length-1;row++)for(var col=0;col<segments;col++){
      var a=row*(segments+1)+col,b=a+1,c=a+segments+1,e=c+1;
      indices.push(a,c,b,b,c,e);
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    addMesh(T,head,geometry,new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:1,metalness:0,side:T.DoubleSide}),'titan-white-cotton-bucket');
    tube(T,head,edge,.0017,new T.MeshStandardMaterial({color:0xbab9b0,roughness:1,metalness:0}),'bucket-sewn-brim');
    tube(T,head,crownSeam,.0020,new T.MeshStandardMaterial({color:0xc1c0b7,roughness:1,metalness:0}),'bucket-crown-stitch');
  }

  function sunglasses(T,head,d,frame) {
    var positions=[],colors=[],indices=[],segments=48;
    var centerY=level(d,d.eyes)-.004;
    function vertex(x,y,color){
      // Follow the face across the temples, while remaining in front of the
      // entire old painted lens and frame. Nothing transparent remains exposed.
      var z=.193-.088*Math.pow(x/.19,2);
      positions.push(x,y,z);colors.push(color.r,color.g,color.b);
      return positions.length/3-1;
    }
    for(var side=-1;side<=1;side+=2){
      var centerX=side*.085,center=vertex(centerX,centerY,new T.Color(0x080e16));
      var inner=[],outer=[];
      for(var i=0;i<=segments;i++){
        var angle=i/segments*TAU,c=Math.cos(angle),s=Math.sin(angle);
        var sx=Math.sign(c)*Math.pow(Math.abs(c),.70),sy=Math.sign(s)*Math.pow(Math.abs(s),.78);
        var lens=new T.Color(0x070b11).lerp(new T.Color(0x18232d),Math.max(0,-sy)*.50);
        inner.push(vertex(centerX+sx*.083,centerY+sy*.059,lens));
        outer.push(vertex(centerX+sx*.094,centerY+sy*.070,new T.Color(0x07090c)));
      }
      for(var s=0;s<segments;s++){
        indices.push(center,inner[s],inner[s+1]);
        indices.push(inner[s],outer[s],inner[s+1],inner[s+1],outer[s],outer[s+1]);
      }
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    addMesh(T,head,geometry,new T.MeshBasicMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide}),'titan-opaque-black-sunglasses');
    tube(T,head,[[-.032,centerY+.027,.199],[0,centerY+.037,.211],[.032,centerY+.027,.199]],.0085,frame,'sunglasses-black-bridge');
  }

  function build(T,head,id) {
    var d=definitions[id]||definitions.veterano,shared=atlas(T);
    var vertexMaterial=new T.MeshBasicMaterial({color:0xffffff,vertexColors:true,side:T.DoubleSide});
    var grain=scalpGrain(T);
    var scalpMaterial=new T.MeshStandardMaterial({color:0xb5b5b5,vertexColors:true,map:grain,bumpMap:grain,bumpScale:.0011,roughness:.94,metalness:0,side:T.DoubleSide});
    var front=headGeometry(T,d,true),back=headGeometry(T,d,false);
    addMesh(T,head,front,shared?shared.material:new T.MeshBasicMaterial({color:d.skin}),'sculpted-portrait-'+id);
    addMesh(T,head,back,scalpMaterial,'continuous-cranium-'+id);
    if(shared){
      var blend=new T.MeshBasicMaterial({map:shared.texture,color:0xffffff,vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide});
      addMesh(T,head,portraitTransition(T,d),blend,'blended-temples-'+id).castShadow=false;
    }
    for(var side=-1;side<=1;side+=2)addMesh(T,head,earGeometry(T,d,side),vertexMaterial,'ear-'+side);

    var detail=hairDetailGeometry(T,d,id);
    if(detail)addMesh(T,head,detail,vertexMaterial,'continuous-hair-strands');
    if(id==='mimico') {
      // A perfectly level fringe edge; the cap's curved cross-section changes
      // depth, never its height. Individual locks do not create a jagged fringe.
      var fringeY=level(d,.338),points=[];
      for(var f=0;f<=20;f++){
        var a=mix(-1.30,1.30,f/20);
        points.push([Math.sin(a)*.194,fringeY,.163*Math.cos(a)-.010]);
      }
      tube(T,head,points,.003,new T.MeshBasicMaterial({color:d.hair}),'straight-bowl-fringe');
    }
    if(id==='titan'||id==='mimico'||id==='pixel'){
      var frame=new T.MeshStandardMaterial({color:id==='mimico'?0xe35b0d:id==='titan'?0x07090c:0x232321,roughness:.42,metalness:.08});
      var eyeY=level(d,d.eyes)+.013;
      for(var sign=-1;sign<=1;sign+=2){
        var titan=id==='titan';
        tube(T,head,[[sign*.150,eyeY,titan?.144:.101],[sign*.183,eyeY+.002,titan?.081:.065],[sign*(titan?.191:.186),eyeY-.003,-.021],[sign*(titan?.179:.177),eyeY-.020,-.044]],titan?.008:.004,frame,'glasses-temple-'+sign);
      }
      if(id==='titan') {
        sunglasses(T,head,d,frame);
        bucketHat(T,head);
        var silver=new T.MeshStandardMaterial({color:0xbfc1b8,roughness:.36,metalness:.62});
        var earX=.220,earY=level(d,d.eyes+.145);
        tube(T,head,[[earX,earY+.009,.018],[earX+.010,earY+.005,.023],[earX+.013,earY-.013,.025],[earX+.007,earY-.024,.023],[earX,earY-.014,.019]],.0035,silver,'earring-ring');
        tube(T,head,[[earX+.006,earY-.021,.024],[earX+.006,earY-.073,.024]],.0038,silver,'earring-cross-stem');
        tube(T,head,[[earX-.009,earY-.038,.024],[earX+.021,earY-.038,.024]],.0038,silver,'earring-cross-arm');
      }
    }
    // Preserve the portrait's internal proportions while balancing the head
    // against the articulated body. The body's collar is fitted to the scaled
    // jaw; enlarging only the face plane would create a visible mask edge.
    head.scale.setScalar(1.06);
    head.userData.faceStyle='sculpted-atlas-v5';
    head.userData.character=id;
    return head;
  }

  global.NeonFaces={build:build};
}(typeof window!=='undefined'?window:globalThis));
