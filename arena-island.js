/* Oil Island — sunlit tropical fighting ground. All scenery is authored locally. */
(function () {
  'use strict';
  window.OilArenaBuilders = window.OilArenaBuilders || {};
  window.OilArenaBuilders.island = function (ctx) {
    var T = ctx.THREE, PI = Math.PI, b = ctx.bounds;
    var group = new T.Group(), detail = new T.Group();
    group.name = 'Oil Island / Ilha'; detail.name = 'Island distant detail'; group.add(detail);
    var mesh = ctx.mesh, box = ctx.box, rod = ctx.rod, material = ctx.material;
    var seed = 910724;
    function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
    var wood = material(0x735238, .02, .96), woodLight = material(0xad8453, .01, .93);
    var rope = material(0xd6b97e, 0, 1), darkStone = material(0x5f7773, .04, .96);
    var paleStone = material(0xafb8a0, .02, .92), leafDark = material(0x245541, 0, .86);
    var leafLight = material(0x548956, 0, .86), leafNew = material(0x80a859, 0, .88);
    var coral = material(0xe58160, .02, .88), cream = material(0xf4e4b5, 0, .9);
    var movingPalms = [], flags = [], birds = [], rigidGroups = [];

    function tiledTexture(size, repeats, paint) {
      var t = ctx.texture(size, size, paint);
      t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeats, repeats); return t;
    }
    var sandTexture = tiledTexture(512, 6, function (c, w, h) {
      c.fillStyle = '#cfc18d'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 21000; i++) {
        c.fillStyle = i % 3 ? 'rgba(248,238,193,' + (.04 + random() * .17) + ')' : 'rgba(108,95,66,' + (.025 + random() * .12) + ')';
        c.fillRect(random() * w, random() * h, .4 + random() * 1.4, .4 + random() * 1.1);
      }
      for (var y = -15; y < h + 20; y += 17) {
        c.strokeStyle = 'rgba(245,233,179,.15)'; c.lineWidth = 1.5; c.beginPath();
        for (var x = 0; x <= w; x += 8) {
          var yy = y + Math.sin(x / 55 + y * .024) * 5;
          if (!x) c.moveTo(x, yy); else c.lineTo(x, yy);
        }
        c.stroke();
      }
    });
    var sand = new T.MeshStandardMaterial({ color: 0xf8e3b5, map: sandTexture, metalness: 0, roughness: .97 });
    var wetSand = material(0xab9f74, .03, .84);
    // The flat inner sand extends beyond every corner of the combat square.
    // The final rings slope gently beneath the ocean; there is no raised fight platform.
    function islandTerrain() {
      var pos = [], uv = [], indices = [], segments = 96, rings = 13;
      for (var r = 0; r <= rings; r++) {
        var radius = .02 + r / rings * 26.5;
        for (var s = 0; s <= segments; s++) {
          var a = s / segments * PI * 2;
          var edge = Math.max(0, (radius - 20.8) / 5.7);
          var rr = radius + edge * (Math.sin(a * 5 + .3) * .55 + Math.sin(a * 9) * .25);
          var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          pos.push(x, -Math.pow(edge, 1.65) * 1.18, z); uv.push(x / 42 + .5, z / 42 + .5);
          if (r < rings && s < segments) {
            var n = r * (segments + 1) + s;
            indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1);
          }
        }
      }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
      var land = mesh(geo, sand, group); land.receiveShadow = true;
    }
    islandTerrain();

    var markings = ctx.texture(2048, 2048, function (c, w, h) {
      c.clearRect(0, 0, w, h); c.translate(w / 2, h / 2);
      var extent = b / (b + .5) * w / 2;
      c.strokeStyle = 'rgba(248,237,185,.78)'; c.lineWidth = 9; c.strokeRect(-extent, -extent, extent * 2, extent * 2);
      c.strokeStyle = 'rgba(116,133,104,.28)'; c.lineWidth = 4; c.strokeRect(-extent + 17, -extent + 17, extent * 2 - 34, extent * 2 - 34);
      c.strokeStyle = 'rgba(55,133,131,.27)';
      [265, 275, 338].forEach(function (r, i) { c.lineWidth = i === 1 ? 3 : 9; c.beginPath(); c.arc(0, 0, r, 0, PI * 2); c.stroke(); });
      for (var k = 0; k < 16; k++) {
        c.save(); c.rotate(k * PI / 8); c.fillStyle = 'rgba(63,133,130,.31)';
        c.beginPath(); c.moveTo(-9, 295); c.lineTo(0, 323); c.lineTo(9, 295); c.closePath(); c.fill(); c.restore();
      }
      c.fillStyle = 'rgba(58,132,127,.24)'; c.save(); c.rotate(-.12);
      c.beginPath(); c.ellipse(0, 32, 88, 72, 0, 0, PI * 2); c.fill();
      [[-84, -66, 28, 40, -.4], [-30, -102, 28, 43, -.12], [33, -104, 28, 43, .1], [87, -64, 28, 40, .4]].forEach(function (p) {
        c.beginPath(); c.ellipse(p[0], p[1], p[2], p[3], p[4], 0, PI * 2); c.fill();
      }); c.restore();
      c.textAlign = 'center'; c.fillStyle = 'rgba(55,125,122,.34)'; c.font = '900 49px Arial'; c.fillText('OIL ISLAND', 0, 184);
      c.font = '600 17px monospace'; c.fillText('ORELHA EDITION', 0, 216);
      for (var q = 0; q < 4; q++) {
        c.save(); c.rotate(q * PI / 2); c.fillStyle = 'rgba(246,232,176,.68)';
        for (var tick = -3; tick <= 3; tick++) c.fillRect(tick * 84 - 5, extent - 28, 10, 28);
        c.fillStyle = 'rgba(59,125,123,.38)'; c.font = '700 25px monospace'; c.fillText('ILHA / 01', 0, extent - 66); c.restore();
      }
    });
    var paint = mesh(new T.PlaneGeometry((b + .5) * 2, (b + .5) * 2), new T.MeshBasicMaterial({ map: markings, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), group, 0, .007, 0);
    paint.rotation.x = -PI / 2;

    var oceanUniforms = { time: { value: 0 }, nearColor: { value: new T.Color(0x46cfbc) }, farColor: { value: new T.Color(0x1b8298) }, horizonColor: { value: new T.Color(0x93d9dd) } };
    var oceanMaterial = new T.ShaderMaterial({ uniforms: oceanUniforms,
      vertexShader: 'uniform float time;varying vec3 vWorld;void main(){vec3 p=position;p.z+=sin(p.x*.14+time*.45)*.055+cos(p.y*.2-time*.32)*.035;vec4 wp=modelMatrix*vec4(p,1.);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}',
      fragmentShader: 'uniform float time;uniform vec3 nearColor;uniform vec3 farColor;uniform vec3 horizonColor;varying vec3 vWorld;void main(){vec2 p=vWorld.xz;float d=length(p);float a=sin(p.x*.81+p.y*.4+time*.62);float b=sin(p.x*.36-p.y*.69-time*.41);float rip=pow(max(0.,a*b),8.);float broad=sin(p.y*.2+sin(p.x*.16)*.8+time*.5);vec3 c=mix(nearColor,farColor,smoothstep(23.,63.,d));c+=vec3(.1,.16,.13)*rip*.48;c+=vec3(.024,.049,.036)*broad;float horizon=smoothstep(60.,112.,d);c=mix(c,horizonColor,horizon*.74);gl_FragColor=vec4(c,1.);}'
    });
    var ocean = mesh(new T.PlaneGeometry(250, 250, 56, 56), oceanMaterial, group, 0, -.68, 0); ocean.rotation.x = -PI / 2;
    ocean.userData.keepDynamic = true;
    // Broken translucent ribbons place foam at the actual sand/water intersection.
    var foamTex = tiledTexture(512, 1, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      for (var i = 0; i < 1000; i++) {
        var x = random() * w, y = h * .5 + (random() - .5) * h * .74;
        c.fillStyle = 'rgba(239,255,228,' + (.08 + random() * .38) + ')';
        c.beginPath(); c.ellipse(x, y, random() * 18 + 3, random() * 9 + 2, random() * PI, 0, PI * 2); c.fill();
      }
    });
    var foamMat = new T.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: .64, depthWrite: false, side: T.DoubleSide });
    // A thin ribbon has no translucent interior requiring a back/front pass.
    foamMat.forceSinglePass = true;
    function foamRibbon(radius, width, start, end) {
      var p = [], uv = [], ind = [], n = 90;
      for (var i = 0; i <= n; i++) {
        var a = start + (end - start) * i / n;
        for (var k = 0; k < 2; k++) {
          var rr = radius + (k - .5) * width + Math.sin(a * 5 + .3) * .55 + Math.sin(a * 9) * .25;
          p.push(Math.cos(a) * rr, -.57 + Math.sin(a * 13) * .025, Math.sin(a) * rr); uv.push(i / n * 7, k);
        }
        if (i < n) { var j = i * 2; ind.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
      return mesh(g, foamMat, group);
    }
    var foam = foamRibbon(24.5, 1.35, -.05, PI * 2); foam.userData.keepDynamic = true;

    var stoneGeo = new T.IcosahedronGeometry(1, 2);
    var sp = stoneGeo.attributes.position;
    for (var s = 0; s < sp.count; s++) {
      var px = sp.getX(s), py = sp.getY(s), pz = sp.getZ(s);
      var uneven = 1 + Math.sin(px * 5.7 + pz * 3.9) * .07 + Math.sin(py * 7.1 - pz * 2.3) * .045;
      sp.setXYZ(s, px * uneven, py * uneven, pz * uneven);
    }
    stoneGeo.computeVertexNormals();
    function rock(parent, x, y, z, sx, sy, sz, light) {
      var m = mesh(stoneGeo, light ? paleStone : darkStone, parent, x, y, z, sx, sy, sz, true);
      m.rotation.y = random() * PI; return m;
    }
    [[-22, -8, 3.8], [-20, -19, 4.2], [21, -18, 4.1], [23, 2, 2.7], [-20, 10, 2.4]].forEach(function (r, i) {
      rock(group, r[0], .45, r[1], r[2], r[2] * .55, r[2] * .8, i % 2);
      rock(group, r[0] + 2, -.15, r[1] + 2.1, r[2] * .64, r[2] * .39, r[2] * .58, !i % 2);
      rock(group, r[0] - 1.9, -.21, r[1] + 2.8, r[2] * .4, r[2] * .29, r[2] * .47, true);
    });
    for (var pebble = 0; pebble < 44; pebble++) {
      var a = random() * PI * 2, r = 21 + random() * 3;
      rock(detail, Math.cos(a) * r, -.1, Math.sin(a) * r, .16 + random() * .3, .11 + random() * .21, .19 + random() * .3, pebble % 3);
    }

    function curveTube(points, radius, mat, parent, segments) {
      var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
      return mesh(new T.TubeGeometry(curve, segments || 24, radius, 6, false), mat, parent);
    }
    // Fronds have folded blades and a central rib, not flat rectangular leaves.
    function frond(length, spread, drop, mat) {
      var pos = [], uv = [], indices = [], steps = 15;
      for (var i = 0; i <= steps; i++) {
        var t = i / steps, w = Math.pow(Math.sin(t * PI), .8) * spread;
        var y = Math.sin(t * PI * .88) * .56 - t * t * drop;
        pos.push(-w, y - w * .34, t * length, 0, y, t * length, w, y - w * .34, t * length);
        uv.push(0, t, .5, t, 1, t);
        if (i < steps) { var j = i * 3; indices.push(j, j + 3, j + 1, j + 1, j + 3, j + 4, j + 1, j + 4, j + 2, j + 2, j + 4, j + 5); }
      }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
      return new T.Mesh(g, mat);
    }
    var palmLeafMats = [leafDark, leafLight, leafNew].map(function (m) { var copy = m.clone(); copy.side = T.DoubleSide; return copy; });
    function palm(parent, x, z, height, leanX, leanZ, animated) {
      var p = new T.Group(); p.position.set(x, -.04, z); parent.add(p);
      var pts = [[0, 0, 0], [leanX * .18, height * .34, leanZ * .18], [leanX * .52, height * .71, leanZ * .52], [leanX, height, leanZ]];
      curveTube(pts, .24, woodLight, p, 22).castShadow = true;
      for (var i = 1; i < 14; i++) {
        var t = i / 14, px = leanX * t * t, pz = leanZ * t * t;
        var band = mesh(new T.TorusGeometry(.241, .017, 4, 9), wood, p, px, height * t, pz);
        band.rotation.x = PI / 2; band.rotation.z = -leanX / height;
      }
      var crown = new T.Group(); crown.position.set(leanX, height, leanZ); p.add(crown);
      for (var j = 0; j < 9; j++) {
        var leaf = frond(3.2 + random() * 1.3, .43 + random() * .18, 1.05 + random() * .6, palmLeafMats[j % 3]);
        leaf.rotation.y = j * PI * 2 / 9 + .2; leaf.rotation.x = -.14 + random() * .2; leaf.castShadow = true; crown.add(leaf);
      }
      for (var c = 0; c < 3; c++) mesh(new T.SphereGeometry(.19, 8, 6), wood, crown, Math.sin(c * 2.1) * .26, -.18, Math.cos(c * 2.1) * .26);
      if (animated) { crown.name = 'Swaying palm crown'; crown.userData.keepDynamic = true; rigidGroups.push(crown); movingPalms.push({ mesh: crown, phase: random() * PI * 2 }); }
    }
    palm(group, -17.5, -17.9, 7.8, -1.6, -.8, true);
    palm(group, -21, -13.8, 9.2, 1.2, -1, false);
    palm(group, 18.9, -16.5, 8.4, -.8, -.4, true);
    palm(group, 23, -11, 7.4, -1.6, -.9, false);
    palm(group, -21.2, 4, 6.7, -.8, -.2, false);
    palm(group, 21, 8.4, 7.3, 1.6, -1.1, true);

    function plant(x, z, scale) {
      var g = new T.Group(); g.position.set(x, -.05, z); g.scale.setScalar(scale); group.add(g);
      for (var i = 0; i < 7; i++) {
        var leaf = frond(1.35 + random() * .6, .24, .12, palmLeafMats[i % 3]); leaf.rotation.y = i * PI * 2 / 7;
        leaf.rotation.x = -.9 + random() * .35; g.add(leaf);
      }
    }
    [[-18.8, -16.3, 1.2], [-20.6, -11.2, 1], [20.8, -17.9, 1.3], [22, -8, 1.2], [-20, 3, .9], [20.4, 9, 1]].forEach(function (p) { plant(p[0], p[1], p[2]); });

    // Four low rope lines sit outside the full combat square, leaving every exit readable.
    var edge = b + 2.1;
    for (var side = -1; side <= 1; side += 2) {
      for (var i = -1; i <= 1; i++) {
        var t = i * edge;
        mesh(new T.CylinderGeometry(.12, .16, .58, 8), wood, group, t, .22, side * edge, 1, 1, 1, true);
        mesh(new T.CylinderGeometry(.12, .16, .58, 8), wood, group, side * edge, .22, t, 1, 1, 1, true);
      }
      for (var span = -1; span < 1; span++) {
        curveTube([[span * edge, .47, side * edge], [(span + .5) * edge, .26, side * edge], [(span + 1) * edge, .47, side * edge]], .035, rope, group, 16);
        curveTube([[side * edge, .47, span * edge], [side * edge, .26, (span + .5) * edge], [side * edge, .47, (span + 1) * edge]], .035, rope, group, 16);
      }
    }

    var planks = tiledTexture(512, 1, function (c, w, h) {
      c.fillStyle = '#b7a077'; c.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 64) {
        c.fillStyle = y % 128 ? '#af946b' : '#bea782'; c.fillRect(0, y + 2, w, 60);
        for (var q = 0; q < 35; q++) { c.strokeStyle = 'rgba(74,50,27,' + random() * .14 + ')'; c.beginPath(); c.moveTo(0, y + random() * 60); c.bezierCurveTo(150, y + random() * 60, 350, y + random() * 60, 512, y + random() * 60); c.stroke(); }
        c.fillStyle = '#6f5b41'; for (var x = 10; x < w; x += w - 24) { c.fillRect(x, y + 10, 3, 3); c.fillRect(x, y + 49, 3, 3); }
      }
    });
    var deckMat = new T.MeshStandardMaterial({ map: planks, color: 0xe9cc9a, roughness: .94, metalness: .02 });
    box(group, wood, 0, -.38, -23.4, 5.3, .35, 13.2, true);
    var deck = mesh(new T.PlaneGeometry(5.3, 13.2), deckMat, group, 0, -.192, -23.4); deck.rotation.x = -PI / 2; deck.receiveShadow = true;
    for (var z = -18; z >= -29; z -= 2.8) {
      for (var side = -1; side <= 1; side += 2) {
        mesh(new T.CylinderGeometry(.15, .17, 1.9, 8), wood, group, side * 2.5, -.65, z, 1, 1, 1, true);
        if (z < -18) curveTube([[side * 2.5, .3, z], [side * 2.5, .14, z + 1.4], [side * 2.5, .3, z + 2.8]], .035, rope, group, 8);
      }
    }
    // Palm-thatched shelter frames the far side instead of hanging over the fighters.
    for (var x = -1; x <= 1; x += 2) for (var z = -1; z <= 1; z += 2) rod(group, wood, x * 3.3, -.35, -26 + z * 2.15, x * 3.3, 3.7, -26 + z * 2.15, .13);
    var thatch = tiledTexture(512, 3, function (c, w, h) {
      c.fillStyle = '#b59859'; c.fillRect(0, 0, w, h);
      for (var i = 0; i < 1100; i++) { c.strokeStyle = i % 3 ? 'rgba(82,71,35,.25)' : 'rgba(246,222,146,.4)'; c.lineWidth = .5 + random() * 2; c.beginPath(); var x = random() * w, y = random() * h; c.moveTo(x, y); c.lineTo(x + random() * 12 - 6, y + 55 + random() * 80); c.stroke(); }
    });
    var roofMat = new T.MeshStandardMaterial({ map: thatch, color: 0xe6cf91, side: T.DoubleSide, roughness: 1, metalness: 0 });
    for (var side = -1; side <= 1; side += 2) {
      var roof = mesh(new T.PlaneGeometry(8.1, 3.7), roofMat, group, 0, 4.2, -26 + side * 1.65, 1, 1, 1, true);
      roof.rotation.x = side > 0 ? -PI / 2 + .42 : -PI / 2 - .42;
      for (var r = -4; r <= 4; r += .35) rod(group, rope, r, 3.45, -26 + side * 3.33, r + .04, 3.11 + random() * .14, -26 + side * 3.4, .019);
    }
    rod(group, wood, -4, 4.94, -26, 4, 4.94, -26, .13);
    box(group, woodLight, 0, 1, -27, 5.5, .9, .9, true); box(group, wood, 0, 1.51, -27, 5.7, .14, 1.1, true);
    ctx.makeSign(group, 'OIL ISLAND', 'ORELHA EDITION / ILHA', 0, 2.6, -23.8, 5.3, 1.5, '#f4ddb0', 0);
    for (var barrel = -1; barrel <= 1; barrel += 2) {
      mesh(new T.CylinderGeometry(.53, .48, .96, 14), barrel < 0 ? coral : material(0x5b9390, .12, .74), group, barrel * 4.9, .15, -21.5, 1, 1, 1, true);
      ctx.ring(group, .522, .027, wood, barrel * 4.9, -.08, -21.5);
      ctx.ring(group, .515, .027, wood, barrel * 4.9, .46, -21.5);
    }
    // Small triangular bunting and a moored sailboat add a human scale.
    var flagGeo = new T.BufferGeometry(); flagGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, .42, -.67, 0, .84, 0, 0], 3)); flagGeo.computeVertexNormals();
    var flagMats = [coral, cream, material(0x4daca8, 0, .84)].map(function (m) { var f = m.clone(); f.side = T.DoubleSide; return f; });
    curveTube([[-8.5, 3.5, -20], [0, 2.9, -20], [8.5, 3.5, -20]], .023, rope, group, 20);
    rod(group, wood, -8.5, 0, -20, -8.5, 3.5, -20, .075); rod(group, wood, 8.5, 0, -20, 8.5, 3.5, -20, .075);
    for (var i = 0; i < 17; i++) {
      var x = -8 + i * .96, f = mesh(flagGeo, flagMats[i % 3], group, x, 2.92 + Math.pow(x / 8.5, 2) * .58, -20);
      f.userData.keepDynamic = true; flags.push(f);
    }
    var boat = new T.Group(); boat.name = 'Moored sailboat'; boat.position.set(9, -.48, -34); boat.rotation.y = -.4; boat.userData.keepDynamic = true; group.add(boat);
    var hullShape = new T.Shape(); hullShape.moveTo(0, -2.5); hullShape.quadraticCurveTo(1.3, -1.7, 1.1, 1.6); hullShape.quadraticCurveTo(0, 2.8, -1.1, 1.6); hullShape.quadraticCurveTo(-1.3, -1.7, 0, -2.5);
    var hull = mesh(new T.ExtrudeGeometry(hullShape, { depth: .5, bevelEnabled: true, bevelThickness: .12, bevelSize: .12, bevelSegments: 2, steps: 1, curveSegments: 10 }), cream, boat); hull.rotation.x = PI / 2;
    rod(boat, wood, 0, 0, 0, 0, 5.7, 0, .055); rod(boat, wood, 0, 1, 0, 2.8, 1, 0, .04);
    var sailGeo = new T.BufferGeometry(); sailGeo.setAttribute('position', new T.Float32BufferAttribute([.07, 5.5, 0, .07, 1.08, 0, 2.75, 1.08, 0], 3)); sailGeo.computeVertexNormals();
    var sailMat = cream.clone(); sailMat.side = T.DoubleSide; mesh(sailGeo, sailMat, boat);
    curveTube([[0, 0, 2.2], [-3, -.12, 2], [-6, -.12, 4]], .015, rope, boat, 12);
    rigidGroups.push(boat);

    // Background land masses stay low enough to retain the broad sea horizon.
    [[-46, -53, 9, 3.8, 7], [48, -59, 12, 4.1, 8], [-60, 13, 7, 2.7, 6]].forEach(function (p, i) {
      rock(detail, p[0], -.8, p[1], p[2], p[3], p[4], true);
      if (i < 2) { palm(detail, p[0] - 2, p[1], 7.2, 1.1, .8, false); palm(detail, p[0] + 3, p[1] + 1, 5.7, -.8, .7, false); }
    });
    var birdMat = new T.MeshBasicMaterial({ color: 0x566970, side: T.DoubleSide });
    var birdGeo = new T.BufferGeometry(); birdGeo.setAttribute('position', new T.Float32BufferAttribute([-.58, .08, 0, -.2, 0, .11, 0, .08, 0, 0, .08, 0, .2, 0, .11, .58, .08, 0], 3)); birdGeo.computeVertexNormals();
    for (var j = 0; j < 5; j++) { var bird = mesh(birdGeo, birdMat, detail, -26 + j * 3.3, 15 + j % 3, -40 - j * 3); bird.userData.keepDynamic = true; birds.push(bird); }

    return {
      group: group, detail: detail, animated: [], rigidGroups: rigidGroups, colliders: [], bounds: b,
      lighting: { background: 0x9bd4da, fogColor: 0xb5dedd, fogNear: 48, fogFar: 126, hemiSky: 0xd6f2eb, hemiGround: 0xc4ac7c, hemiIntensity: 2.35, keyColor: 0xffefc9, keyIntensity: 3.2, coolColor: 0x89d4dd, coolIntensity: 1.35 },
      update: function (time, dt, reducedMotion) {
        var t = reducedMotion ? 0 : time;
        oceanUniforms.time.value = t; foamMat.opacity = .58 + Math.sin(t * .67) * .09;
        foam.position.y = Math.sin(t * .67) * .035;
        for (var i = 0; i < movingPalms.length; i++) { var p = movingPalms[i]; p.mesh.rotation.z = Math.sin(t * .42 + p.phase) * .032; p.mesh.rotation.x = Math.sin(t * .35 + p.phase) * .018; }
        for (var j = 0; j < flags.length; j++) flags[j].rotation.x = Math.sin(t * 2.1 + j * .62) * .12;
        boat.position.y = -.48 + Math.sin(t * .7) * .075; boat.rotation.z = Math.sin(t * .61) * .025;
        for (var k = 0; k < birds.length; k++) { birds[k].position.x = -26 + k * 3.3 + Math.sin(t * .06 + k * .2) * 4; birds[k].rotation.z = Math.sin(t * 1.7 + k * .6) * .08; }
      }
    };
  };
}());
