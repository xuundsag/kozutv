import assert from 'node:assert/strict';import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL||'http://localhost:3011';const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const [width,height] of [[390,844],[844,390],[1280,720]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let database={likes:100,dislikes:20,mine:0};let fail=false,posted=[];
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),m=route.request().method();let v={};
   if(u.pathname==='/api/auth/me')v={configured:true,database:true,user:{id:'testing',name:'Test'}};
   else if(u.pathname==='/api/state')v={watchlist:[],history:[],settings:{}};
   else if(u.pathname==='/api/detail')v={item:{id:'11',type:'movie',title:'Test Film',isMovie:true,genres:[],poster:'',description:''},seasons:[],episodes:[]};
   else if(u.pathname==='/api/reactions'&&m==='GET')v={...database,available:true};
   else if(u.pathname==='/api/reactions'&&m==='POST'){
    const body=route.request().postDataJSON();posted.push(body);await new Promise(ok=>setTimeout(ok,500));
    if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"failed"}'});
    database.likes-=database.mine===1?1:0;database.dislikes-=database.mine===-1?1:0;database.mine=body.reaction;database.likes+=database.mine===1?1:0;database.dislikes+=database.mine===-1?1:0;v={...database,available:true};
   } else if(u.pathname==='/api/play')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"not available"}'});
   else v={items:[],watchlist:[],history:[]};await route.fulfill({contentType:'application/json',body:JSON.stringify(v)});
  });
  await page.goto(base+'/watch/movie/11',{waitUntil:'domcontentloaded'});await page.waitForSelector('#player');await page.waitForFunction(()=>document.querySelector('[data-count-like]')?.textContent==='100');
  let pos=await page.evaluate(()=>{let p=document.querySelector('#player').getBoundingClientRect(),h=document.querySelector('.header').getBoundingClientRect();return {top:p.top,bottom:p.bottom,height:innerHeight,header:h.bottom,center:(p.top+p.bottom)/2}});
  assert.ok(pos.top>=pos.header-1&&pos.bottom<=height+1,`player outside ${width}x${height}: ${JSON.stringify(pos)}`);
  assert.ok(Math.abs(pos.center-(height+pos.header)/2)<12,`player not centered: ${JSON.stringify(pos)}`);
  if(width===390){
   await page.locator('[data-react="1"]').click();assert.equal(await page.locator('[data-count-like]').textContent(),'101');assert.equal(await page.locator('[data-react="1"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-react="-1"]').click();assert.equal(await page.locator('[data-count-like]').textContent(),'100');assert.equal(await page.locator('[data-count-dislike]').textContent(),'21');
   await page.waitForTimeout(1200);assert.equal(database.mine,-1);assert.deepEqual(posted.map(x=>[x.reaction,x.set]),[[1,true],[-1,true]]);
   fail=true;await page.locator('[data-react="1"]').click();assert.equal(await page.locator('[data-count-like]').textContent(),'101');await page.waitForTimeout(700);assert.equal(await page.locator('[data-react="-1"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('[data-reaction-status]').textContent(),/Could not save/);
  }
  assert.deepEqual(errors,[]);await page.close();console.log('PASS player fit and UI',width,height);
 }
}finally{await browser.close()}
