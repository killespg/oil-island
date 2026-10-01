/* Orelha: an articulated adult mixed-breed dog, authored from the supplied reference. */
(function () {
  'use strict';
  var TAU = Math.PI * 2;
  var shared;

  function build(T, rig) {
    var colors = {
      coal: new T.Color(0x34342e), back: new T.Color(0x353027),
      brown: new T.Color(0x705c45), tan: new T.Color(0xad9069), warm: new T.Color(0xc4a87a),
      grey: new T.Color(0xc3c4bd), dark: new T.Color(0x171b1d)
    };
    var clamp = T.MathUtils.clamp;
    function group(parent, x, y, z) {
      var g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g;
    }
    function bone(parent, x, y, z) {
      var b = new T.Bone(); b.position.set(x || 0, y || 0, z || 0); parent.add(b); return b;
    }
    function smooth(a, b, value) {
      var t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t);
    }
    function noise(x, y, z) {
      var n = Math.sin(x * 137.31 + y * 71.19 + z * 223.47) * 43758.5453;
      return n - Math.floor(n);
    }
    if (!shared || shared.THREE !== T) {
      // The coat has a soft underfur layer and tapered directional guard hairs.
      // Both maps are opaque and shared by every Orelha instance.
      var size = 512, pixels = new Uint8Array(size * size * 4);
      var heightPixels = new Uint8Array(size * size * 4);
      for (var py = 0; py < size; py++) for (var px = 0; px < size; px++) {
        var grain = noise(px, py, 7);
        var undercoat = Math.sin(px * .061 + Math.sin(py * .039) * 1.7) * 8 + Math.sin(py * .098 + px * .021) * 5;
        var v = Math.round(193 + undercoat + grain * 17);
        var at = (py * size + px) * 4;
        pixels[at] = pixels[at + 1] = pixels[at + 2] = v; pixels[at + 3] = 255;
        heightPixels[at] = heightPixels[at + 1] = heightPixels[at + 2] = 108 + Math.round(grain * 14); heightPixels[at + 3] = 255;
      }
      function hairPixel(x, y, tone, elevation, strength) {
        var ix = ((Math.floor(x) % size) + size) % size, iy = ((Math.floor(y) % size) + size) % size;
        var offset = (iy * size + ix) * 4;
        var value = Math.round(pixels[offset] * (1 - strength) + tone * strength);
        var raised = Math.round(heightPixels[offset] * (1 - strength) + elevation * strength);
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
        heightPixels[offset] = heightPixels[offset + 1] = heightPixels[offset + 2] = raised;
      }
      for (var hair = 0; hair < 15500; hair++) {
        var hx = noise(hair, 1, 21) * size, hy = noise(hair, 2, 31) * size;
        var length = 7 + noise(hair, 3, 41) * 22, bend = (noise(hair, 4, 51) - .5) * 5;
        var lean = (noise(hair, 5, 61) - .5) * 7, tone = 167 + noise(hair, 6, 71) * 87;
        for (var step = 0; step <= length; step++) {
          var t = step / length, taper = Math.pow(Math.sin(t * Math.PI), .38);
          var xx = hx + lean * t + bend * Math.sin(t * Math.PI), yy = hy + step;
          // A dark root edge and one soft lit ridge give individual short hairs depth.
          hairPixel(xx + 1, yy, tone * .61, 82, taper * .44);
          hairPixel(xx, yy, tone, 157 + taper * 64, taper * .85);
          hairPixel(xx - 1, yy, tone * .91, 145, taper * .22);
        }
      }
      function coatTexture(data) {
        var texture = new T.DataTexture(data, size, size, T.RGBAFormat);
        texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.magFilter = T.LinearFilter; texture.minFilter = T.LinearMipmapLinearFilter;
        texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
      }
      var furMap = coatTexture(pixels), furBump = coatTexture(heightPixels);
      furMap.colorSpace = T.SRGBColorSpace;
      shared = {
        THREE: T,
        fur: new T.MeshStandardMaterial({color: 0xffffff, vertexColors: true, map: furMap, bumpMap: furBump, bumpScale: .0028, roughness: .96, metalness: 0}),
        wet: new T.MeshStandardMaterial({color: 0x171b1c, roughness: .58, metalness: 0}),
        mouth: new T.MeshStandardMaterial({color: 0x0c1010, roughness: .88, metalness: 0}),
        tongue: new T.MeshStandardMaterial({color: 0x9f6d72, roughness: .74, metalness: 0}),
        iris: new T.MeshStandardMaterial({color: 0x4d3b2b, roughness: .56, metalness: 0}),
        gleam: new T.MeshBasicMaterial({color: 0xd2c7ac})
      };
    }

    if (window.NeonFurTexture && shared.furSource !== window.NeonFurTexture) {
      // The supplied grayscale coat preserves each anatomical vertex colour.
      // Assign the texture immediately so the low-quality material shares it too.
      var referenceFur = new T.TextureLoader().load(window.NeonFurTexture);
      referenceFur.colorSpace = T.SRGBColorSpace;
      referenceFur.wrapS = referenceFur.wrapT = T.RepeatWrapping;
      referenceFur.magFilter = T.LinearFilter; referenceFur.minFilter = T.LinearMipmapLinearFilter;
      referenceFur.anisotropy = 4;
      shared.fur.map = referenceFur; shared.fur.needsUpdate = true;
      shared.furSource = window.NeonFurTexture;
    }


    if (window.NeonDogFaceAtlas && shared.faceSource !== window.NeonDogFaceAtlas) {
      shared.faceTexture = new T.TextureLoader().load(window.NeonDogFaceAtlas);
      shared.faceTexture.colorSpace = T.SRGBColorSpace; shared.faceTexture.anisotropy = 4;
      shared.faceTexture.minFilter = T.LinearMipmapLinearFilter;
      shared.faceTexture.magFilter = T.LinearFilter;
      shared.faceSource = window.NeonDogFaceAtlas;
      shared.fur.userData.neonDogFace = true;
      shared.fur.onBeforeCompile = function(shader) {
        shader.uniforms.neonDogFace = {value: shared.faceTexture};
        shader.vertexShader = 'attribute vec2 dogFaceUv; attribute float dogFaceMix; attribute float dogFaceTint; varying vec2 vDogFaceUv; varying float vDogFaceMix; varying float vDogFaceTint;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDogFaceUv=dogFaceUv;vDogFaceMix=dogFaceMix;vDogFaceTint=dogFaceTint;');
        shader.fragmentShader = 'uniform sampler2D neonDogFace; varying vec2 vDogFaceUv; varying float vDogFaceMix; varying float vDogFaceTint;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nvec3 dogPortrait=texture2D(neonDogFace,vDogFaceUv).rgb*vDogFaceTint;\ndiffuseColor.rgb=mix(diffuseColor.rgb,dogPortrait,clamp(vDogFaceMix,0.0,1.0));');
      };
      shared.fur.customProgramCacheKey = function() { return 'orelha-anatomical-albedo-v2'; };
      shared.fur.needsUpdate = true;
    }

    function furColor(x, y, z, part) {
      var color = colors.brown.clone();
      var brindle = .5 + .5 * Math.sin(z * 40 + y * 15 + Math.sin(x * 21) * 3.1);
      var fleck = noise(x * 4, y * 7, z * 5);
      if (part === 'body') {
        // Orelha's distinct black neck/bib sits between warm brindled shoulders.
        var saddle = smooth(.03, .34, y) * .72;
        color.lerp(colors.coal, saddle);
        color.lerp(colors.coal, Math.pow(brindle, 3) * .33);
        var front = smooth(.22, .58, z), chestLow = 1 - smooth(.07, .31, y);
        var lateral = smooth(.055, .19, Math.abs(x));
        color.lerp(colors.tan, front * chestLow * lateral * .58);
        var bib = front * (1 - smooth(.075, .175, Math.abs(x))) * (1 - smooth(.45, .61, y));
        color.lerp(colors.dark, bib * .87);
        var collar = smooth(.45, .70, z) * smooth(.13, .38, y);
        color.lerp(colors.dark, collar * .62);
      } else if (part === 'head') {
        color.copy(colors.dark).lerp(colors.coal, .40);
        // Warm eyebrows and cheeks frame the eyes; the stop stays black.
        var cheek = Math.exp(-Math.pow((Math.abs(x) - .181) / .052, 2) - Math.pow((y + .067) / .083, 2) - Math.pow((z - .172) / .105, 2));
        var brow = Math.exp(-Math.pow((Math.abs(x) - .135) / .036, 2) - Math.pow((y - .114) / .031, 2) - Math.pow((z - .170) / .056, 2));
        color.lerp(colors.tan, cheek * .66);
        color.lerp(colors.warm, brow * .61);
        // Senior silver hairs wrap the sides/lip around a black nasal bridge.
        var front = smooth(.220, .370, z), underside = 1 - smooth(-.052, .012, y);
        var sides = smooth(.045, .105, Math.abs(x)) * (1 - smooth(.040, .096, y));
        var age = front * Math.max(underside * .90, sides * .89);
        color.lerp(colors.grey, age * (.84 + fleck * .16));
      } else if (part === 'jaw') {
        color.copy(colors.coal).lerp(colors.grey, .18 + fleck * .1);
      } else if (part === 'leg') {
        color.copy(colors.brown).lerp(colors.coal, .24);
        color.lerp(colors.tan, 1 - smooth(-.89, -.69, y));
        var stocking = Math.exp(-Math.pow(x / .049, 2)) * smooth(-.80, -.58, y) * smooth(-.02, .05, z);
        color.lerp(colors.coal, stocking * .74);
        color.lerp(colors.coal, Math.pow(brindle, 3) * .10 * smooth(-.85, -.33, y));
      } else if (part === 'upper') {
        color.copy(colors.brown).lerp(colors.coal, clamp((y + .40) * 1.2, 0, .64));
        color.lerp(colors.tan, clamp((-y - .25) * 2.8, 0, .36));
        color.lerp(colors.coal, Math.pow(brindle, 3) * .22);
      } else if (part === 'lower') {
        color.copy(colors.tan).lerp(colors.brown, clamp((y + .30) * 2, 0, .7));
        if (z < -.045) color.lerp(colors.coal, .15);
      } else if (part === 'paw') {
        color.copy(colors.tan).lerp(colors.grey, .07 + fleck * .06);
      } else if (part === 'tail') {
        color.copy(colors.brown).lerp(colors.coal, clamp(-z * .9, .1, .7));
        color.lerp(colors.coal, Math.pow(brindle, 3) * .22);
      } else {
        color.copy(colors.coal).lerp(colors.brown, .12);
      }
      return color.multiplyScalar(1.10 + fleck * .10);
    }

    function mesh(parent, geometry, mat) {
      var m = new T.Mesh(geometry, mat || shared.fur);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    }
    function oval(parent, mat, x, y, z, sx, sy, sz) {
      var g = new T.SphereGeometry(1, 16, 12);
      g.scale(sx, sy, sz); g.translate(x, y, z); return mesh(parent, g, mat);
    }

    var O = window.NeonOrganic;
    if (!O) throw new Error('Organic mesher must load before the dog builder');
    var torso = rig.torso = group(rig.stance, 0, .94, 0);
    var head = rig.head = bone(torso, 0, .4962, .64);
    torso.name = 'orelha-torso-joint'; head.name = 'orelha-head-joint';
    var bones = [torso, head], legInfo = [], earInfo = [];
    rig.legs = []; rig.ears = [];
    for (var front = 0; front < 2; front++) for (var side = -1; side <= 1; side += 2) {
      var hind = front === 1, lx = side * (hind ? .249 : .262), lz = hind ? -.665 : .423;
      var hip = bone(torso, lx, -.0088, lz), knee = bone(hip, 0, -.4606, hind ? .065 : .007);
      var paw = bone(knee, 0, -.3995, hind ? .055 : .10), start = bones.length;
      bones.push(hip, knee, paw);
      rig.legs.push({hip: hip, knee: knee, boot: paw, front: !hind, side: side});
      legInfo.push({x: lx, z: lz, y: -.0088, hind: hind, start: start});
    }
    var tail = rig.tail = bone(torso, 0, .1012, -.90), tailIndex = bones.length;
    tail.rotation.set(.06, 0, .16); bones.push(tail);
    for (var es = -1; es <= 1; es += 2) {
      var base = bone(head, es * .224, .096, -.012), tip = bone(base, es * .035, -.075, .065);
      base.rotation.set(0, es * .96, -es * .16); tip.rotation.x = .60;
      var ei = bones.length; bones.push(base, tip);
      rig.ears.push({base: base, tip: tip, side: es}); earInfo.push({base: base, tip: tip, side: es, start: ei});
    }
    rig.root.updateMatrixWorld(true);
    var torsoInverse = torso.matrixWorld.clone().invert(), primitives = [];
    function ell(cx,cy,cz,rx,ry,rz,k,axes) {
      var span = axes ? Math.max(rx,ry,rz) : 0, pad = k + .06;
      primitives.push({type:0,c:[cx,cy,cz],r:[rx,ry,rz],axes:axes,k:k,
        min:[cx-(span||rx)-pad,cy-(span||ry)-pad,cz-(span||rz)-pad],
        max:[cx+(span||rx)+pad,cy+(span||ry)+pad,cz+(span||rz)+pad]});
    }
    function cap(a,b,ra,rb,k) {
      var pad = Math.max(ra,rb) + k + .06;
      primitives.push({type:1,a:a,b:b,r:[ra,rb],k:k,
        min:[Math.min(a[0],b[0])-pad,Math.min(a[1],b[1])-pad,Math.min(a[2],b[2])-pad],
        max:[Math.max(a[0],b[0])+pad,Math.max(a[1],b[1])+pad,Math.max(a[2],b[2])+pad]});
    }
    function pointAt(joint, values) { return new T.Vector3(values[0],values[1],values[2]).applyMatrix4(joint.matrixWorld).applyMatrix4(torsoInverse); }
    function ellAt(joint, center, radius, k) {
      var c=pointAt(joint,center), transform=torsoInverse.clone().multiply(joint.matrixWorld), elements=transform.elements;
      var axes=[[elements[0],elements[1],elements[2]],[elements[4],elements[5],elements[6]],[elements[8],elements[9],elements[10]]];
      ell(c.x,c.y,c.z,radius[0],radius[1],radius[2],k,axes);
    }
    // Torso and neck share a real surface with soft muscle transitions.
    ell(0,.045,-.22,.348,.353,.665,.095);
    ell(0,.045,.215,.367,.407,.450,.095);
    ell(0,.070,-.700,.294,.310,.315,.075);
    ell(0,.222,.490,.294,.335,.300,.080);
    ell(0,.386,.635,.226,.245,.238,.060);
    // A single anatomical loft defines the whole head: broad flat crown,
    // descending cheeks, a clear stop and a wide, blunt nasal bridge.
    // Sections are [depth, half width, crown height, jaw height].
    var hy=head.position.y,hz=head.position.z;
    var headSections=[[-.235,.090,.100,-.100],[-.160,.190,.164,-.165],
      [-.075,.233,.170,-.182],[.025,.245,.157,-.194],
      [.115,.219,.113,-.190],[.185,.186,.051,-.180],
      [.240,.177,.010,-.194],[.340,.160,.008,-.200],
      [.430,.145,.007,-.198],[.465,.139,.006,-.192]];
    primitives.push({type:3,k:.027,min:[-.32,hy-.24,hz-.29],max:[.32,hy+.22,hz+.50]});
    function headSection(z) {
      var i=0;while(i<headSections.length-2&&z>headSections[i+1][0])i++;
      var a=headSections[i],b=headSections[i+1],t=clamp((z-a[0])/(b[0]-a[0]),0,1),t2=t*t,t3=t2*t;
      var before=headSections[Math.max(0,i-1)],after=headSections[Math.min(headSections.length-1,i+2)],result=[];
      for(var j=1;j<4;j++){
        var m0=(b[j]-before[j])/(b[0]-before[0])*(b[0]-a[0]);
        var m1=(after[j]-a[j])/(after[0]-a[0])*(b[0]-a[0]);
        result.push((2*t3-3*t2+1)*a[j]+(t3-2*t2+t)*m0+(-2*t3+3*t2)*b[j]+(t3-t2)*m1);
      }
      return result;
    }
    // Tapered limbs are fused only at their roots. The gaps between the four
    // legs and the bent hocks stay open; each paw grows naturally into its shin.
    legInfo.forEach(function(l) {
      var x=l.x,z=l.z;
      if(l.hind){
        ell(x,-.110,z+.030,.135,.252,.168,.058);
        cap([x,-.135,z+.020],[x,-.4694,z+.065],.105,.066,.038);
        cap([x,-.4694,z+.065],[x,-.704,z-.052],.063,.050,.027);
        cap([x,-.704,z-.052],[x,-.837,z+.030],.049,.058,.022);
      }else{
        ell(x,.008,z-.016,.108,.250,.142,.062);
        cap([x,-.130,z],[x,-.4694,z+.007],.090,.064,.036);
        cap([x,-.4694,z+.007],[x,-.809,z+.053],.064,.055,.026);
        ell(x,-.822,z+.080,.065,.073,.078,.022);
      }
      var pz=z+(l.hind?.115:.137);
      ell(x,-.885,pz,.079,.045,.128,.022);
      cap([x,-.817,z+(l.hind?.035:.065)],[x,-.851,pz-.025],.057,.048,.022);
      for(var toe=0;toe<4;toe++)ell(x+(toe-1.5)*.032,-.891,pz+.085,.022,.036,.053,.009);
    });
    // Ears and tail also belong to this surface, with their own skin weights.
    earInfo.forEach(function(e){
      // One tapered, softly bent leaf, rather than a chain of rounded lobes.
      var center=pointAt(e.base,[0,0,0]),transform=torsoInverse.clone().multiply(e.base.matrixWorld),m=transform.elements;
      primitives.push({type:2,c:[center.x,center.y,center.z],side:e.side,k:.020,
        axes:[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]],
        min:[center.x-.19,center.y-.34,center.z-.17],max:[center.x+.19,center.y+.12,center.z+.22]});
      e.center=pointAt(e.base,[0,-.055,.025]);e.tipCenter=pointAt(e.base,[e.side*.019,-.209,.054]);
    });
    var tailPath=[[0,0,.018],[.012,.080,-.20],[.025,.190,-.43],[.031,.320,-.65],[.028,.510,-.79]];
    for(var ti=0;ti<tailPath.length-1;ti++){
      var ta=pointAt(tail,tailPath[ti]),tb=pointAt(tail,tailPath[ti+1]);
      cap([ta.x,ta.y,ta.z],[tb.x,tb.y,tb.z],.064*(1-ti/4)+.018,.064*(1-(ti+1)/4)+.018,ti?.016:.033);
    }
    function field(x,y,z) {
      var distance=1;
      for(var i=0;i<primitives.length;i++){
        var p=primitives[i];
        if(x<p.min[0]||x>p.max[0]||y<p.min[1]||y>p.max[1]||z<p.min[2]||z>p.max[2])continue;
        var value;
        if(p.type===1)value=O.capsule(x,y,z,p.a,p.b,p.r);
        else if(p.type===2){
          var dx=x-p.c[0],dy=y-p.c[1],dz=z-p.c[2],ax=p.axes;
          var ex=dx*ax[0][0]+dy*ax[0][1]+dz*ax[0][2],ey=dx*ax[1][0]+dy*ax[1][1]+dz*ax[1][2],ez=dx*ax[2][0]+dy*ax[2][1]+dz*ax[2][2];
          var t=clamp((.035-ey)/.305,0,1),width=.022+.086*Math.pow(1-t,.74);
          var cx=p.side*(.006+.035*t),cz=.010+.055*Math.pow(t,1.3),thickness=.031-.008*t;
          var cross=(Math.sqrt(Math.pow((ex-cx)/width,2)+Math.pow((ez-cz)/thickness,2))-1)*Math.min(width,thickness);
          value=-O.smoothUnion(-cross,-(ey-.035),.027);
          value=-O.smoothUnion(-value,-(-.270-ey),.008);
        }else if(p.type===3){
          var localZ=z-hz,section=headSection(localZ),w=section[0],middle=(section[1]+section[2])*.5,h=(section[1]-section[2])*.5;
          var exponent=2.7,radial=Math.pow(Math.pow(Math.abs(x)/w,exponent)+Math.pow(Math.abs(y-hy-middle)/h,exponent),1/exponent)-1;
          value=Math.max(radial*Math.min(w,h),-.235-localZ,localZ-.465);
        }else if(p.axes){
          var dx=x-p.c[0],dy=y-p.c[1],dz=z-p.c[2],ax=p.axes;
          value=O.ellipsoid(dx*ax[0][0]+dy*ax[0][1]+dz*ax[0][2],dx*ax[1][0]+dy*ax[1][1]+dz*ax[1][2],dx*ax[2][0]+dy*ax[2][1]+dz*ax[2][2],0,0,0,p.r[0],p.r[1],p.r[2]);
        }else value=O.ellipsoid(x,y,z,p.c[0],p.c[1],p.c[2],p.r[0],p.r[1],p.r[2]);
        distance=O.smoothUnion(distance,value,p.k);
      }
      // Shallow eye sockets and the tucked abdomen are sculpted into the skin.
      if(z>hz+.085&&z<hz+.205&&y>hy+.027&&y<hy+.107){
        var dx=Math.abs(x)-.171,dy=y-hy-.069,dz=z-hz-.145,ca=Math.cos(.62),sa=Math.sin(.62);
        var socket=O.ellipsoid(dx*ca-dz*sa,dy,dx*sa+dz*ca,0,0,0,.037,.022,.017);
        distance=-O.smoothUnion(-distance,socket,.007);
      }
      if(y<-.28&&Math.abs(x)<.25&&z>-.68&&z<.08){
        var tuck=O.ellipsoid(x,y,z,0,-.442,-.275,.225,.107,.320);
        distance=-O.smoothUnion(-distance,tuck,.020);
      }
      return distance;
    }
    function nearestLeg(x,z) {
      var result=legInfo[0],best=Infinity;
      for(var l=0;l<legInfo.length;l++){var candidate=legInfo[l],d=(x-candidate.x)*(x-candidate.x)+(z-candidate.z)*(z-candidate.z);if(d<best){best=d;result=candidate;}}
      return result;
    }
    function skin(x,y,z) {
      var weights={},headWeight=smooth(.19,.39,y)*smooth(.25,.53,z);
      weights[0]=1-headWeight;weights[1]=headWeight;
      if(y<.11){
        var l=nearestLeg(x,z),influence=(1-smooth(-.36,.11,y))*Math.exp(-Math.pow((x-l.x)/.23,2)-Math.pow((z-l.z)/.29,2));
        if(y<-.45)influence=1;
        var localY=y-l.y,knee=1-smooth(-.625,-.325,localY),foot=1-smooth(-.900,-.775,localY);
        weights[0]*=1-influence;weights[1]*=1-influence;
        weights[l.start]=influence*(1-knee)*(1-foot);weights[l.start+1]=influence*knee*(1-foot);weights[l.start+2]=influence*foot;
      }
      var tailWeight=(1-smooth(-1.10,-.84,z))*smooth(-.01,.14,y)*(1-smooth(.065,.15,Math.abs(x)));
      if(tailWeight>0){Object.keys(weights).forEach(function(k){weights[k]*=1-tailWeight;});weights[tailIndex]=tailWeight;}
      if(Math.abs(x)>.20&&y>.32&&z>.37&&z<.87){
        var e=earInfo[x<0?0:1],d=Math.min(Math.hypot(x-e.center.x,y-e.center.y,z-e.center.z),Math.hypot(x-e.tipCenter.x,y-e.tipCenter.y,z-e.tipCenter.z));
        var earWeight=smooth(.20,.315,Math.abs(x))*(1-smooth(.065,.19,d));
        var tipWeight=1-smooth(e.tipCenter.y+.015,e.center.y-.018,y);
        Object.keys(weights).forEach(function(k){weights[k]*=1-earWeight;});weights[e.start]=earWeight*(1-tipWeight);weights[e.start+1]=earWeight*tipWeight;
      }
      var entries=Object.keys(weights).map(function(k){return[Number(k),weights[k]];}).filter(function(a){return a[1]>1e-6;}).sort(function(a,b){return b[1]-a[1];}).slice(0,4);
      var total=entries.reduce(function(sum,a){return sum+a[1];},0)||1,indices=[0,0,0,0],values=[0,0,0,0];
      entries.forEach(function(a,i){indices[i]=a[0];values[i]=a[1]/total;});return{indices:indices,weights:values};
    }
    function paint(x,y,z) {
      var c=furColor(x,y+.0588,z,'body'),headBlend=smooth(.20,.42,y)*smooth(.32,.56,z);
      if(headBlend)c.lerp(furColor(x,y-hy,z-hz,'head'),headBlend);
      if(y<-.23){var l=nearestLeg(x,z);c.lerp(furColor(x-l.x,y-l.y,z-l.z,'leg'),1-smooth(-.43,-.23,y));}
      if(z<-.94)c.lerp(furColor(x,y-.1012,z+.90,'tail'),1-smooth(-1.10,-.94,z));
      // One continuous cylindrical UV field avoids texture seams at shoulders,
      // neck, hips and ankles. The reference short-fur texture supplies detail.
      var density=1+headBlend*9;
      return{color:c,uv:[(Math.atan2(x,y-.04)/TAU+.5)*2*density,(z*.83+y*1.04)*density]};
    }
    var geometry=O.build(T,{bounds:{min:[-.62,-.99,-1.88],max:[.62,.93,1.35]},resolution:[56,90,144],field:field,paint:paint,skin:skin});
    if (shared.faceTexture) {
      var positions=geometry.attributes.position,normals=geometry.attributes.normal,coat=geometry.attributes.color;
      var faceUv=[],faceMix=[],faceTint=[];
      var landmarks=[[.176,.045],[.141,.120],[.103,.235],[.069,.356],[.010,.510],[-.060,.730],[-.108,.825],[-.170,.900]];
      var contour=[[.045,.025],[.066,.135],[.10,.215],[.18,.281],[.25,.307],[.34,.314],[.43,.302],[.53,.277],[.62,.248],[.70,.213],[.755,.188],[.82,.170],[.88,.128],[.905,.067]];
      function imageRow(y) {
        if(y>=landmarks[0][0])return landmarks[0][1];
        for(var j=0;j<landmarks.length-1;j++)if(y>=landmarks[j+1][0]){
          var t=(landmarks[j][0]-y)/(landmarks[j][0]-landmarks[j+1][0]);return landmarks[j][1]+(landmarks[j+1][1]-landmarks[j][1])*t;
        }
        return landmarks[landmarks.length-1][1];
      }
      function halfWidth(y) {
        for(var j=0;j<contour.length-1;j++)if(y<=contour[j+1][0]){
          var t=clamp((y-contour[j][0])/(contour[j+1][0]-contour[j][0]),0,1);return contour[j][1]+(contour[j+1][1]-contour[j][1])*t;
        }
        return contour[contour.length-1][1];
      }
      for(var fi=0;fi<positions.count;fi++){
        var x=positions.getX(fi),y=positions.getY(fi)-hy,z=positions.getZ(fi)-hz;
        var row=imageRow(y)-.16*(1-smooth(.28,.50,z))*(1-smooth(-.06,.04,y));
        var u=.5+x/.925,half=halfWidth(row);
        var fade=smooth(-.015,.095,z)*smooth(-.195,-.165,y)*(1-smooth(.158,.185,y));
        fade*=smooth(.02,.45,normals.getZ(fi));
        fade*=1-smooth(Math.max(.012,half-.062),Math.max(.018,half-.012),Math.abs(u-.5));
        fade*=smooth(.045,.064,row)*(1-smooth(.886,.902,row));
        faceUv.push(clamp(u,0,1),1-clamp(row,0,1));faceMix.push(fade);
        // Calibrate the photographic albedo to the same local coat brightness.
        // Lighting/shadow/roughness remain identical to the surrounding skin.
        var bright=Math.max(coat.getX(fi),coat.getY(fi),coat.getZ(fi));faceTint.push(clamp(bright*.53+.105,.115,.36));
      }
      geometry.setAttribute('dogFaceUv',new T.Float32BufferAttribute(faceUv,2));
      geometry.setAttribute('dogFaceMix',new T.Float32BufferAttribute(faceMix,1));
      geometry.setAttribute('dogFaceTint',new T.Float32BufferAttribute(faceTint,1));
    }
    var animal=new T.SkinnedMesh(geometry,shared.fur);
    animal.position.copy(torso.position);animal.castShadow=true;animal.receiveShadow=true;animal.frustumCulled=false;
    animal.name='orelha-continuous-organic-skin';rig.stance.add(animal);
    rig.root.updateMatrixWorld(true);animal.bind(new T.Skeleton(bones));
    // Eyes and a wet nose are small anatomical details, not structural volumes.
    oval(head,shared.wet,0,-.054,.481,.106,.058,.031);
    for(var ns=-1;ns<=1;ns+=2)oval(head,shared.mouth,ns*.048,-.063,.510,.017,.013,.003);
    if(shared.faceTexture&&!shared.eyePhoto){
      shared.eyePhoto=new T.MeshStandardMaterial({map:shared.faceTexture,color:0x7e7e7e,roughness:.40,metalness:0});
      shared.eyePhoto.userData.neonDogFace=true;
    }
    for(var eyeSide=-1;eyeSide<=1;eyeSide+=2){
      var eye=group(head,eyeSide*.171,.069,.134);eye.rotation.set(-.35,eyeSide*.62,0);eye.updateMatrix();
      var ep=[],en=[],eu=[],ei=[],columns=20,rows=10;
      for(var ex=0;ex<=columns;ex++)for(var ey=0;ey<=rows;ey++){
        var across=ex/columns*2-1,angle=(ey/rows-.5)*Math.PI,height=.018*Math.pow(Math.max(0,1-across*across),.70);
        var ox=across*.035,oy=Math.sin(angle)*height,oz=Math.cos(angle)*Math.sqrt(Math.max(0,1-across*across))*.010;
        ep.push(ox,oy,oz);
        if(shared.faceTexture){
          var point=new T.Vector3(ox,oy,oz).applyMatrix4(eye.matrix),row=.356+(.069-point.y)*(point.y>.069?3.559:2.610);
          eu.push(.5+point.x/.925,1-row);
        }else eu.push(ex/columns,ey/rows);
        if(ex<columns&&ey<rows){var n=ex*(rows+1)+ey,next=n+rows+1;ei.push(n,next,n+1,n+1,next,next+1);}
      }
      var eyelid=new T.BufferGeometry();eyelid.setAttribute('position',new T.Float32BufferAttribute(ep,3));eyelid.setAttribute('uv',new T.Float32BufferAttribute(eu,2));eyelid.setIndex(ei);eyelid.computeVertexNormals();mesh(eye,eyelid,shared.eyePhoto||shared.mouth);
      if(!shared.faceTexture){
      oval(eye,shared.iris,0,.0005,.003,.019,.013,.004);
      oval(eye,shared.wet,-eyeSide*.002,.0005,.007,.009,.010,.002);
      oval(eye,shared.gleam,-.006,.006,.009,.0023,.0023,.001);
      }
    }
    rig.organicSkin=animal;rig.root.userData.referenceModel='orelha-continuous-organic-v10';
    return rig;
  }
  window.NeonDog = {build: build};
})();
