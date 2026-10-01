/* Oil Island — an open-air nightclub around a clear, playable dance floor. */
(function () {
  'use strict';
  window.OilArenaBuilders = window.OilArenaBuilders || {};
  window.OilArenaBuilders.nightclub = function (ctx) {
    var T = ctx.THREE, PI = Math.PI, b = ctx.bounds;
    var group = new T.Group(), detail = new T.Group();
    group.name = 'Oil Island / Clube Maré';
    group.add(detail);
    var mesh = ctx.mesh, box = ctx.box, rod = ctx.rod, random = ctx.random;
    var mat = ctx.material, neon = ctx.neon, glow = ctx.glow;
    var charcoal = mat(0x11131e, .55, .43), charcoalSoft = mat(0x1d182e, .25, .68);
    var brushed = mat(0x485063, .85, .3), darkChrome = mat(0x262434, .82, .24);
    var plum = mat(0x572e53, .1, .88), upholstery = mat(0x232645, .15, .86);
    var teal = neon(0x42ded1, 1.35), pink = neon(0xed528e, 1.1);
    var amber = neon(0xffb777, 1.1), violet = neon(0x9071e6, 1.2);
    var cyanSoft = new T.MeshBasicMaterial({color: 0x59d2d5, transparent: true, opacity: .22, depthWrite: false});
    var warmSoft = new T.MeshBasicMaterial({color: 0xf281b0, transparent: true, opacity: .13, depthWrite: false});
    var sphere = new T.SphereGeometry(1, 10, 7);
    var cylinder = new T.CylinderGeometry(1, 1, 1, 16);
    var smallCylinder = new T.CylinderGeometry(1, 1, 1, 10);
    var black = mat(0x070b15, .25, .72);
    var colliders = [];

    // The unbroken lit square is exactly the simulation boundary. All furniture
    // and people start beyond b + 2, leaving the complete arena unobstructed.
    box(group, charcoalSoft, 0, -.66, 0, 69, 1.2, 62, true);
    box(group, darkChrome, 0, -.23, 0, b * 2 + 1.6, .42, b * 2 + 1.6, true);
    var floorTexture = ctx.texture(1024, 1024, function (c, w, h) {
      var gradient = c.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#172634'); gradient.addColorStop(.55, '#302139'); gradient.addColorStop(1, '#131d2e');
      c.fillStyle = gradient; c.fillRect(0, 0, w, h);
      var cell = w / 12;
      for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
        var tint = (x + y) % 5;
        c.fillStyle = tint === 0 ? 'rgba(64,159,173,.11)' : tint === 2 ? 'rgba(159,64,126,.1)' : 'rgba(80,70,107,.08)';
        c.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
        c.strokeStyle = 'rgba(112,113,147,.26)'; c.lineWidth = 1.6;
        c.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        c.strokeStyle = 'rgba(183,204,218,.11)'; c.lineWidth = .7;
        c.beginPath(); c.moveTo(x * cell + 7, y * cell + 7); c.lineTo((x + 1) * cell - 7, y * cell + 7); c.stroke();
      }
      c.save(); c.translate(w / 2, h / 2); c.rotate(-PI / 4);
      c.strokeStyle = 'rgba(104,196,194,.35)'; c.lineWidth = 6;
      c.strokeRect(-165, -165, 330, 330);
      c.strokeStyle = 'rgba(167,105,165,.23)'; c.lineWidth = 2;
      c.strokeRect(-189, -189, 378, 378); c.restore();
      c.textAlign = 'center'; c.fillStyle = 'rgba(185,202,215,.33)';
      c.font = '900 47px Arial'; c.fillText('CLUBE', w / 2, h / 2 - 12);
      c.font = '900 72px Arial'; c.fillText('MARÉ', w / 2, h / 2 + 60);
      c.fillStyle = 'rgba(152,177,192,.36)'; c.font = '700 17px monospace';
      c.fillText('OIL ISLAND • AFTER DARK', w / 2, h - 58);
      // Tiny scratches sit below the illumination rather than becoming glitter.
      for (var n = 0; n < 1400; n++) {
        c.fillStyle = 'rgba(190,204,223,' + (.025 + random() * .025) + ')';
        c.fillRect(random() * w, random() * h, 1 + random() * 7, .6);
      }
    });
    var floorMaterial = new T.MeshStandardMaterial({map: floorTexture, color: 0xc7cee0, roughness: .35, metalness: .48});
    var floor = mesh(new T.PlaneGeometry(b * 2, b * 2), floorMaterial, group, 0, .014, 0);
    floor.rotation.x = -PI / 2; floor.receiveShadow = true;
    for (var side = -1; side <= 1; side += 2) {
      box(group, teal, side * b, .033, 0, .065, .035, b * 2 + .06);
      box(group, teal, 0, .033, side * b, b * 2, .035, .065);
      box(group, pink, side * (b + .55), -.12, 0, .045, .045, b * 2 + 1.1);
      box(group, pink, 0, -.12, side * (b + .55), b * 2 + 1.1, .045, .045);
      for (var i = -10; i <= 10; i += 2) {
        box(group, brushed, side * (b + .28), .02, i, .16, .028, .5);
        box(group, brushed, i, .02, side * (b + .28), .5, .028, .16);
      }
    }
    for (var corner = 0; corner < 4; corner++) {
      var cx = corner % 2 ? 1 : -1, cz = corner < 2 ? 1 : -1;
      box(group, amber, cx * (b - .42), .052, cz * (b - .42), .12, .032, .85);
      box(group, amber, cx * (b - .42), .053, cz * (b - .42), .85, .032, .12);
      var wash = mesh(new T.PlaneGeometry(3.8, 3.8), corner % 2 ? cyanSoft : warmSoft, detail, cx * (b - 2.6), .035, cz * (b - 2.6));
      wash.rotation.x = -PI / 2;
    }

    // Rear stage: a low scalloped platform, analogue decks, hanging LED strips.
    var stageZ = -(b + 7);
    box(group, darkChrome, 0, .34, stageZ, 20, .8, 7, true);
    box(group, pink, 0, .75, stageZ + 3.5, 19.9, .055, .045);
    box(group, charcoal, 0, .08, stageZ + 4.1, 8, .2, 1.25, true);
    box(group, charcoal, 0, .33, stageZ + 3.8, 8, .23, .6, true);
    box(group, amber, 0, .45, stageZ + 4.07, 7.9, .03, .024);
    box(group, black, 0, 1.4, stageZ, 8.3, 1.35, 2.1, true);
    box(group, darkChrome, 0, 2.14, stageZ, 8.8, .18, 2.4, true);
    box(group, pink, 0, 1.06, stageZ + 1.068, 8.1, .025, .018);
    box(group, teal, 0, 1.68, stageZ + 1.072, 8.1, .025, .018);
    for (var deck = -1; deck <= 1; deck += 2) {
      mesh(cylinder, brushed, group, deck * 2.15, 2.265, stageZ, .62, .08, .62);
      mesh(cylinder, black, group, deck * 2.15, 2.312, stageZ, .47, .018, .47);
      mesh(cylinder, pink, group, deck * 2.15, 2.323, stageZ, .115, .014, .115);
      rod(group, brushed, deck * 2.15 + .5, 2.34, stageZ + .46, deck * 2.15 + .23, 2.36, stageZ -.02, .028);
    }
    for (var slider = 0; slider < 6; slider++) {
      box(group, brushed, -.6 + slider * .23, 2.25, stageZ, .025, .018, .61);
      box(group, slider % 2 ? amber : teal, -.6 + slider * .23, 2.29, stageZ - .15 + random() * .3, .12, .045, .08);
    }
    var monitor = box(group, charcoalSoft, .15, 2.48, stageZ - .75, 1.3, .57, .065, true);
    monitor.rotation.x = -.17;
    var monitorScreen = box(group, teal, .15, 2.49, stageZ - .71, 1.16, .42, .015);
    monitorScreen.rotation.x = -.17;

    function speaker(x, z, scale) {
      var cabinet = new T.Group(); cabinet.position.set(x, .78, z); cabinet.scale.setScalar(scale); group.add(cabinet);
      box(cabinet, charcoal, 0, 1.5, 0, 1.42, 3, 1.2, true);
      box(cabinet, darkChrome, 0, 1.5, .611, 1.24, 2.82, .04);
      [.77, 1.98].forEach(function (y) {
        var speakerRim = mesh(cylinder, brushed, cabinet, 0, y, .652, .48, .08, .48); speakerRim.rotation.x = PI / 2;
        var cone = mesh(new T.ConeGeometry(.415, .13, 20), black, cabinet, 0, y, .71); cone.rotation.x = PI / 2;
        mesh(sphere, charcoalSoft, cabinet, 0, y, .715, .16, .16, .075);
      });
      box(cabinet, black, 0, 2.72, .642, .9, .16, .05);
      box(cabinet, pink, -.62, 1.5, .653, .022, 2.75, .016);
    }
    speaker(-8, stageZ + 1, 1); speaker(8, stageZ + 1, 1);
    speaker(-6.45, stageZ - 1.5, .78); speaker(6.45, stageZ - 1.5, .78);
    colliders.push({x: -8, z: stageZ + 1, radius: 1.4, bottom: 0, top: 4.4});
    colliders.push({x: 8, z: stageZ + 1, radius: 1.4, bottom: 0, top: 4.4});

    // Wide, open truss gives the venue a silhouette without enclosing the camera.
    var trussZ = stageZ - 2.3;
    for (var column = -1; column <= 1; column += 2) {
      var tx = column * 11.5;
      rod(group, brushed, tx, .4, trussZ, tx, 7.9, trussZ, .12);
      rod(group, brushed, tx + .4, .4, trussZ, tx + .4, 7.9, trussZ, .08);
      for (var brace = 0; brace < 7; brace++) rod(group, darkChrome, tx, brace + .5, trussZ, tx + .4, brace + 1.5, trussZ, .045);
    }
    rod(group, brushed, -11.5, 7.9, trussZ, 11.9, 7.9, trussZ, .13);
    rod(group, brushed, -11.5, 7.45, trussZ, 11.9, 7.45, trussZ, .08);
    for (var tr = -11; tr < 11; tr += 1) rod(group, brushed, tr, 7.45, trussZ, tr + 1, 7.9, trussZ, .035);
    ctx.makeSign(group, 'CLUBE MARÉ', 'OIL ISLAND / ORELHA EDITION', 0, 5.15, trussZ - .2, 9.3, 2.3, '#f37da6');
    for (var light = -10; light <= 10; light += 2) {
      rod(group, darkChrome, light, 7.46, trussZ, light, 7.06, trussZ, .06);
      var fixture = mesh(smallCylinder, charcoal, group, light, 6.97, trussZ + .15, .24, .55, .24);
      fixture.rotation.x = -.5;
      var lens = mesh(smallCylinder, light % 4 ? teal : pink, group, light, 6.73, trussZ + .29, .21, .025, .21);
      lens.rotation.x = -.5;
    }

    // Static vertical LED fins make the DJ backline readable even with motion off.
    for (var fin = 0; fin < 23; fin++) {
      var fh = 1.1 + Math.sin(fin * .61) * .7 + (fin % 3) * .22;
      box(group, fin % 3 ? pink : violet, -10.5 + fin * .96, 1.8 + fh / 2, trussZ - .65, .14, fh, .06);
    }

    // Mezzanines sit outside the complete square, with no walls or roof.
    for (var balconySide = -1; balconySide <= 1; balconySide += 2) {
      var balconyX = balconySide * (b + 9);
      box(group, charcoal, balconyX, 2.6, -2, 6, .35, 18, true);
      for (var support = -9; support <= 5; support += 7) {
        rod(group, brushed, balconyX + balconySide * 2.1, -.1, support, balconyX + balconySide * 2.1, 2.44, support, .15);
      }
      box(group, pink, balconyX - balconySide * 2.99, 2.57, -2, .045, .11, 17.85);
      for (var post = -10; post <= 6; post += 2) {
        rod(group, brushed, balconyX - balconySide * 2.8, 2.76, post, balconyX - balconySide * 2.8, 3.6, post, .035);
      }
      rod(group, brushed, balconyX - balconySide * 2.8, 3.6, -10, balconyX - balconySide * 2.8, 3.6, 6, .065);
      rod(group, darkChrome, balconyX - balconySide * 2.8, 3.12, -10, balconyX - balconySide * 2.8, 3.12, 6, .035);
      // Dark open risers are tucked behind the front end of each balcony.
      for (var step = 0; step < 9; step++) {
        box(group, charcoalSoft, balconyX, .16 + step * .29, 11.1 - step * .43, 2.6, .18, .5, true);
        box(group, amber, balconyX, .256 + step * .29, 11.32 - step * .43, 2.5, .022, .022);
      }
      rod(group, brushed, balconyX - 1.45, 1.05, 11.6, balconyX - 1.45, 3.62, 7.25, .035);
      rod(group, brushed, balconyX + 1.45, 1.05, 11.6, balconyX + 1.45, 3.62, 7.25, .035);
      for (var sofa = 0; sofa < 3; sofa++) {
        var sz = -7.7 + sofa * 5;
        box(group, upholstery, balconyX + balconySide * .9, 3.05, sz, 2.1, .53, 2.8, true);
        box(group, plum, balconyX + balconySide * 1.88, 3.6, sz, .25, .9, 2.8, true);
        for (var cushion = -1; cushion <= 1; cushion += 2) box(group, plum, balconyX + balconySide * .7, 3.4, sz + cushion * .7, 1.45, .26, 1.25);
      }
    }

    // Small outdoor bar. Its bottle colors and warm canopy distinguish the social area.
    var barX = b + 4.9, barZ = 8.8;
    box(group, charcoal, barX, .77, barZ, 2.9, 1.55, 7.1, true);
    box(group, brushed, barX, 1.64, barZ, 3.2, .15, 7.35, true);
    box(group, amber, barX - 1.46, .82, barZ, .045, .08, 6.9);
    for (var strip = 0; strip < 15; strip++) box(group, plum, barX - 1.48, .82, barZ - 3.24 + strip * .46, .042, 1.36, .15);
    var bottleMats = [mat(0x398e88, .2, .27), mat(0xc0844e, .3, .3), mat(0x825a8c, .25, .35)];
    for (var bottle = 0; bottle < 17; bottle++) {
      var bz = barZ - 3 + bottle * .37, bh = .25 + random() * .2;
      mesh(smallCylinder, bottleMats[bottle % 3], group, barX + .75, 1.72 + bh / 2, bz, .09, bh, .09);
      mesh(smallCylinder, bottleMats[bottle % 3], group, barX + .75, 1.73 + bh, bz, .043, .13, .043);
    }
    for (var stool = 0; stool < 5; stool++) {
      var stoolZ = barZ - 2.6 + stool * 1.3;
      mesh(cylinder, darkChrome, group, barX - 2.25, .07, stoolZ, .34, .08, .34);
      rod(group, brushed, barX - 2.25, .08, stoolZ, barX - 2.25, .96, stoolZ, .045);
      mesh(cylinder, plum, group, barX - 2.25, 1.02, stoolZ, .31, .13, .31);
    }

    // Organic, articulated guest silhouettes, with visible elbows and bent knees.
    // A handful sway; most are static and collapse into the shared scene batches.
    var guestMats = [mat(0x425175, .08, .82), mat(0x8b496b, .08, .82), mat(0x2c746f, .08, .82), mat(0xae765d, .05, .88), mat(0x615385, .08, .83)];
    var skinMats = [mat(0x90694f, .02, .9), mat(0xc0967a, .02, .92), mat(0x4f3a35, .02, .89)];
    var legMat = mat(0x1a243a, .08, .84), hairMat = mat(0x181523, .02, .9);
    var dancers = [];
    function guest(x, z, elevation, index, moving, facing) {
      var person = new T.Group(); group.add(person); person.position.set(x, elevation || 0, z); person.rotation.y = facing || 0;
      var shirt = guestMats[index % guestMats.length], skin = skinMats[index % 3];
      var tall = .89 + (index % 5) * .055, sway = index % 2 ? .065 : -.05;
      person.scale.setScalar(tall);
      mesh(sphere, shirt, person, 0, 1.22, 0, .25, .42, .17);
      mesh(sphere, legMat, person, 0, .88, 0, .21, .17, .16);
      mesh(sphere, skin, person, 0, 1.84, .012, .16, .21, .155);
      mesh(sphere, hairMat, person, 0, 1.963, -.005, .169, .104, .154);
      rod(person, skin, 0, 1.55, 0, 0, 1.72, 0, .069);
      for (var limb = -1; limb <= 1; limb += 2) {
        rod(person, legMat, limb * .11, .87, 0, limb * (.14 + sway), .45, .07 * limb, .096);
        rod(person, legMat, limb * (.14 + sway), .45, .07 * limb, limb * .22, .12, .05, .076);
        mesh(sphere, black, person, limb * .22, .07, .105, .103, .065, .18);
        var raised = (index + (limb > 0 ? 1 : 0)) % 3 === 0;
        var elbowX = limb * (raised ? .37 : .36), elbowY = raised ? 1.9 : 1.15;
        var handX = limb * (raised ? .47 : .42), handY = raised ? 2.24 : 1.36;
        rod(person, shirt, limb * .17, 1.49, 0, elbowX, elbowY, .04, .085);
        rod(person, skin, elbowX, elbowY, .04, handX, handY, .12, .055);
        mesh(sphere, skin, person, handX, handY, .12, .068, .078, .061);
      }
      if (moving) { person.name = 'Swaying club guest ' + index; person.userData.keepDynamic = true; dancers.push({group: person, phase: index * 1.7, baseYaw: person.rotation.y}); }
      return person;
    }
    for (var row = 0; row < 2; row++) for (var member = 0; member < 14; member++) {
      var crowdX = -11.7 + member * 1.8 + (row ? .42 : 0), crowdZ = -(b + 2.3 + row * 1.45);
      guest(crowdX, crowdZ, 0, member + row * 14, row === 0 && (member === 2 || member === 11), PI + (random() - .5) * .6);
    }
    for (var guestSide = -1; guestSide <= 1; guestSide += 2) {
      for (var guestI = 0; guestI < 7; guestI++) guest(guestSide * (b + 3 + (guestI % 2) * 1.5), -7.5 + guestI * 2.05, 0, guestI + 31, false, -guestSide * PI / 2);
      for (var upper = 0; upper < 5; upper++) guest(guestSide * (b + 6.8), -8 + upper * 3.25, 2.79, upper + 50, false, -guestSide * PI / 2);
    }
    var dj = guest(.25, stageZ - .85, .76, 65, false, 0);
    // Headphones are a readable silhouette cue even from the fight camera.
    var headphones = mesh(new T.TorusGeometry(.178, .028, 5, 16, PI), brushed, dj, 0, 1.87, -.015);
    headphones.rotation.z = 0;
    mesh(sphere, charcoal, dj, -.175, 1.84, -.01, .055, .095, .063);
    mesh(sphere, charcoal, dj, .175, 1.84, -.01, .055, .095, .063);

    // High, translucent beams sweep behind the combatants. They never flash,
    // intersect the floor, or depend on a costly dynamic point-light array.
    var beams = [];
    var beamGeo = new T.ConeGeometry(.82, 12, 12, 1, true);
    beamGeo.translate(0, -6, 0);
    for (var beamIndex = 0; beamIndex < 4; beamIndex++) {
      var pivot = new T.Group(); pivot.position.set(-8 + beamIndex * 5.3, 7.1, trussZ + .2); group.add(pivot);
      pivot.userData.keepDynamic = true;
      var beamMat = new T.MeshBasicMaterial({color: beamIndex % 2 ? 0xf472b1 : 0x58cee7, transparent: true, opacity: .045, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending});
      var beam = mesh(beamGeo, beamMat, pivot, 0, 0, 0);
      pivot.rotation.x = -.8;
      pivot.rotation.z = (beamIndex - 1.5) * .15;
      beams.push({group: pivot, phase: beamIndex * 2.13, material: beamMat});
      glow(detail, beamIndex % 2 ? 0xf472b1 : 0x58cee7, pivot.position.x, 7.05, trussZ + .3, 2.6, .3);
    }
    // The mirror ball is offset behind the arena, so neither it nor its cable
    // can cover the fighters when the preview camera rotates.
    var disco = new T.Group(); disco.position.set(-5, 6.15, stageZ - .6); group.add(disco); disco.userData.keepDynamic = true;
    rod(group, brushed, -5, 7.72, stageZ - .6, -5, 6.72, stageZ - .6, .018);
    var mirror = new T.MeshStandardMaterial({color: 0xb1b9cf, metalness: 1, roughness: .17, flatShading: true});
    mesh(new T.SphereGeometry(.62, 20, 12), mirror, disco, 0, 0, 0);
    var facets = new T.InstancedMesh(new T.PlaneGeometry(.095, .084), brushed, 176);
    disco.add(facets); var helper = new T.Object3D(), facetId = 0;
    for (var lat = 1; lat < 12; lat++) for (var lon = 0; lon < 16; lon++) {
      var latitude = lat / 12 * PI, longitude = lon / 16 * PI * 2 + (lat % 2) * .08;
      helper.position.set(Math.sin(latitude) * Math.cos(longitude) * .63, Math.cos(latitude) * .63, Math.sin(latitude) * Math.sin(longitude) * .63);
      helper.lookAt(helper.position.x * 2, helper.position.y * 2, helper.position.z * 2); helper.updateMatrix();
      facets.setMatrixAt(facetId++, helper.matrix);
    }
    facets.count = facetId; facets.instanceMatrix.needsUpdate = true;

    // A few distant palms and a dark hotel outline establish a coastal night,
    // with room above the roofless club for the sky and the orbit camera.
    var palmMat = mat(0x183438, .04, .89), trunkMat = mat(0x4b3c48, .1, .88);
    for (var palm = 0; palm < 7; palm++) {
      var angle = .27 + palm * .87, px = Math.cos(angle) * 31, pz = Math.sin(angle) * 28;
      var palmHeight = 7.5 + (palm % 3) * 1.4;
      rod(group, trunkMat, px, -.1, pz, px + .65, palmHeight, pz - .3, .23);
      for (var leaf = 0; leaf < 7; leaf++) {
        var leafAngle = leaf / 7 * PI * 2, leafGroup = new T.Group(); group.add(leafGroup);
        leafGroup.position.set(px + .65, palmHeight, pz - .3); leafGroup.rotation.y = leafAngle;
        var leafShape = new T.Shape(); leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(2, .5, 4.1, -.9); leafShape.quadraticCurveTo(2, -.3, 0, 0);
        var leafMesh = mesh(new T.ShapeGeometry(leafShape, 5), palmMat, leafGroup, 0, 0, 0);
        leafMesh.rotation.x = .23; leafMesh.material.side = T.DoubleSide;
      }
    }
    box(group, charcoalSoft, 0, 1.45, -35, 48, 3, 3);
    for (var windowIndex = 0; windowIndex < 17; windowIndex++) box(group, windowIndex % 3 ? amber : pink, -22 + windowIndex * 2.7, 2.02, -33.47, .8, 1.1, .03);
    ctx.makeSign(group, 'AFTER DARK', 'MÚSICA • MAR • MOVIMENTO', -24.5, 4.1, 13.8, 5.6, 1.5, '#86d8d2', .85);

    return {
      group: group, detail: detail, animated: [], rigidGroups: dancers.map(function (d) { return d.group; }), colliders: colliders, bounds: b,
      lighting: {background: 0x101329, fogColor: 0x171a30, fogNear: 42, fogFar: 104, hemiSky: 0x879fc2, hemiGround: 0x382345, hemiIntensity: 1.6, keyColor: 0xd7d7ec, keyIntensity: 2.8, coolColor: 0x76b7d7, coolIntensity: 1.7},
      update: function (time, dt, reducedMotion) {
        var motionTime = reducedMotion ? 0 : time;
        disco.rotation.y = motionTime * .18;
        for (var d = 0; d < dancers.length; d++) {
          var dancer = dancers[d];
          dancer.group.rotation.z = Math.sin(motionTime * 1.4 + dancer.phase) * (reducedMotion ? 0 : .055);
          dancer.group.rotation.y = dancer.baseYaw + Math.sin(motionTime * .76 + dancer.phase) * (reducedMotion ? 0 : .085);
        }
        for (var l = 0; l < beams.length; l++) {
          var sweep = beams[l];
          sweep.group.rotation.z = Math.sin(motionTime * .19 + sweep.phase) * .24;
          sweep.group.rotation.x = -.87 + Math.sin(motionTime * .14 + sweep.phase) * .1;
        }
      }
    };
  };
})();
