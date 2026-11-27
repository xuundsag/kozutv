// Build catalogue families from explicit AniList PREQUEL/SEQUEL relationships.
// Movies and non-anime entries are deliberately excluded. No network needed at runtime.
const EPISODIC = new Set(['TV','TV_SHORT','ONA','OVA','SPECIAL']);
export function buildAnimeFamilies(items, records, curatedGroups = []) {
  const eligible = new Map(items.filter(x => x && x.type === 'anime' && !x.isMovie && EPISODIC.has(String(x.format || '').toUpperCase())).map(x => [String(x.id), x]));
  // Include non-playable series as graph bridges, but never put them in the
  // selector. This connects available seasons separated by an unavailable one.
  const graphIds = new Set([...eligible.keys(),...Object.entries(records||{}).filter(([,r])=>EPISODIC.has(String(r.format||'').toUpperCase())).map(([id])=>id)]);
  const parent = new Map([...graphIds].map(x => [x,x]));
  function find(id){let p=parent.get(id);if(p!==id)parent.set(id,p=find(p));return p}
  function join(a,b){if(!parent.has(a)||!parent.has(b))return;let x=find(a),y=find(b);if(x!==y)parent.set(y,x)}
  for (const [id, record] of Object.entries(records || {})) {
    if(!parent.has(id))continue;
    for(const edge of record.relations || []) {
      const target=String(edge.idMal);
      if(['PREQUEL','SEQUEL'].includes(edge.type) && (EPISODIC.has(String(edge.format || '').toUpperCase()) || eligible.has(target))) join(id,target);
    }
  }
  for(const group of curatedGroups){const ids=group.map(String).filter(id=>eligible.has(id));for(let i=1;i<ids.length;i++)join(ids[0],ids[i])}
  const groups=new Map();for(const [id,item] of eligible){let root=find(id);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(item)}
  const out=[];
  for(const group of groups.values()){
    if(group.length<2)continue;
    const date = x => {const d=records?.[String(x.id)]?.startDate||{};return [(Number(d.year)||Number(x.year)||9999),Number(d.month)||1,Number(d.day)||1,Number(x.id)||0]};
    group.sort((a,b)=>{let x=date(a),y=date(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return String(a.id).localeCompare(String(b.id))});
    out.push(group);
  }
  return out;
}
