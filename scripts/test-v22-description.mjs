import {chromium} from 'playwright';import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const [w,h] of [[390,844],[844,390],[1280,720],[1920,900]]){
 const p=await b.newPage({viewport:{width:w,height:h}});
 const desc='A very long film description that should fill every available line before it wraps naturally to the next one. '.repeat(8);
 await p.route('**/api/**',async r=>{const u=new URL(r.request().url());let v={items:[],watchlist:[],history:[]};if(u.pathname==='/api/auth/me')v={configured:true,database:true,user:null};if(u.pathname==='/api/detail')v={item:{id:'11',type:'movie',title:'Test Film',isMovie:true,genres:[],description:desc},seasons:[],episodes:[]};if(u.pathname==='/api/reactions')v={likes:0,dislikes:0,mine:0,available:true};await r.fulfill({contentType:'application/json',body:JSON.stringify(v)})});
 await p.goto('http://localhost:3011/watch/movie/11');await p.waitForSelector('.np-desc');
 const info=await p.locator('.np-desc').evaluate(el=>{const r=el.getBoundingClientRect(),parent=el.closest('.watch-content').getBoundingClientRect(),s=getComputedStyle(el);let range=document.createRange();range.selectNodeContents(el);const lines=[...range.getClientRects()].map(x=>({x:x.x,width:x.width,y:x.y}));return {width:r.width,left:r.left,right:r.right,screen:innerWidth,parent:parent.width,max:s.maxWidth,lines}});
 assert.equal(info.max,'none');assert.ok(info.width>=w-(w<=650?38:w<=800?50:84),JSON.stringify(info));
 assert.ok(info.lines[0].width>info.width*.9,JSON.stringify(info));
 await p.locator('.np-desc').scrollIntoViewIfNeeded();await p.screenshot({path:`/home/user/screenshots/v22-description-${w}.png`});
 await p.locator('.np-desc').click();assert.equal(await p.locator('.np-desc').evaluate(el=>getComputedStyle(el).webkitLineClamp),'none');
 console.log('PASS',w,'description width',Math.round(info.width),'first line',Math.round(info.lines[0].width));await p.close();
}}finally{await b.close()}
