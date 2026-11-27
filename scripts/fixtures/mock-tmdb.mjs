// Offline TMDB stand-in used by the genre/OTT tests: intercepts the global fetch
// for api.themoviedb.org and answers with a small deterministic catalog.
import fs from 'node:fs';
const logPath=process.env.TMDB_FIXTURE_LOG||'';
const realFetch=globalThis.fetch;
const results=Array.from({length:40},(_,i)=>({
  id:1000+i,media_type:i%2?'tv':'movie',title:`Fixture Title ${i}`,name:`Fixture Title ${i}`,
  overview:'Fixture overview',poster_path:'/fixture-poster.jpg',backdrop_path:'/fixture-backdrop.jpg',vote_average:7.4,vote_count:1200,
  release_date:'2024-05-01',first_air_date:'2024-05-01',original_language:'en',genre_ids:[28],
  popularity:100-i,adult:false
}));
const body=q=>{
  const page=Number(new URL(q,'https://x').searchParams.get('page')||1);
  return {page,total_pages:2,total_results:80,results};
};
globalThis.fetch=async function(input,init){
  const url=typeof input==='string'?input:input?.url||String(input);
  if(!url.includes('api.themoviedb.org')){
    if(url.includes('graphql.anilist.co'))return new Response(JSON.stringify({data:{Page:{pageInfo:{hasNextPage:false},media:[]}}}),{status:200,headers:{'Content-Type':'application/json'}});
    return realFetch(input,init);
  }
  try{if(logPath)fs.appendFileSync(logPath,url+'\n')}catch{}
  // A single forced failure lets the test prove transient errors are not cached.
  // The server resolves genre names first, so the query carries an id, not a name.
  // The genre route resolves names to ids, so Comedy arrives as with_genres=35.
  // Fail that catalog exactly once: the route must surface an error and must not
  // cache the failure as an exhausted catalog.
  if(/with_genres=35\b/.test(url)&&!globalThis.__fixtureComedyFailed){
    globalThis.__fixtureComedyFailed=true;return new Response('{}',{status:500});
  }
  const payload=url.includes('/discover/')||url.includes('/movie/')||url.includes('/tv/')
    ? body(url) : {genres:[{id:28,name:'Action'},{id:35,name:'Comedy'}]};
  return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
};
