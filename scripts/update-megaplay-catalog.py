import urllib.request, urllib.error, json, time, datetime, os, re
BASE='https://anikotoapi.site/recent-anime?page={}&per_page=100'
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'data','megaplay-catalog.json')
HEAD={'User-Agent':'kozuTV/5.0 catalog indexer','Accept':'application/json'}
def number(value):
    try:return int(value or 0)
    except (TypeError,ValueError):return 0
rows={}
aliases=set()
def normalize(value):
    return re.sub(r'[^a-z0-9]+',' ',str(value or '').lower()).strip()
def add_aliases(row):
    values=[row.get('title'),row.get('alternative'),row.get('native')]+str(row.get('titles') or '').split(',')
    for value in values:
        for variant in (value,re.sub(r'\(\d{4}\)','',str(value or ''))):
            key=normalize(variant)
            if len(key)>1:aliases.add(key)
page=1
total_pages=93
while page<=total_pages:
    url=BASE.format(page)
    for attempt in range(6):
        try:
            req=urllib.request.Request(url,headers=HEAD)
            with urllib.request.urlopen(req,timeout=30) as response:
                data=json.load(response)
            break
        except urllib.error.HTTPError as e:
            if e.code==429:
                wait=max(65,int(e.headers.get('Retry-After','65') or 65))
                print(f'Rate limited on page {page}; waiting {wait}s',flush=True);time.sleep(wait);continue
            if e.code in (500,502,503,504):time.sleep(8);continue
            raise
        except Exception as e:
            if attempt==5:raise
            print(f'Retrying page {page}: {e}',flush=True);time.sleep(8)
    else: raise RuntimeError(f'Could not fetch page {page}')
    total_pages=int(data.get('pagination',{}).get('total_pages',total_pages))
    for row in data.get('data',[]):
        add_aliases(row)
        mal=str(row.get('mal_id') or '').strip();ani=str(row.get('ani_id') or '').strip()
        if not mal and not ani:continue
        episode_count=number(row.get('episodes')) or number(row.get('is_sub')) or number(row.get('is_dub'))
        # Long-running series such as One Piece leave episodes blank but expose
        # their actual released totals through is_sub/is_dub.
        if episode_count<1:continue
        terms=row.get('terms_by_type') if isinstance(row.get('terms_by_type'),dict) else {}
        genres=terms.get('genre') if isinstance(terms.get('genre'),list) else []
        formats=terms.get('type') if isinstance(terms.get('type'),list) else []
        entry={'id':int(row['id']),'mal':mal,'ani':ani,'title':row.get('title') or '','english':str(row.get('titles') or '').split(',')[0].strip(),'alternative':row.get('alternative') or '','titles':row.get('titles') or '','native':row.get('native') or '','poster':row.get('poster') or '','backdrop':row.get('background_image') or '','description':row.get('description') or '','year':number(row.get('year')),'status':row.get('status') or '','score':str(row.get('score') or ''),'genres':[str(x) for x in genres],'format':str(formats[0] if formats else ''),'aired':row.get('aired') or '','episodes':episode_count,'dub':bool(number(row.get('is_dub')))}
        # Prefer the most recently updated provider row if an ID occurs twice.
        key=mal or 'ani:'+ani
        old=rows.get(key)
        if old is None or str(row.get('updated_at',''))>=str(old.get('updated','')):
            entry['updated']=str(row.get('updated_at',''));rows[key]=entry
    print(f'Page {page}/{total_pages}: {len(rows)} indexed',flush=True)
    if page%5==0 or page==total_pages:
        tmp=OUT+'.tmp';json.dump({'source':'https://anikotoapi.site','generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'aliases':sorted(aliases),'entries':list(rows.values())},open(tmp,'w'),separators=(',',':'));os.replace(tmp,OUT)
    page+=1
    time.sleep(2.1)
print(f'Done: {len(rows)} provider entries written to {OUT}',flush=True)
