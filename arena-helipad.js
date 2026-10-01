/* Oil Island — rooftop helipad and a choreographed, non-interactive fly-by. */
(function () {
  'use strict';
  window.OilArenaBuilders = window.OilArenaBuilders || {};
  window.OilArenaBuilders.helipad = function (ctx) {
    var T = ctx.THREE, PI = Math.PI, b = ctx.bounds;
    var group = new T.Group(), detail = new T.Group();
    group.name = 'Oil Island / Heliponto'; detail.name = 'Helipad distant city'; group.add(detail);
    var mesh = ctx.mesh, box = ctx.box, rod = ctx.rod, material = ctx.material;
    var seed = 286109;
    function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function mix(a, z, t) { return a + (z - a) * t; }
    function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    var concrete = material(0x657781, .08, .93), concreteDark = material(0x344951, .12, .88);
    var metal = material(0x59707b, .78, .4), darkMetal = material(0x263a42, .63, .48);
    var cream = material(0xd6dfd7, .24, .64), yellow = material(0xe9ad45, .2, .7);
    var navy = material(0x1d3242, .32, .66), rubber = material(0x101c24, .08, .92);
    var lightAmber = ctx.neon(0xffce75, 1.1), lightGreen = ctx.neon(0x8addbb, 1);
    var lightRed = ctx.neon(0xf26d56, .85), lightWhite = ctx.neon(0xc5e6e8, .65);
    var sphere = new T.SphereGeometry(1, 16, 10), cylinder = new T.CylinderGeometry(1, 1, 1, 16);

    // The painted combat square is unobstructed. Rails and equipment start
    // beyond the playable bounds; the landing pad covers all four corners.
    box(group, concreteDark, 0, -1, 0, 35, 1.9, 35, true);
    box(group, metal, 0, -1.8, 0, 35.45, .25, 35.45);
    box(group, concreteDark, 0, -19, 0, 29, 34, 29, true);
    box(group, darkMetal, 0, -2.15, 0, 31, .32, 31);
    var floorTexture = ctx.texture(2048, 2048, function (c, w, h) {
      c.fillStyle = '#65777b'; c.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 256) for (var x = 0; x < w; x += 256) {
        c.fillStyle = 'rgba(19,43,51,' + (.02 + random() * .045) + ')'; c.fillRect(x + 1, y + 1, 254, 254);
        c.strokeStyle = 'rgba(32,54,61,.18)'; c.lineWidth = 2; c.strokeRect(x, y, 256, 256);
      }
      for (var n = 0; n < 28000; n++) {
        c.fillStyle = n % 2 ? 'rgba(226,234,220,.085)' : 'rgba(19,33,40,.075)';
        c.fillRect(random() * w, random() * h, .8 + random() * 2.2, .7 + random() * 1.4);
      }
      c.translate(w / 2, h / 2); var unit = w / 35;
      c.strokeStyle = '#e6bc6d'; c.lineWidth = unit * .11;
      c.strokeRect(-b * unit, -b * unit, b * unit * 2, b * unit * 2);
      c.strokeStyle = 'rgba(228,238,224,.82)'; c.lineWidth = unit * .34;
      c.beginPath(); c.arc(0, 0, 8.25 * unit, 0, PI * 2); c.stroke();
      c.fillStyle = 'rgba(233,240,224,.9)';
      c.fillRect(-3.1 * unit, -3.8 * unit, 1.18 * unit, 7.6 * unit);
      c.fillRect(1.92 * unit, -3.8 * unit, 1.18 * unit, 7.6 * unit);
      c.fillRect(-1.93 * unit, -.58 * unit, 3.86 * unit, 1.16 * unit);
      c.font = '700 50px Arial'; c.textAlign = 'center'; c.fillStyle = 'rgba(235,228,194,.7)';
      c.fillText('OIL ISLAND', 0, 10.4 * unit); c.font = '600 22px monospace';
      c.fillText('ROOFTOP / 04     ORELHA EDITION', 0, 11.08 * unit);
      for (var side = 0; side < 4; side++) {
        c.save(); c.rotate(side * PI / 2);
        for (var stripe = -16; stripe <= 16; stripe++) {
          c.fillStyle = stripe % 2 ? '#cda254' : '#344750';
          c.save(); c.translate(stripe * unit * .88, 15.72 * unit); c.transform(1, 0, -.65, 1, 0, 0);
          c.fillRect(-unit * .44, -unit * .24, unit * .88, unit * .48); c.restore();
        }
        c.fillStyle = 'rgba(235,235,214,.8)';
        [-10, -5, 0, 5, 10].forEach(function (tick) { c.fillRect(tick * unit - 3, -b * unit, 6, .25 * unit); });
        c.restore();
      }
      for (var scratch = 0; scratch < 2100; scratch++) {
        c.fillStyle = 'rgba(90,113,116,.09)'; c.fillRect((random() - .5) * w, (random() - .5) * h, random() * 13 + 1, .8);
      }
    });
    var floor = mesh(new T.PlaneGeometry(35, 35), new T.MeshStandardMaterial({map: floorTexture, color: 0xffffff, roughness: .88, metalness: .07}), group, 0, .008, 0);
    floor.rotation.x = -PI / 2; floor.receiveShadow = true;
    // Recessed green edge lights and a low industrial perimeter retain the sky.
    for (var side = -1; side <= 1; side += 2) {
      rod(group, metal, side * 16.9, .52, -16.9, side * 16.9, .52, 16.9, .045);
      rod(group, metal, -16.9, .52, side * 16.9, 16.9, .52, side * 16.9, .045);
      for (var i = -16; i <= 16; i += 4) {
        box(group, metal, side * 16.9, .22, i, .075, .6, .075);
        box(group, metal, i, .22, side * 16.9, .075, .6, .075);
        box(group, darkMetal, side * 14.8, .022, i * .875, .42, .045, .16);
        box(group, lightGreen, side * 14.8, .049, i * .875, .25, .035, .1);
        box(group, darkMetal, i * .875, .022, side * 14.8, .16, .045, .42);
        box(group, lightGreen, i * .875, .049, side * 14.8, .1, .035, .25);
      }
      for (var panel = -12; panel <= 12; panel += 3) {
        box(group, navy, side * 14.54, -13.5, panel, .035, 20, 1.3);
        box(group, navy, panel, -13.5, side * 14.54, 1.3, 20, .035);
        box(group, metal, side * 14.59, -2.55, panel, .12, .7, .16);
        box(group, metal, panel, -2.55, side * 14.59, .16, .7, .12);
      }
    }
    // Corner service station and roof hardware never enter the fighting area.
    box(group, cream, -15.45, .55, -15.35, 1.2, 1.1, 1.05, true);
    box(group, yellow, -15.45, 1.13, -15.35, 1.26, .08, 1.11);
    box(group, lightRed, -15.45, .72, -14.81, .28, .29, .02);
    for (var vent = 0; vent < 7; vent++) box(group, darkMetal, -15.46 + vent * .115, .4, -14.81, .035, .32, .035);
    mesh(new T.CylinderGeometry(.19, .2, .85, 16), lightRed, group, -14.48, .46, -15.3);
    rod(group, metal, 15.5, 0, -15.5, 15.5, 3.4, -15.5, .04);
    mesh(sphere, lightRed, group, 15.5, 3.48, -15.5, .09, .09, .09);
    var windsock = new T.Group(); windsock.name = 'Windsock'; windsock.position.set(15.5, 3.12, -15.5); windsock.userData.keepDynamic = true; group.add(windsock);
    for (var ws = 0; ws < 5; ws++) {
      var sleeve = mesh(new T.CylinderGeometry(.2 - ws * .025, .225 - ws * .025, .25, 12, 1, true), ws % 2 ? cream : yellow, windsock, .19 + ws * .235, -ws * .02, 0);
      sleeve.rotation.z = -PI / 2 + .09;
    }
    rod(group, metal, -15.6, 0, 15.5, -15.6, 2.4, 15.5, .03);
    rod(group, metal, -15.6, 2.4, 15.5, -15.6, 3.4, 15.5, .012);
    for (var antenna = 0; antenna < 3; antenna++) rod(group, metal, -15.98, 2.32 + antenna * .24, 15.5, -15.22, 2.32 + antenna * .24, 15.5, .011);

    var cityMats = [material(0x708893, .18, .85), material(0x5a7483, .22, .79), material(0x91a0a0, .13, .89), material(0x445e70, .28, .72)];
    var windowMat = material(0xbed2cf, .25, .54), cityWindows = [], cityRoofs = [];
    // Distant towers are below the pad, allowing both aircraft to read clearly.
    for (var building = 0; building < 76; building++) {
      var angle = building * 2.39996, radius = 43 + (building % 4) * 15 + random() * 9;
      var bx = Math.cos(angle) * radius, bz = Math.sin(angle) * radius;
      var width = 5 + random() * 7, depth = 5 + random() * 8, height = 13 + random() * 33;
      var top = -6 - random() * 18, base = top - height;
      var cityParent = building < 24 ? group : detail;
      box(cityParent, cityMats[building % 4], bx, base + height / 2, bz, width, height, depth);
      box(cityParent, concreteDark, bx, top + .15, bz, width + .35, .3, depth + .35);
      if (building % 3 === 0) cityRoofs.push([bx, top + .8, bz, width * .36, 1.3, depth * .4]);
      var floors = Math.min(13, Math.floor(height / 2.5)), rows = Math.floor(width / 1.55);
      for (var level = 1; level < floors; level++) for (var win = 0; win < rows; win++) {
        if (random() < .2) continue;
        cityWindows.push([bx - width * .5 + .7 + win * 1.55, top - level * 2.5, bz + depth * .5 + .025, .65, 1.1, .035]);
      }
    }
    var instanceMatrix = new T.Object3D();
    function staticInstances(records, mat, name) {
      var inst = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), mat, records.length); inst.name = name;
      for (var k = 0; k < records.length; k++) {
        var p = records[k]; instanceMatrix.position.set(p[0], p[1], p[2]); instanceMatrix.scale.set(p[3], p[4], p[5]); instanceMatrix.updateMatrix(); inst.setMatrixAt(k, instanceMatrix.matrix);
      }
      detail.add(inst); return inst;
    }
    staticInstances(cityWindows, windowMat, 'Instanced city windows'); staticInstances(cityRoofs, concreteDark, 'City rooftop equipment');
    // Soft cloud bands, deliberately static and distant, give the height a scale.
    var cloudMaterial = new T.MeshBasicMaterial({color: 0xd2cdbb, transparent: true, opacity: .09, depthWrite: false});
    for (var cloud = 0; cloud < 7; cloud++) {
      var ca = cloud * PI * 2 / 7;
      mesh(sphere, cloudMaterial, detail, Math.cos(ca) * 99, -9 + random() * 7, Math.sin(ca) * 99, 16 + random() * 9, 1.2, 6);
    }

    var bluePaint = material(0x397b91, .36, .39), redPaint = material(0xc76b4c, .35, .4);
    var glass = material(0x1e5269, .75, .16), glassFrame = material(0x20343f, .52, .42);
    var rotorMaterial = material(0x192a32, .52, .59), rotorTip = material(0xcbbf8d, .27, .61);
    var boltMaterial = material(0xa0aeb0, .7, .29);
    var eventGroup = new T.Group(); eventGroup.name = 'Two helicopters / environmental collision'; eventGroup.userData.keepDynamic = true; group.add(eventGroup);
    // Keep the complete aircraft visible at low quality. Their static parts are
    // merged within each moving rig; only the rotor pivots remain separate.
    function mergeRigid(parent) {
      parent.updateMatrixWorld(true);
      var inverse = parent.matrixWorld.clone().invert(), buckets = {};
      parent.traverse(function (o) {
        if (!o.isMesh || o.userData.keepDynamic) return;
        var a = o.parent; while (a && a !== parent) { if (a.userData.keepDynamic) return; a = a.parent; }
        (buckets[o.material.uuid] || (buckets[o.material.uuid] = [])).push(o);
      });
      Object.keys(buckets).forEach(function (id) {
        var parts = buckets[id]; if (parts.length < 2) return;
        var geometries = [], count = 0, indexCount = 0;
        parts.forEach(function (part) {
          var g = part.geometry.clone(); g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse, part.matrixWorld));
          geometries.push(g); count += g.attributes.position.count; indexCount += g.index ? g.index.count : g.attributes.position.count;
        });
        // Hulls and curved tubes keep their indices within the moving rig, so
        // shared vertices are transformed once rather than once per triangle.
        var pos = new Float32Array(count * 3), normal = new Float32Array(count * 3), uv = new Float32Array(count * 2), indices = count > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount), cursor = 0, indexCursor = 0;
        geometries.forEach(function (g) {
          pos.set(g.attributes.position.array, cursor * 3); normal.set(g.attributes.normal.array, cursor * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, cursor * 2);
          var length = g.index ? g.index.count : g.attributes.position.count;
          for (var i = 0; i < length; i++) indices[indexCursor++] = cursor + (g.index ? g.index.getX(i) : i);
          cursor += g.attributes.position.count; g.dispose();
        });
        var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(normal, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(indices, 1)); geo.computeBoundingSphere();
        mesh(geo, parts[0].material, parent); parts.forEach(function (part) { part.parent.remove(part); });
      });
    }
    var slices = [[-1.55, .02, .18, .22], [-1.2, .08, .46, .55], [-.7, .12, .65, .73], [.12, .1, .65, .77], [.76, .02, .54, .68], [1.22, -.1, .37, .48], [1.62, -.18, .16, .15], [1.68, -.18, .025, .025]];
    function hullPoint(x, angle, offset) {
      var s = 0; while (s < slices.length - 2 && x > slices[s + 1][0]) s++;
      var a = slices[s], z = slices[s + 1], t = clamp((x - a[0]) / (z[0] - a[0]), 0, 1);
      return [x, mix(a[1], z[1], t) + Math.cos(angle) * (mix(a[2], z[2], t) + offset), Math.sin(angle) * (mix(a[3], z[3], t) + offset)];
    }
    function hullPatch(x0, x1, a0, a1, offset, mat, parent, segmentsX, segmentsA) {
      var nx = segmentsX || 12, na = segmentsA || 18, p = [], uv = [], ix = [];
      for (var i = 0; i <= nx; i++) for (var j = 0; j <= na; j++) {
        var point = hullPoint(mix(x0, x1, i / nx), mix(a0, a1, j / na), offset);
        p.push(point[0], point[1], point[2]); uv.push(i / nx, j / na);
        if (i < nx && j < na) { var n = i * (na + 1) + j; ix.push(n, n + 1, n + na + 1, n + 1, n + na + 2, n + na + 1); }
      }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(ix); geo.computeVertexNormals();
      return mesh(geo, mat, parent);
    }
    function tube(points, radius, mat, parent) {
      var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
      return mesh(new T.TubeGeometry(curve, 18, radius, 6, false), mat, parent);
    }
    function aircraft(paint, label) {
      var root = new T.Group(), body = new T.Group(); root.name = label; root.add(body); eventGroup.add(root);
      hullPatch(-1.55, 1.68, 0, PI * 2, 0, paint, body, 28, 32);
      // Separate framed windshields follow the curved fuselage, not flat plates.
      hullPatch(.37, 1.39, -.98, -.065, .014, glass, body, 12, 10);
      hullPatch(.37, 1.39, .065, .98, .014, glass, body, 12, 10);
      for (var side = -1; side <= 1; side += 2) {
        hullPatch(-.74, .20, side > 0 ? .65 : -1.52, side > 0 ? 1.52 : -.65, .016, glass, body, 10, 8);
        hullPatch(-1.25, 1.16, side > 0 ? 1.74 : -2.05, side > 0 ? 2.05 : -1.74, .012, cream, body, 20, 3);
        var framePoints = [], frameX = [-.8, -.8, .24, .24, -.8], frameA = [.6, 1.58, 1.58, .6, .6];
        for (var fp = 0; fp < frameX.length; fp++) framePoints.push(hullPoint(frameX[fp], frameA[fp] * side, .038));
        tube(framePoints, .022, glassFrame, body);
        box(body, boltMaterial, -.25, -.11, side * .752, .21, .033, .043);
        rod(body, darkMetal, -.7, -.47, side * .39, -.66, -.88, side * .72, .045);
        rod(body, darkMetal, .72, -.38, side * .35, .66, -.87, side * .72, .045);
        tube([[-1.4, -.87, side * .77], [-.7, -.92, side * .77], [.72, -.92, side * .77], [1.27, -.78, side * .77], [1.43, -.63, side * .77]], .062, darkMetal, body);
        mesh(sphere, side > 0 ? lightGreen : lightRed, body, -.87, .14, side * .718, .053, .044, .044);
      }
      tube([hullPoint(.31, -1.07, .025), hullPoint(.31, -.52, .026), hullPoint(.31, 0, .026), hullPoint(.31, .52, .026), hullPoint(.31, 1.07, .025)], .025, glassFrame, body);
      tube([hullPoint(.38, 0, .026), hullPoint(.77, 0, .026), hullPoint(1.2, 0, .026), hullPoint(1.4, 0, .025)], .022, glassFrame, body);
      // Tapering tail boom, vertical fin, stabilizer and exposed drive shaft.
      var boom = mesh(new T.CylinderGeometry(.075, .29, 2.94, 16), paint, body, -2.78, .23, 0);
      boom.rotation.z = PI / 2 - .12;
      box(body, cream, -4.19, .36, 0, .33, .065, 1.24);
      var finShape = new T.Shape(); finShape.moveTo(-4.40, .25); finShape.lineTo(-4.46, 1.25); finShape.lineTo(-4.01, 1.09); finShape.lineTo(-3.73, .28); finShape.closePath();
      var fin = mesh(new T.ExtrudeGeometry(finShape, {depth: .075, bevelEnabled: true, bevelThickness: .022, bevelSize: .026, bevelSegments: 1, steps: 1}), paint, body, 0, 0, -.0375);
      fin.castShadow = false;
      rod(body, metal, -1.22, .55, 0, -4.28, .55, 0, .025);
      mesh(sphere, lightWhite, body, -4.4, 1.22, 0, .045, .052, .045);
      mesh(sphere, darkMetal, body, -.5, .71, 0, .65, .26, .35);
      mesh(cylinder, metal, body, -.23, 1.04, 0, .07, .42, .07);
      for (var intake = 0; intake < 5; intake++) box(body, rubber, -.8 + intake * .12, .88, .12, .055, .024, .22);
      var mainRotor = new T.Group(); mainRotor.position.set(-.23, 1.26, 0); mainRotor.userData.keepDynamic = true; root.add(mainRotor);
      mesh(sphere, metal, mainRotor, 0, 0, 0, .16, .085, .16);
      for (var blade = 0; blade < 4; blade++) {
        var bladePivot = new T.Group(); bladePivot.rotation.y = blade * PI / 2; mainRotor.add(bladePivot);
        var rotorBlade = box(bladePivot, rotorMaterial, 1.7, .018, .045, 3.0, .033, .17); rotorBlade.rotation.x = .1;
        box(bladePivot, rotorTip, 3.02, .019, .045, .24, .037, .18);
      }
      mergeRigid(mainRotor);
      var tailRotor = new T.Group(); tailRotor.position.set(-4.24, .79, -.14); tailRotor.userData.keepDynamic = true; root.add(tailRotor);
      mesh(sphere, metal, tailRotor, 0, 0, 0, .075, .075, .085);
      box(tailRotor, rotorMaterial, 0, 0, 0, .94, .076, .035); box(tailRotor, rotorMaterial, 0, 0, .002, .076, .94, .035); mergeRigid(tailRotor);
      mesh(sphere, lightWhite, body, 1.22, -.28, 0, .09, .055, .11);
      mergeRigid(body);
      root.userData.keepDynamic = true;root.scale.setScalar(1.65);
      return {root: root, mainRotor: mainRotor, tailRotor: tailRotor};
    }
    var aircraftA = aircraft(bluePaint, 'Cobalt helicopter'), aircraftB = aircraft(redPaint, 'Copper helicopter');
    var flash = ctx.glow(eventGroup, 0xffc56e, 0, -.05, 0, 1, 0);
    flash.name = 'Single soft impact flare'; flash.material.opacity = 0;
    var fragmentGeometry = new T.BoxGeometry(.13, .065, .24), fragmentMat = material(0x7b8c91, .62, .55);
    var fragments = new T.InstancedMesh(fragmentGeometry, fragmentMat, 14); fragments.name = 'Pooled airborne metal fragments'; fragments.visible = false; eventGroup.add(fragments);
    var fragmentData = [];
    for (var fragment = 0; fragment < 14; fragment++) fragmentData.push({x:(random()-.5)*5.8,y:1.1+random()*2.6,z:(random()-.5)*4.5,spin:random()*5+2,size:.55+random()*.7});
    var smokeMat = new T.MeshBasicMaterial({color:0x4b5457,transparent:true,opacity:0,depthWrite:false});
    var smoke = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), smokeMat, 9); smoke.name='Pooled light smoke'; smoke.visible=false; eventGroup.add(smoke);
    var smokeData = [];
    for (var smokeIndex = 0; smokeIndex < 9; smokeIndex++) smokeData.push({x:(random()-.5)*1.2,y:random()*1.5,z:(random()-.5)*1.3,size:.25+random()*.3});
    var dummy = new T.Object3D(), introDuration = 6.2, landingTime = 3.35, jumpStart = 1.3;
    var cutsceneResult = {active:true,fighters:[{x:0,y:0,z:0,yaw:PI/2,jumpT:0},{x:0,y:0,z:0,yaw:-PI/2,jumpT:0}],cameraPosition:[0,9.5,28],cameraTarget:[0,4.5,-6]};

    function placeAircraft(a, x, y, z, facing, roll, pitch, rotorTime) {
      a.root.position.set(x,y,z); a.root.rotation.set(0,facing,0); a.root.rotateX(roll); a.root.rotateZ(pitch);
      a.mainRotor.rotation.y=rotorTime*23; a.tailRotor.rotation.z=rotorTime*37;
    }
    // Intro coordinates are shared with the fighter/camera animation so the
    // departing characters are tied to their helicopter doors exactly once.
    function cutscene(time, state, reducedMotion) {
      var t=clamp(time,0,introDuration), progress=smooth((t-jumpStart)/(landingTime-jumpStart));
      cutsceneResult.active=time>=0&&time<=introDuration&&(!state||!state.round||state.round===1);
      for(var player=0;player<2;player++){
        var side=player===0?-1:1,target=state&&state.fighters&&state.fighters[player],out=cutsceneResult.fighters[player];
        var tx=target&&Number.isFinite(target.x)?target.x:side*3.35,tz=target&&Number.isFinite(target.z)?target.z:0;
        var preJump=clamp(t/jumpStart,0,1),doorX=side*mix(14,9.5,smooth(preJump));
        if(reducedMotion){out.x=tx;out.y=0;out.z=tz;out.jumpT=1;}
        else if(t<jumpStart){out.x=doorX;out.y=6.52;out.z=-10.48;out.jumpT=0;}
        else{out.x=mix(side*9.5,tx,progress);out.y=6.52*(1-progress)+Math.sin(progress*PI)*2.1;out.z=mix(-10.48,tz,progress);out.jumpT=progress;}
        out.yaw=target&&Number.isFinite(target.yaw)?target.yaw:(player===0?PI/2:-PI/2);
      }
      var push=smooth(t/3.3);
      cutsceneResult.cameraPosition[0]=0;cutsceneResult.cameraPosition[1]=reducedMotion?7:mix(9.5,6.2,push);cutsceneResult.cameraPosition[2]=reducedMotion?24:mix(32,21,push);
      cutsceneResult.cameraTarget[0]=0;cutsceneResult.cameraTarget[1]=reducedMotion?3.8:mix(4.5,2.7,push);cutsceneResult.cameraTarget[2]=reducedMotion?-5:mix(-6,-2.8,push);
      return cutsceneResult;
    }
    function animateImpact(age, visible) {
      var impact=visible&&age>=0&&age<2.4;
      fragments.visible=impact;smoke.visible=impact;
      flash.material.opacity=impact?.48*Math.max(0,1-age/.5):0;
      var flareSize=impact?1.1+Math.min(.5,age)*4:0;flash.scale.set(flareSize,flareSize,1);
      if(!impact)return;
      for(var f=0;f<fragmentData.length;f++){
        var p=fragmentData[f];dummy.position.set(p.x*age,p.y*age-2.9*age*age,p.z*age);
        dummy.rotation.set(age*p.spin,age*p.spin*.7,age*p.spin*.4);var fade=clamp((2.4-age)/.65,0,1);
        dummy.scale.setScalar(p.size*fade);dummy.updateMatrix();fragments.setMatrixAt(f,dummy.matrix);
      }
      fragments.instanceMatrix.needsUpdate=true;
      smokeMat.opacity=.16*clamp(age/.28,0,1)*clamp((2.4-age)/.6,0,1);
      for(var s=0;s<smokeData.length;s++){
        var sp=smokeData[s];dummy.position.set(sp.x*(1+age*.65),.18+sp.y+age*.6,sp.z*(1+age*.65));
        dummy.rotation.set(s*.7,age*.17+s,0);dummy.scale.setScalar(sp.size*(1+age*1.25));dummy.updateMatrix();smoke.setMatrixAt(s,dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate=true;
    }
    function update(time, dt, reducedMotion, state) {
      var intro=!!(state&&state.phase==='intro'&&(!state.round||state.round===1)&&!state.training), t=intro?Math.max(0,state.phaseTime||0):(time%18);
      windsock.rotation.y=reducedMotion?.18:.18+Math.sin(time*.67)*.15;
      windsock.rotation.z=reducedMotion?0:Math.sin(time*1.4)*.025;
      eventGroup.position.set(intro?0:27,intro?0:6,intro?0:-12);eventGroup.rotation.y=intro?0:-1.12;
      eventGroup.scale.setScalar(intro?1:1.2);
      if(reducedMotion){
        placeAircraft(aircraftA,-3.55,intro?9:0,intro?-16:0,0,0,0,0);
        placeAircraft(aircraftB,3.55,intro?9:0,intro?-16:0,PI,0,0,0,0);
        aircraftA.root.visible=aircraftB.root.visible=true;animateImpact(-1,false);return;
      }
      var collisionAt=intro?3.8:9, approachStart=intro?jumpStart:1.2, distance, altitude, depth;
      if(intro&&t<jumpStart){distance=mix(14,9.5,smooth(t/jumpStart));altitude=8;depth=-12;}
      else{
        var approach=smooth((t-approachStart)/(collisionAt-approachStart));
        distance=mix(intro?9.5:12.5,2.772,approach);altitude=intro?mix(8,9,approach):Math.sin(t*.8)*.1;depth=intro?mix(-12,-16,approach):0;
      }
      var age=t-collisionAt, crashed=age>=0, fall=Math.max(0,age-.2);
      var height=crashed?altitude-fall*fall*4.1:altitude;
      var visible=intro?t<5.65:t<11.5;
      aircraftA.root.visible=aircraftB.root.visible=visible;
      var drift=crashed?age*.57:0, roll=crashed?fall*.83:Math.sin(t*.85)*.025,pitch=crashed?fall*.52:-.028;
      placeAircraft(aircraftA,-distance-drift,height,depth+drift*.28,0,roll,pitch,time);
      placeAircraft(aircraftB,distance+drift,height+.055,depth-drift*.28,PI,-roll,-pitch,time+.2);
      flash.position.set(0,altitude-.12,depth);
      fragments.position.set(0,altitude-.15,depth);smoke.position.set(0,altitude-.05,depth);
      animateImpact(age,visible);
    }
    update(0,0,false,null);
    return {group:group,detail:detail,animated:[],rigidGroups:[windsock],colliders:[],bounds:b,update:update,cutscene:cutscene,
      lighting:{background:0x648298,fogColor:0xadb8b6,fogNear:52,fogFar:150,hemiSky:0xdce8e4,hemiGround:0x47505c,hemiIntensity:1.7,keyColor:0xffe2b7,keyIntensity:2.2,coolColor:0x8dbad7,coolIntensity:1.25}};
  };
}());
