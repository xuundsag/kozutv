// A shared upcoming card contract for anime, movies and TV.
export function mergeUpcoming(anime,movies,tv,today){
 const seen=new Set(),items=[];
 for(const item of anime||[]){if(!item?.id||!item.poster)continue;const key='anime:'+item.id;if(seen.has(key))continue;seen.add(key);items.push({...item,upcoming:true,playable:false})}
 for(const [type,rows] of [['movie',movies],['tv',tv]])for(const row of rows||[]){
  const date=type==='movie'?row.release_date:row.first_air_date;
  if(!row?.id||row.adult||!row.poster_path||!date||date<=today)continue;
  const key=type+':'+row.id;if(seen.has(key))continue;seen.add(key);
  items.push({id:String(row.id),type,title:row.title||row.name||'',description:row.overview||'',
   poster:'https://image.tmdb.org/t/p/w500'+row.poster_path,
   backdrop:'https://image.tmdb.org/t/p/original'+(row.backdrop_path||row.poster_path),
   releaseDate:date,year:date.slice(0,4),rating:row.vote_average||null,genres:[],
   originalLanguage:row.original_language||'',upcoming:true,playable:false,isMovie:type==='movie'});
 }
 // Interleave source types: neither the anime feed nor the more numerous movies
 // should push the other types below several screens of cards.
 const groups=['anime','movie','tv'].map(type=>items.filter(x=>x.type===type));
 const out=[];for(let i=0;groups.some(g=>i<g.length);i++)for(const group of groups)if(group[i])out.push(group[i]);
 return out;
}
