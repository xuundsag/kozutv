import fs from 'node:fs';import freekeys from 'freekeys';let key=(await freekeys()).tmdb_key,rows=JSON.parse(fs.readFileSync('data/spotlight.json'));
for(const x of rows.filter(x=>x.type==='anime')){
 try{
  const az=await(await fetch('https://api.ani.zip/mappings?mal_id='+x.id,{signal:AbortSignal.timeout(9000)})).json();let id=az?.mappings?.themoviedb_id||az?.mappings?.themoviedb_show_id;
  if(!id){console.log(x.title,'mapping unavailable');continue}
  let r=await(await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${key}&language=en-US`)).json();if(!r.poster_path){console.log(x.title,'no poster');continue}
  let img='https://image.tmdb.org/t/p/original'+r.poster_path;let b=Buffer.from(await(await fetch(img)).arrayBuffer());fs.writeFileSync(`/tmp/kozu-audio/poster-${x.id}.jpg`,b);
  console.log(x.title,'=>',r.name,'poster',r.poster_path,'bytes',b.length);
  x.spotlightHighRes=img;
 }catch(e){console.log(x.title,'art lookup failed')}
}
fs.writeFileSync('/tmp/kozu-audio/spotlight-highres.json',JSON.stringify(rows,null,2));
