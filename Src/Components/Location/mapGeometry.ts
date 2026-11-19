export function toPixel(lat:number,lon:number,z:number){const size=256*2**z,s=Math.sin(Math.min(85.051128,Math.max(-85.051128,lat))*Math.PI/180);return {x:(lon+180)/360*size,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*size};}
export function fromPixel(x:number,y:number,z:number){const size=256*2**z;return {lat:Math.atan(Math.sinh(Math.PI*(1-2*Math.max(0,Math.min(size,y))/size)))*180/Math.PI,lon:((x/size*360)%360+360)%360-180};}
export function radiusPixels(m:number,lat:number,z:number){return m/(156543.03392*Math.cos(lat*Math.PI/180)/2**z);}
