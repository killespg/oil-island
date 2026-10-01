/* Closed, smoothly blended surfaces for articulated character bodies. */
(function () {
  'use strict';

  function ellipsoid(x,y,z,cx,cy,cz,rx,ry,rz) {
    x-=cx;y-=cy;z-=cz;
    var qx=x/rx,qy=y/ry,qz=z/rz;
    var k0=Math.sqrt(qx*qx+qy*qy+qz*qz);
    if(k0<1e-9)return -Math.min(rx,ry,rz);
    var k1=Math.sqrt(qx*qx/(rx*rx)+qy*qy/(ry*ry)+qz*qz/(rz*rz));
    return k0*(k0-1)/k1;
  }
  function capsule(x,y,z,a,b,radius) {
    var dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
    var px=x-a[0],py=y-a[1],pz=z-a[2],length2=dx*dx+dy*dy+dz*dz;
    var h=length2?Math.max(0,Math.min(1,(px*dx+py*dy+pz*dz)/length2)):0;
    px-=dx*h;py-=dy*h;pz-=dz*h;
    var r=Array.isArray(radius)?radius[0]+(radius[1]-radius[0])*h:radius;
    return Math.sqrt(px*px+py*py+pz*pz)-r;
  }
  function smoothUnion(a,b,k) {
    if(!(k>0))return Math.min(a,b);
    var h=Math.max(0,Math.min(1,.5+.5*(b-a)/k));
    return b+(a-b)*h-k*h*(1-h);
  }

  function build(T,options) {
    var min=options.bounds.min,max=options.bounds.max,r=options.resolution||[56,88,40];
    var nx=Math.floor(r[0]),ny=Math.floor(r[1]),nz=Math.floor(r[2]);
    if(![nx,ny,nz].every(function(n){return n>=4&&n<=180;}))throw new Error('Invalid organic surface resolution');
    if(!min.every(function(n,i){return Number.isFinite(n)&&Number.isFinite(max[i])&&max[i]>n;}))throw new Error('Invalid organic surface bounds');
    var field=options.field,dx=(max[0]-min[0])/nx,dy=(max[1]-min[1])/ny,dz=(max[2]-min[2])/nz;
    var sy=nx+1,sz=sy*(ny+1),count=sz*(nz+1),values=new Float32Array(count);
    var xs=new Float64Array(nx+1),ys=new Float64Array(ny+1),zs=new Float64Array(nz+1);
    for(var ix=0;ix<=nx;ix++)xs[ix]=min[0]+ix*dx;
    for(var iy=0;iy<=ny;iy++)ys[iy]=min[1]+iy*dy;
    for(var iz=0;iz<=nz;iz++)zs[iz]=min[2]+iz*dz;
    for(var z=0;z<=nz;z++)for(var y=0;y<=ny;y++)for(var x=0;x<=nx;x++){
      var value=field(xs[x],ys[y],zs[z]);
      if(!Number.isFinite(value))throw new Error('Non-finite organic surface field');
      if(value<0&&(x===0||y===0||z===0||x===nx||y===ny||z===nz))throw new Error('Organic surface crosses its bounds at '+[xs[x],ys[y],zs[z]].join(','));
      values[z*sz+y*sy+x]=value;
    }
    var positions=[],normals=[],colors=[],uvs=[],indices=[],skinIndex=[],skinWeight=[];
    var edgeVertices=new Map(),epsilon=Math.min(dx,dy,dz)*.22;
    var normal={x:0,y:0,z:0};
    function vertex(a,b) {
      if(a>b){var swap=a;a=b;b=swap;}
      var t=values[a]/(values[a]-values[b]);
      var key=t<1e-8?-a-1:t>1-1e-8?-b-1:a*count+b,found=edgeVertices.get(key);
      if(found!==undefined)return found;
      var za=Math.floor(a/sz),ra=a-za*sz,ya=Math.floor(ra/sy),xa=ra-ya*sy;
      var zb=Math.floor(b/sz),rb=b-zb*sz,yb=Math.floor(rb/sy),xb=rb-yb*sy;
      var px=xs[xa]+(xs[xb]-xs[xa])*t,py=ys[ya]+(ys[yb]-ys[ya])*t,pz=zs[za]+(zs[zb]-zs[za])*t;
      var gx=field(px+epsilon,py,pz)-field(px-epsilon,py,pz);
      var gy=field(px,py+epsilon,pz)-field(px,py-epsilon,pz);
      var gz=field(px,py,pz+epsilon)-field(px,py,pz-epsilon);
      var length=Math.sqrt(gx*gx+gy*gy+gz*gz)||1;
      normal.x=gx/length;normal.y=gy/length;normal.z=gz/length;
      var index=positions.length/3;
      positions.push(px,py,pz);normals.push(normal.x,normal.y,normal.z);
      var paint=options.paint?options.paint(px,py,pz,normal):null;
      var color=paint&&paint.color;
      colors.push(color?(color.r===undefined?color[0]:color.r):1,color?(color.g===undefined?color[1]:color.g):1,color?(color.b===undefined?color[2]:color.b):1);
      uvs.push(paint&&paint.uv?paint.uv[0]:px,paint&&paint.uv?paint.uv[1]:py);
      if(options.skin){
        var skin=options.skin(px,py,pz),sum=0,weights=[];
        for(var wi=0;wi<4;wi++){weights[wi]=Math.max(0,Number(skin.weights[wi])||0);sum+=weights[wi];}
        if(sum<1e-8){weights=[1,0,0,0];sum=1;}
        for(var si=0;si<4;si++){skinIndex.push(skin.indices[si]||0);skinWeight.push(weights[si]/sum);}
      }
      edgeVertices.set(key,index);return index;
    }
    function triangle(a,b,c) {
      if(a===b||a===c||b===c)return;
      var aa=a*3,bb=b*3,cc=c*3;
      var abx=positions[bb]-positions[aa],aby=positions[bb+1]-positions[aa+1],abz=positions[bb+2]-positions[aa+2];
      var acx=positions[cc]-positions[aa],acy=positions[cc+1]-positions[aa+1],acz=positions[cc+2]-positions[aa+2];
      var gx=aby*acz-abz*acy,gy=abz*acx-abx*acz,gz=abx*acy-aby*acx;
      var direction=gx*(normals[aa]+normals[bb]+normals[cc])+gy*(normals[aa+1]+normals[bb+1]+normals[cc+1])+gz*(normals[aa+2]+normals[bb+2]+normals[cc+2]);
      if(direction<0)indices.push(a,c,b);else indices.push(a,b,c);
    }
    // All cubes share the same body diagonal, so neighboring tetrahedra share
    // vertices exactly. No separate ellipsoid surfaces remain in the result.
    var tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
    var corners=new Int32Array(8),inside=[],outside=[];
    for(var cz=0;cz<nz;cz++)for(var cy=0;cy<ny;cy++)for(var cx=0;cx<nx;cx++){
      var base=cz*sz+cy*sy+cx;
      corners[0]=base;corners[1]=base+1;corners[2]=base+sy+1;corners[3]=base+sy;
      corners[4]=base+sz;corners[5]=base+sz+1;corners[6]=base+sz+sy+1;corners[7]=base+sz+sy;
      var mask=0;for(var bit=0;bit<8;bit++)if(values[corners[bit]]<0)mask|=1<<bit;
      if(mask===0||mask===255)continue;
      for(var ti=0;ti<6;ti++){
        inside.length=outside.length=0;
        var tet=tetrahedra[ti];
        for(var corner=0;corner<4;corner++){
          var id=corners[tet[corner]];(values[id]<0?inside:outside).push(id);
        }
        if(inside.length===1){
          triangle(vertex(inside[0],outside[0]),vertex(inside[0],outside[1]),vertex(inside[0],outside[2]));
        }else if(inside.length===3){
          triangle(vertex(outside[0],inside[0]),vertex(outside[0],inside[1]),vertex(outside[0],inside[2]));
        }else if(inside.length===2){
          var ac=vertex(inside[0],outside[0]),ad=vertex(inside[0],outside[1]);
          var bc=vertex(inside[1],outside[0]),bd=vertex(inside[1],outside[1]);
          triangle(ac,ad,bc);triangle(ad,bd,bc);
        }
      }
    }
    var geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    if(options.skin){
      geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndex,4));
      geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeight,4));
    }
    geometry.setIndex(indices);geometry.computeBoundingSphere();geometry.computeBoundingBox();
    geometry.userData.organicSurface={vertices:positions.length/3,triangles:indices.length/3,resolution:[nx,ny,nz]};
    return geometry;
  }
  window.NeonOrganic={build:build,ellipsoid:ellipsoid,capsule:capsule,smoothUnion:smoothUnion};
})();
