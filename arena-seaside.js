/* Oil Island (Orelha Edition) — Orla Brava, a coastal city at golden hour. */
(function () {
  'use strict';
  var builders = window.OilArenaBuilders || (window.OilArenaBuilders = {});

  builders.seaside = function (ctx) {
    var T = ctx.THREE, PI = Math.PI, b = ctx.bounds;
    var mesh = ctx.mesh, box = ctx.box, rod = ctx.rod, material = ctx.material;
    var group = new T.Group(), detail = new T.Group(), colliders = [];
    group.name = 'Orla Brava'; detail.name = 'Orla Brava details'; group.add(detail);
    // A private seed makes revisiting this beach independent of roster/menu order.
    var seed = 48381;
    function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
    function repeat(tex, x, y) { tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(x, y); return tex; }
    function flat(geo, mat, parent, x, y, z) {
      var m = mesh(geo, mat, parent, x, y, z); m.rotation.x = -PI / 2; m.receiveShadow = true; return m;
    }

    var sandTex = ctx.texture(1024, 1024, function (c, w, h) {
      c.fillStyle = '#ddc18a'; c.fillRect(0, 0, w, h);
      // Dense grains, sparse shell fragments and shallow wind ripples, not a flat fill.
      for (var i = 0; i < 33000; i++) {
        var value = random();
        c.fillStyle = value < .4 ? 'rgba(91,68,39,.15)' : value < .85 ? 'rgba(255,245,208,.27)' : 'rgba(193,144,78,.25)';
        var s = .5 + random() * 1.6; c.fillRect(random() * w, random() * h, s, s);
      }
      for (var r = 0; r < 15; r++) {
        c.strokeStyle = 'rgba(164,122,69,.075)'; c.lineWidth = 1.4; c.beginPath();
        for (var x = -10; x <= w + 10; x += 8) {
          var y = r * 79 + Math.sin(x * .009 + r * .72) * 13;
          if (x === -10) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
    });
    var sand = new T.MeshStandardMaterial({color: 0xffeed2, map: repeat(sandTex, 5, 5), roughness: .98, metalness: 0});
    var wetSand = material(0xb69c71, 0, .56);
    flat(new T.PlaneGeometry(68, 55), sand, group, 0, -.025, 8);
    flat(new T.PlaneGeometry(93, 12), wetSand, group, -14, -.04, -24.5);

    var arenaTex = ctx.texture(1024, 1024, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(249,245,219,.90)'; c.lineWidth = 5;
      c.strokeRect(22, 22, w - 44, h - 44);
      c.strokeStyle = 'rgba(255,249,226,.5)'; c.lineWidth = 2; c.strokeRect(36, 36, w - 72, h - 72);
      c.save(); c.translate(w / 2, h / 2);
      c.strokeStyle = 'rgba(252,247,221,.46)'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 192, 0, PI * 2); c.stroke();
      c.setLineDash([3, 14]); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 212, 0, PI * 2); c.stroke(); c.setLineDash([]);
      // Hand-painted coastal emblem: a rising sun over three surf lines.
      c.fillStyle = 'rgba(239,126,74,.38)'; c.beginPath(); c.arc(0, -35, 75, PI, PI * 2); c.fill();
      c.strokeStyle = 'rgba(36,127,141,.37)'; c.lineWidth = 9;
      for (var row = 0; row < 3; row++) {
        c.beginPath(); for (var q = -120; q <= 120; q += 4) {
          var y = 1 + row * 27 + Math.sin(q * .034) * 8;
          if (q === -120) c.moveTo(q, y); else c.lineTo(q, y);
        } c.stroke();
      }
      c.textAlign = 'center'; c.fillStyle = 'rgba(74,87,67,.57)';
      c.font = '900 35px Arial'; c.fillText('ORLA BRAVA', 0, 142);
      c.font = 'bold 19px Arial'; c.fillText('ORELHA EDITION', 0, 170); c.restore();
      c.font = 'bold 22px Arial'; c.fillStyle = 'rgba(64,107,109,.55)'; c.textAlign = 'center';
      c.fillText('OIL ISLAND  /  BEACH CLUB', w / 2, 85);
      c.save(); c.translate(w / 2, h - 73); c.rotate(PI); c.fillText('OIL ISLAND  /  BEACH CLUB', 0, 0); c.restore();
      c.fillStyle = 'rgba(242,133,77,.80)';
      [[23, 23], [w - 55, 23], [23, h - 55], [w - 55, h - 55]].forEach(function (p) { c.fillRect(p[0], p[1], 32, 32); });
    });
    var arenaPaint = new T.MeshBasicMaterial({map: arenaTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1});
    flat(new T.PlaneGeometry((b + .6) * 2, (b + .6) * 2), arenaPaint, group, 0, .006, 0);

    var seaTex = ctx.texture(512, 512, function (c, w, h) {
      c.fillStyle = '#70a9a9'; c.fillRect(0, 0, w, h);
      for (var j = 0; j < 1250; j++) {
        c.strokeStyle = 'rgba(230,238,202,' + (.025 + random() * .17) + ')';
        c.lineWidth = .5 + random() * 1.6; var x = random() * w, y = random() * h;
        c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 6, y - 2, x + 12, y + 2, x + random() * 37 + 10, y); c.stroke();
      }
    });
    var ocean = new T.MeshStandardMaterial({map: repeat(seaTex, 16, 14), color: 0x358b9c, roughness: .34, metalness: .18});
    flat(new T.PlaneGeometry(188, 145), ocean, group, -32, -.12, -101);
    // A second shallow strip makes the shoreline legible against warm sand.
    var shallows = new T.MeshStandardMaterial({color: 0x71bdba, roughness: .39, metalness: .08, transparent: true, opacity: .76, depthWrite: false});
    flat(new T.PlaneGeometry(92, 7), shallows, group, -14, -.073, -30.5);
    var foamMat = new T.MeshBasicMaterial({color: 0xf7ead5, transparent: true, opacity: .65, depthWrite: false, side: T.DoubleSide});
    // These flat foam strips need one transparent pass, including from below.
    foamMat.forceSinglePass = true;
    var waveRows = [];
    for (var row = 0; row < 5; row++) {
      var vertices = [], indices = [], count = 100;
      for (var n = 0; n <= count; n++) {
        var xx = -60 + n * .91, zz = Math.sin(n * .28 + row) * .31 + Math.sin(n * .071) * .7;
        var width = .065 + .055 * (1 + Math.sin(n * .73 + row));
        vertices.push(xx, 0, zz - width, xx, 0, zz + width);
        if (n < count) { var k = n * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      var foamGeo = new T.BufferGeometry(); foamGeo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3)); foamGeo.setIndex(indices); foamGeo.computeVertexNormals();
      var wave = mesh(foamGeo, foamMat, group, 0, -.035 - row * .014, -27.4 - row * 3.9);
      wave.userData.keepDynamic = true; waveRows.push({mesh: wave, z: wave.position.z, phase: row * 1.6});
    }

    var chalk = material(0xe8dfc4, .02, .9), stone = material(0x666e65, .02, .87);
    var wood = material(0x77523b, .02, .91), paleWood = material(0xb88b52, .02, .89);
    var dark = material(0x293f48, .28, .6), glass = material(0x507e83, .25, .33);
    var coral = material(0xc97561, 0, .91), turquoise = material(0x419b9c, .03, .84);
    var saffron = material(0xd8ab57, 0, .88), cream = material(0xe2d4b0, 0, .88), pink = material(0xba8981, 0, .88);
    var lamp = new T.MeshBasicMaterial({color: 0xffd592});
    var trunkMat = material(0x857350, 0, .95), palmMat = material(0x477953, 0, .93), palmLight = material(0x6a8b54, 0, .91);
    palmMat.side = palmLight.side = T.DoubleSide;

    var promenadeTex = ctx.texture(512, 512, function (c, w, h) {
      c.fillStyle = '#e2dcc7'; c.fillRect(0, 0, w, h);
      // Portuguese stone mosaic, individually offset stones with continuous dark surf.
      for (var yy = -10; yy < h; yy += 13) for (var xx = -10; xx < w; xx += 13) {
        var px = xx + (Math.floor(yy / 13) % 2) * 6, phase = yy - Math.sin(px / w * PI * 2) * 48;
        var stripe = ((phase % 170) + 170) % 170 < 56;
        c.fillStyle = stripe ? (random() > .4 ? '#52615f' : '#68716a') : (random() > .4 ? '#d4ceb7' : '#eee6cc');
        c.fillRect(px + .6, yy + .6, 11.5, 11.5);
      }
    });
    var promenade = new T.MeshStandardMaterial({map: repeat(promenadeTex, 1.5, 14), color: 0xffffff, roughness: .92, metalness: 0});
    // The promenade runs beside the beach, leaving the square fighting space clear.
    box(group, chalk, 25, -.2, -4, 9.1, .7, 119);
    flat(new T.PlaneGeometry(8.7, 119), promenade, group, 25, .16, -4);
    box(group, chalk, 20.52, .25, -4, .26, .3, 119);
    box(group, chalk, 29.48, .25, -4, .26, .3, 119);
    var asphalt = material(0x536267, 0, .94);
    box(group, asphalt, 35.6, -.045, -4, 11.6, .34, 121);
    for (var laneZ = -61; laneZ < 51; laneZ += 7) box(group, cream, 35.6, .13, laneZ, .15, .012, 3.5);
    for (var line = 0; line < 7; line++) box(group, chalk, 31 + line * 1.55, .139, 10, .85, .014, 4);

    function frondGeometry(length, breadth) {
      var positions = [], indices = [];
      function center(t) { return [length * t, Math.sin(t * PI * .95) * length * .24 - t * t * length * .24, 0]; }
      // Long drooping leaflets create the cut silhouette of an actual palm canopy.
      for (var q = 0; q < 12; q++) {
        var t = .07 + q * .073, p = center(t), p2 = center(t + .073), span = Math.sin(t * PI) * breadth;
        for (var side = -1; side <= 1; side += 2) {
          var base = positions.length / 3;
          positions.push(p[0], p[1], .01 * side, p[0] + .35, p[1] - .08, span * side,
            p[0] + .63, p[1] - .2, span * .82 * side, p2[0], p2[1], .01 * side);
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
    }
    var frondGeo = frondGeometry(3.8, .85);
    function palm(x, z, height, angle) {
      var g = new T.Group(); g.position.set(x, .18, z); g.rotation.y = angle; group.add(g);
      var bend = height * .1;
      var curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(.08, height * .28, 0), new T.Vector3(bend * .45, height * .66, .05), new T.Vector3(bend, height, .13)]);
      mesh(new T.TubeGeometry(curve, 13, .18, 7, false), trunkMat, g, 0, 0, 0, 1, 1, 1, true);
      for (var t = .12; t < .98; t += .07) {
        var p = curve.getPoint(t); var ring = mesh(new T.CylinderGeometry(.196, .202, .055, 7), paleWood, detail, x + Math.cos(angle) * p.x + Math.sin(angle) * p.z, p.y + .18, z - Math.sin(angle) * p.x + Math.cos(angle) * p.z);
        ring.rotation.z = -.05;
      }
      for (var f = 0; f < 10; f++) {
        var leaf = mesh(frondGeo, f % 3 ? palmMat : palmLight, g, bend, height, .13);
        leaf.rotation.set(.04, f * PI * .2 + random() * .1, f % 3 === 0 ? .19 : -.02); leaf.scale.set(.85 + random() * .2, 1, 1);
      }
      for (var nut = 0; nut < 3; nut++) mesh(new T.SphereGeometry(.19, 7, 5), wood, detail, x + bend * Math.cos(angle) + .16 * Math.sin(nut * 2), height + .08, z - bend * Math.sin(angle) + .16 * Math.cos(nut * 2));
      colliders.push({x: x, z: z, radius: .5, bottom: 0, top: height + 2});
    }
    [-44, -29, -12, 8, 28, 45].forEach(function (z, i) { palm(22.3, z, 6.3 + (i % 3) * .7, -.4 + i * .7); });
    palm(-20, -12, 6.4, .7); palm(-23, 17, 7.1, -1.1);

    function bench(x, z) {
      for (var slat = 0; slat < 5; slat++) box(group, paleWood, x + slat * .18, .7, z, .135, .12, 2.3, true);
      for (var back = 0; back < 3; back++) box(group, paleWood, x + .92, .94 + back * .18, z, .115, .12, 2.3);
      [-.82, .82].forEach(function (offset) {
        box(group, dark, x + .12, .42, z + offset, .11, .5, .12);
        box(group, dark, x + .84, .76, z + offset, .11, 1.18, .12);
        box(group, dark, x + .48, .65, z + offset, .93, .1, .12);
      });
    }
    for (var bz = -36; bz <= 39; bz += 15) bench(26.5, bz);
    for (var lz = -51; lz <= 45; lz += 16) {
      rod(group, dark, 28.3, .15, lz, 28.3, 4.2, lz, .065);
      rod(group, dark, 28.3, 4.2, lz, 27.2, 4.53, lz, .055);
      mesh(new T.CylinderGeometry(.35, .42, .14, 12), dark, group, 27.15, 4.52, lz);
      flat(new T.CircleGeometry(.34, 12), lamp, group, 27.15, 4.435, lz).rotation.x = PI / 2;
    }

    function kiosk(x, z, mat, label) {
      var g = new T.Group(); g.position.set(x, .18, z); group.add(g);
      box(g, cream, 0, 1.22, 0, 4.2, 2.44, 3.5, true);
      box(g, mat, 0, .67, 1.8, 4.3, 1.3, .2); box(g, paleWood, 0, 1.43, 2.03, 4.6, .14, .6);
      box(g, dark, 0, 1.94, 1.77, 3.4, .83, .04);
      for (var i = 0; i < 9; i++) box(g, paleWood, -1.95 + i * .49, .62, 1.92, .028, 1.1, .025);
      var roof = mesh(new T.ConeGeometry(3.6, 1.08, 4), mat, g, 0, 2.97, 0, 1, 1, .86, true); roof.rotation.y = PI / 4;
      box(g, paleWood, 0, 2.44, 0, 4.7, .18, 3.9);
      [-1.95, 1.95].forEach(function (xx) { rod(g, paleWood, xx, 1.43, 2.07, xx, 2.52, 2.07, .055); });
      ctx.makeSign(g, label, 'BRAVA / DESDE 2016', 0, 2.16, 2.13, 2.7, .57, '#f8d5a1', 0);
      colliders.push({x: x, z: z, radius: 3.2, bottom: 0, top: 4});
    }
    kiosk(-23, -19, turquoise, 'ÁGUA DE COCO');
    kiosk(22.8, -54, coral, 'BRAVA CAFÉ');

    function umbrella(x, z, radius, mat, yaw) {
      rod(group, paleWood, x, 0, z, x, 2.34, z, .044);
      var canopyGeo = new T.ConeGeometry(radius, .55, 12, 1, true);
      var canopy = mesh(canopyGeo, mat, group, x, 2.25, z); canopy.rotation.y = yaw;
      // Alternating cream panels are made as wedges so their pattern survives LQ.
      for (var k = 0; k < 6; k++) {
        var wedge = new T.ConeGeometry(radius + .008, .553, 2, 1, true, k * PI / 3, PI / 6);
        var stripe = mesh(wedge, chalk, group, x, 2.25, z); stripe.rotation.y = yaw;
      }
      mesh(new T.SphereGeometry(.07, 7, 5), paleWood, group, x, 2.57, z);
      var chair = new T.Group(); chair.position.set(x + .75, 0, z + .6); chair.rotation.y = yaw; group.add(chair);
      box(chair, mat, 0, .38, 0, .58, .05, .85); var back = box(chair, mat, 0, .82, -.48, .58, .87, .05); back.rotation.x = -.22;
      [-.31, .31].forEach(function (side) { rod(chair, chalk, side, .06, -.42, side, .48, .39, .023); rod(chair, chalk, side, .06, .4, side, 1.2, -.56, .023); });
    }
    umbrella(-19.4, 1.8, 1.65, coral, .3); umbrella(-23.8, 8.1, 1.8, turquoise, -.45);
    umbrella(-19.8, 23, 1.65, saffron, .8); umbrella(8.5, 24, 1.55, turquoise, -.6);

    // The lifeguard hut and pennant are an unmistakable beach silhouette.
    var tower = new T.Group(); tower.position.set(-19, 0, -7); tower.rotation.y = .32; group.add(tower);
    [-1, 1].forEach(function (x) { [-.75, .75].forEach(function (z) { rod(tower, paleWood, x * 1.15, 0, z * 1.2, x, 2.25, z, .105); }); });
    rod(tower, paleWood, -1.12, .3, .95, 1, 2.16, .75, .063); rod(tower, paleWood, 1.12, .3, .95, -1, 2.16, .75, .063);
    box(tower, paleWood, 0, 2.22, 0, 2.6, .17, 2.1); box(tower, cream, 0, 2.77, -.12, 2.05, 1, 1.52);
    box(tower, dark, 0, 3.2, .65, 1.65, .42, .03);
    box(tower, coral, 0, 3.52, -.13, 2.7, .16, 2.2); box(tower, coral, 0, 2.76, .656, .46, .08, .028);
    box(tower, coral, 0, 2.76, .666, .09, .47, .028);
    for (var rung = 0; rung < 7; rung++) rod(tower, paleWood, 1.38, .16 + rung * .29, .93 + rung * .02, 1.38, .16 + rung * .29, 1.55 + rung * .02, .055);
    rod(tower, paleWood, 1.38, .1, .86, 1.38, 2.4, 1.02, .055); rod(tower, paleWood, 1.38, .1, 1.62, 1.38, 2.4, 1.78, .055);
    rod(tower, paleWood, -.85, 3.55, -.4, -.85, 5.15, -.4, .035);
    var flagGeo = new T.PlaneGeometry(.88, .49, 8, 2);
    var flag = mesh(flagGeo, saffron, tower, -.38, 4.85, -.4); flag.material = saffron.clone(); flag.material.side = T.DoubleSide; flag.userData.keepDynamic = true;
    colliders.push({x: -19, z: -7, radius: 2.3, bottom: 0, top: 5.2});

    // The urban edge has stepped balconies, shaded windows, awnings and roof rails.
    var colors = [cream, coral, turquoise, pink, saffron];
    for (var block = 0; block < 14; block++) {
      var zz = -65 + block * 9.1, height = 7.5 + (block % 4) * 2.5 + random() * 1.5, xx = 45 + (block % 3) * 1.2;
      var width = 5.9 + random() * 1.4, depth = 6.8;
      box(group, colors[block % colors.length], xx, height / 2, zz, width, height, depth, true);
      box(group, cream, xx, height + .13, zz, width + .38, .26, depth + .4);
      box(group, paleWood, xx - width / 2 - .065, 1.58, zz, .09, 2.2, 2.55);
      for (var level = 2.4; level < height - .4; level += 2.15) {
        box(group, cream, xx - width / 2 - .58, level - .87, zz, 1.25, .14, depth - .75);
        box(group, cream, xx - width / 2 - 1.1, level - .44, zz, .08, .78, depth - .76);
        for (var wz = -1.95; wz <= 2; wz += 1.95) {
          box(group, glass, xx - width / 2 - .018, level, zz + wz, .035, 1.22, 1.28);
          box(group, cream, xx - width / 2 - .053, level, zz + wz, .035, 1.3, .055);
        }
        for (var front = -1.55; front < 2; front += 1.55) {
          box(group, glass, xx + front, level, zz + depth / 2 + .02, .98, 1.23, .036);
          box(group, cream, xx + front, level + .71, zz + depth / 2 + .15, 1.15, .1, .32);
        }
      }
      // Street-facing fabric awning at the ground-floor café or shop.
      var awning = box(group, block % 2 ? coral : turquoise, xx - width / 2 - .9, 2.25, zz, 1.9, .09, 4.8); awning.rotation.z = -.16;
      colliders.push({x: xx, z: zz, radius: 5.1, bottom: 0, top: height + .5});
    }

    var mountain = material(0x698082, 0, 1);
    for (var hill = 0; hill < 7; hill++) {
      var hh = 9 + random() * 12;
      mesh(new T.SphereGeometry(1, 14, 8), mountain, group, -83 + hill * 10, -3, -106 - hill * 3, 16, hh, 13);
    }
    var sunMat = new T.MeshBasicMaterial({color: 0xffd79b, fog: false});
    mesh(new T.CircleGeometry(5.8, 64), sunMat, group, -32, 9, -118);
    // Reflection is a handful of warm narrow strokes, never an expensive light.
    for (var reflection = 0; reflection < 17; reflection++) {
      var rz = -104 + reflection * 3.15, rw = 1 + reflection * .19 + random() * 1.9;
      flat(new T.PlaneGeometry(rw, .11 + random() * .3), lamp, detail, -31 + Math.sin(reflection * 1.7) * .8, -.093, rz);
    }
    ctx.glow(detail, 0xffc981, -32, 9, -117.9, 25, .22);

    // Five anonymous background characters. Their curved meshes and joints are
    // visual scenery only; no fighter, hitbox, weapon action or damage is added.
    var runnersGroup=new T.Group(),runners=[];
    runnersGroup.name='Orla Brava / five background runners';runnersGroup.userData.keepDynamic=true;group.add(runnersGroup);
    var personSphere=new T.SphereGeometry(1,12,9),personCylinder=new T.CylinderGeometry(1,1,1,12);
    function profile(points){return new T.LatheGeometry(points.map(function(p){return new T.Vector2(p[0],p[1]);}),16);}
    var shirtGeo=profile([[0,0],[.21,0],[.25,.08],[.245,.26],[.29,.46],[.32,.59],[.28,.65],[.135,.73],[0,.73]]);
    var shortsGeo=profile([[0,-.15],[.21,-.15],[.25,-.05],[.25,.1],[.23,.17],[0,.17]]);
    var batGeo=profile([[0,-.08],[.057,-.075],[.07,-.045],[.067,-.012],[.04,.015],[.034,.14],[.034,.40],[.042,.60],[.063,.85],[.093,1.06],[.116,1.26],[.12,1.42],[.113,1.49],[.086,1.535],[.04,1.555],[0,1.56]]);
    var shoeMat=material(0xf0e7d4,.02,.88),soleMat=material(0x48484b,.02,.94),batMat=material(0x80532d,.04,.77),gripMat=material(0x30241c,.03,.95);
    var shirtMats=[0xced5c8,0x47788a,0xb97158,0x535c79,0xbdaa77].map(function(c){return material(c,.02,.87);});
    var skinMats=[0xe7bea1,0xf0cdb0,0xdab090,0xe9c1ac,0xdfb69c].map(function(c){return material(c,0,.92);});
    var hairMats=[0x493329,0x9a7143,0x282b2a,0x664537,0xbe945d].map(function(c){return material(c,.01,.97);});
    var shortsMats=[material(0x344755,0,.94),material(0x5a5d50,0,.94),material(0x71655e,0,.94)];
    function ball(parent,mat,x,y,z,sx,sy,sz){return mesh(personSphere,mat,parent,x,y,z,sx,sy,sz,true);}
    function joint(parent,x,y,z,name){var g=new T.Group();g.position.set(x,y,z);g.name=name;g.userData.keepDynamic=true;parent.add(g);return g;}
    function limb(parent,mat,length,topRadius,bottomRadius){
      var part=mesh(personCylinder,mat,parent,0,-length/2,0,topRadius,length,bottomRadius,true);
      // Round joint caps overlap the limb instead of exposing cylinder ends.
      ball(parent,mat,0,0,0,topRadius,topRadius,topRadius);ball(parent,mat,0,-length,0,bottomRadius,bottomRadius,bottomRadius);return part;
    }
    function mergeRunnerParts(parent){
      parent.updateMatrixWorld(true);var inverse=parent.matrixWorld.clone().invert(),buckets={};
      parent.children.forEach(function(part){if(part.isMesh)(buckets[part.material.uuid]||(buckets[part.material.uuid]=[])).push(part);});
      Object.keys(buckets).forEach(function(id){
        var parts=buckets[id];if(parts.length<2)return;
        var geometries=[],count=0,indexCount=0;
        parts.forEach(function(part){var geo=part.geometry.clone();geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,part.matrixWorld));geometries.push(geo);count+=geo.attributes.position.count;indexCount+=geo.index?geo.index.count:geo.attributes.position.count;});
        // Preserve vertex reuse in curved anatomy; expanding sphere indices here
        // multiplies both the uploaded buffer and vertex shader work per actor.
        var positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2),indices=count>65535?new Uint32Array(indexCount):new Uint16Array(indexCount),cursor=0,indexCursor=0;
        geometries.forEach(function(geo){
          positions.set(geo.attributes.position.array,cursor*3);normals.set(geo.attributes.normal.array,cursor*3);if(geo.attributes.uv)uvs.set(geo.attributes.uv.array,cursor*2);
          var length=geo.index?geo.index.count:geo.attributes.position.count;
          for(var i=0;i<length;i++)indices[indexCursor++]=cursor+(geo.index?geo.index.getX(i):i);
          cursor+=geo.attributes.position.count;geo.dispose();
        });
        var merged=new T.BufferGeometry();merged.setAttribute('position',new T.BufferAttribute(positions,3));merged.setAttribute('normal',new T.BufferAttribute(normals,3));merged.setAttribute('uv',new T.BufferAttribute(uvs,2));merged.setIndex(new T.BufferAttribute(indices,1));merged.computeBoundingSphere();
        parts.forEach(function(part){parent.remove(part);});mesh(merged,parts[0].material,parent,0,0,0,1,1,1,true);
      });
    }
    for(var runnerIndex=0;runnerIndex<5;runnerIndex++){
      var person=joint(runnersGroup,0,0,0,'Background runner '+(runnerIndex+1));person.userData.nonCombatant=true;
      person.userData.genericCharacter=true;person.scale.setScalar(1.32+(runnerIndex%3)*.045);
      var skin=skinMats[runnerIndex],shirt=shirtMats[runnerIndex],pants=shortsMats[runnerIndex%3];
      var body=joint(person,0,.95,0,'Torso and head');
      mesh(shortsGeo,pants,body,0,0,0,1,1,.8,true);mesh(shirtGeo,shirt,body,0,.01,0,1,1,.68,true);
      ball(body,skin,0,.78,0,.106,.16,.10);
      ball(body,skin,0,1.015,.025,.18,.24,.175);
      ball(body,skin,-.176,1.01,.018,.039,.065,.034);ball(body,skin,.176,1.01,.018,.039,.065,.034);
      ball(body,skin,0,.994,.195,.039,.049,.052);
      var hair=ball(body,hairMats[runnerIndex],0,1.157,-.018,.185,.12+runnerIndex%2*.035,.174);hair.rotation.z=(runnerIndex-2)*.05;
      if(runnerIndex===1||runnerIndex===4)for(var tuft=0;tuft<3;tuft++)ball(body,hairMats[runnerIndex],-.09+tuft*.075,1.25+tuft*.012,-.025,.075,.085,.12);
      if(runnerIndex===2)ball(body,hairMats[runnerIndex],0,1.055,-.136,.155,.19,.072);
      for(var faceSide=-1;faceSide<=1;faceSide+=2){
        ball(body,dark,faceSide*.064,1.035,.184,.014,.015,.009);
        var brow=ball(body,hairMats[runnerIndex],faceSide*.064,1.073,.181,.034,.010,.012);brow.rotation.z=-faceSide*.09;
      }
      var arms=[],legs=[];
      for(var limbSide=-1;limbSide<=1;limbSide+=2){
        var arm=joint(body,limbSide*.31,.61,0,'Shoulder '+limbSide);limb(arm,shirt,.25,.105,.09);
        var elbow=joint(arm,0,-.27,0,'Elbow '+limbSide);limb(elbow,skin,.29,.077,.054);ball(elbow,skin,0,-.34,.012,.063,.084,.052);
        var hip=joint(person,limbSide*.145,.91,0,'Hip '+limbSide);limb(hip,pants,.35,.118,.101);
        var knee=joint(hip,0,-.36,0,'Knee '+limbSide);limb(knee,skin,.38,.073,.053);
        ball(knee,shoeMat,0,-.40,.075,.096,.071,.178);ball(knee,soleMat,0,-.441,.079,.096,.026,.177);
        if(limbSide===1){
          var bat=joint(elbow,0,-.32,.025,'Wooden baseball bat');bat.rotation.set(-.18,0,-.90);
          mesh(batGeo,batMat,bat,0,0,0,1,1,1,true);
          mesh(personCylinder,gripMat,bat,0,.19,0,.045,.34,.045,true);mergeRunnerParts(bat);
        }
        arms.push({upper:arm,elbow:elbow});legs.push({hip:hip,knee:knee});
        mergeRunnerParts(elbow);mergeRunnerParts(arm);mergeRunnerParts(knee);mergeRunnerParts(hip);
      }
      mergeRunnerParts(body);
      runners.push({root:person,body:body,arms:arms,legs:legs,index:runnerIndex});
    }
    function unit(value){return Math.max(0,Math.min(1,value));}
    function ease(value){value=unit(value);return value*value*(3-2*value);}
    function mix(a,z,t){return a+(z-a)*t;}
    function chaseAvailable(state){return !!(state&&state.arena==='seaside'&&state.phase==='intro'&&state.round===1&&!state.training&&state.fighters&&state.fighters.some(function(f){return f&&f.character==='orelha';}));}
    var chaseResult={active:false,kind:'orelha-chase',fighters:[{},{}],cameraPosition:[0,0,0],cameraTarget:[0,0,0],cameraWeight:0};
    function cutscene(time,state,reducedMotion){
      var t=Number.isFinite(time)?Math.max(0,Math.min(6.2,time)):0,u=unit(t/4.8),progress=ease(u);
      chaseResult.active=Number.isFinite(time)&&time>=0&&time<=6.2&&chaseAvailable(state);
      for(var player=0;player<2;player++){
        var target=state&&state.fighters&&state.fighters[player]||{},out=chaseResult.fighters[player],isDog=target.character==='orelha';
        var tx=Number.isFinite(target.x)?target.x:(player?3.35:-3.35),tz=Number.isFinite(target.z)?target.z:0;
        var startX=17+player*1.4,startZ=-19-player*1.4,dx=tx-startX,dz=tz-startZ;
        out.x=isDog&&t<4.8?mix(startX,tx,progress):tx;out.z=isDog&&t<4.8?mix(startZ,tz,progress):tz;out.y=0;
        var targetYaw=Number.isFinite(target.yaw)?target.yaw:(player?-PI/2:PI/2),runYaw=Math.atan2(dx,dz);
        var yawDelta=((targetYaw-runYaw+PI)%(PI*2)+PI*2)%(PI*2)-PI;
        out.yaw=isDog?runYaw+yawDelta*ease((t-4.25)/.55):targetYaw;
        out.cinematic='chase';out.runSpeed=isDog&&t<4.8?Math.hypot(dx,dz)*6*u*(1-u)/4.8:0;
        out.crouch=isDog&&!reducedMotion?Math.sin(u*PI)*.07:0;out.jumpT=1;
      }
      var track=ease(t/4.8);
      chaseResult.cameraPosition[0]=reducedMotion?3:mix(3,-7,track);
      chaseResult.cameraPosition[1]=reducedMotion?15:mix(8.5,6.4,track);
      chaseResult.cameraPosition[2]=reducedMotion?29:mix(-5,17,track);
      chaseResult.cameraTarget[0]=reducedMotion?6:mix(18,0,track);
      chaseResult.cameraTarget[1]=1.45;chaseResult.cameraTarget[2]=reducedMotion?-9:mix(-21.5,0,track);
      chaseResult.cameraWeight=1-ease((t-5.05)/1.15);
      return chaseResult;
    }
    function updateRunners(time,reducedMotion,state){
      var intro=chaseAvailable(state)&&Number.isFinite(state.phaseTime)&&state.phaseTime>=0&&state.phaseTime<=6.2;
      var t=intro?state.phaseTime:6.2;
      for(var i=0;i<runners.length;i++){
        var runner=runners[i],stop=3.25+i*.13,u=unit(t/stop),progress=ease(u),speed=intro&&u<1?Math.sin(u*PI):0;
        // Spread across the establishing camera's screen-right axis, rather
        // than along its view ray, so all five bodies and bats remain readable.
        var startX=16.8+i*1.3,startZ=-27+i*1.2,endX=b+2.2+i*.9,endZ=-b-1.8+i*1.7;
        runner.root.position.set(mix(startX,endX,progress),0,mix(startZ,endZ,progress));
        var runningYaw=Math.atan2(endX-startX,endZ-startZ),idleYaw=-.95;
        runner.root.rotation.y=mix(runningYaw,idleYaw,ease((t-stop+.5)/.5));
        var phase=t*10.8+i*1.31,bob=reducedMotion?0:Math.abs(Math.sin(phase))*speed*.045;
        runner.body.position.y=.95+bob;runner.body.rotation.x=reducedMotion?0:speed*.12;
        for(var side=0;side<2;side++){
          var cycle=Math.sin(phase+side*PI),amplitude=reducedMotion?.30:.68;
          runner.legs[side].hip.rotation.x=cycle*speed*amplitude;
          runner.legs[side].knee.rotation.x=Math.max(0,-cycle)*speed*(reducedMotion?.35:.85);
          runner.arms[side].upper.rotation.x=(side===1?-.16:.10)-cycle*speed*(side===1?.23:.52);
          runner.arms[side].upper.rotation.z=side===0?.075:-.065;
          runner.arms[side].elbow.rotation.x=-.22-speed*(side===1?.28:.50);
        }
      }
    }
    updateRunners(0,true,null);

    var flagPosition = flagGeo.attributes.position, flagRest = new Float32Array(flagPosition.array);
    return {
      group: group, detail: detail, animated: [], colliders: colliders, bounds: b, cutscene:cutscene,
      lighting: {
        background: 0x6b91ab, fogColor: 0xd9b39a, fogNear: 55, fogFar: 190,
        hemiSky: 0xc5e0eb, hemiGround: 0xba996e, hemiIntensity: 2.0,
        keyColor: 0xffd8ae, keyIntensity: 2.9, coolColor: 0xa6dce4, coolIntensity: 1.25
      },
      update: function (time, dt, reducedMotion, state) {
        updateRunners(time,reducedMotion,state);
        var t = reducedMotion ? 0 : time;
        for (var w = 0; w < waveRows.length; w++) {
          var wave = waveRows[w]; wave.mesh.position.z = wave.z + Math.sin(t * .37 + wave.phase) * .64;
          wave.mesh.position.x = Math.sin(t * .15 + wave.phase) * .23;
        }
        seaTex.offset.x = reducedMotion ? 0 : (time * .0014) % 1;
        seaTex.offset.y = reducedMotion ? 0 : (time * .0006) % 1;
        for (var i = 0; i < flagPosition.count; i++) {
          var ix = i * 3, weight = (flagRest[ix] + .44) / .88;
          flagPosition.array[ix + 2] = flagRest[ix + 2] + Math.sin(t * 2.4 + weight * 5) * .09 * weight;
        }
        flagPosition.needsUpdate = true;
      }
    };
  };
}());
