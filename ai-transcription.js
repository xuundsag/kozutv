/* NVIDIA speech-to-text for short, bounded, ahead-of-playback HLS windows.
 * The key never enters the browser or the release archive. See README.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
const ffmpeg = ffmpegInstaller.path;
import Sanscript from '@indic-transliteration/sanscript';

export const AI_WINDOW_SECONDS = 12;
const PARAKEET = '71203149-d3b7-4460-8231-1be2543a1fca';
const WHISPER = 'b702f636-f60c-4a3d-a6f4-f3568c13bd7d';
const PARAKEET_LANGS=['en','es','de','fr','it','ar','ja','ko','pt','ru','hi','nl','da','nb','nn','cs','pl','sv','th','tr','he'];
// Hosted Whisper accepts a wider set (verified from its published language list,
// and its text-only output needs the approximate timing path).
const WHISPER_LANGS=['bn','ta','te','ml','kn','mr','pa','gu','ur','zh','vi','id','fi','el','hu','ro','uk','fa','ms','bs','sr','hr','sk','bg','lt','lv','et','is','mk','sq','hy','ka','az','kk','uz','sw','af','si','km','ne','be','tg','sd','am','my','bo','tl','mg','as','jw','su','yue','ca','eu','gl','cy','mi','la','br','oc','fo','mt','sa','haw','ht','ps','tk','sn','so','yo','ln','ha','ba','tt','lb'];
const LANGS=Object.fromEntries([...PARAKEET_LANGS.map(code=>[code,profileFor(code)]),...WHISPER_LANGS.map(code=>[code,'whisper'])]);
function profileFor(code){
  const regional={en:'en-US',es:'es-US',de:'de-DE',fr:'fr-FR',it:'it-IT',ar:'ar-AR',ja:'ja-JP',ko:'ko-KR',pt:'pt-BR',ru:'ru-RU',hi:'hi-IN',nl:'nl-NL',da:'da-DK',nb:'nb-NO',nn:'nn-NO',cs:'cs-CZ',pl:'pl-PL',sv:'sv-SE',th:'th-TH',tr:'tr-TR',he:'he-IL'};
  return regional[code]||code;
}
const ROMAN_SCHEMES={hi:'devanagari',bn:'bengali'};
// Whisper expects bare ISO codes; a few of ours are shortened for the UI.
const WHISPER_CODE={nb:'no',he:'he',zh:'zh',yue:'yue'};
// Small, unambiguous English loanword list improves readability while leaving
// other words to the transliterator. This is not a translation dictionary.
const ROMAN_LOANS={
  // Hindi/Hinglish loanwords that Indic transliteration mangles at the word
  // level ("practice" -> "praiktis", "chocolate" -> "cakalet"). These are the
  // everyday English words that actually show up in Hinglish dialogue.
  hi:[
   ['होमवर्क','homework'],['स्कूल','school'],['कॉलेज','college'],['फ़ोन','phone'],['फोन','phone'],
   ['पुलिस','police'],['टीवी','TV'],['प्रैक्टिस','practice'],['प्रेक्टिस','practice'],['प्रैक्टिस','practice'],
   ['चॉकलेट','chocolate'],['चाकलेट','chocolate'],['चॉकलेट्स','chocolates'],
   ['ट्रेन','train'],['बस','bus'],['मोबाइल','mobile'],['इंटरनेट','internet'],['कंप्यूटर','computer'],
   ['सिस्टम','system'],['फ्रेंड','friend'],['फ्रेंड्स','friends'],['टीचर','teacher'],['प्रॉब्लम','problem'],
   ['क्लास','class'],['स्टेशन','station'],['एग्जाम','exam'],['कैंसिल','cancel'],['बर्थडे','birthday'],
   ['किचन','kitchen'],['स्वेटर','sweater'],['टिकट','ticket'],['पार्टी','party'],['बैग','bag'],
   ['डांस','dance'],['पिकनिक','picnic'],['कैमरा','camera'],['बैटरी','battery'],['लाइट','light'],
   ['मीटिंग','meeting'],['ऑफिस','office'],['ऑफ़िस','office'],['होटल','hotel'],['मार्केट','market'],
   ['प्रोजेक्ट','project'],['रिज़ल्ट','result'],['रिजल्ट','result'],['इमेजिन','imagine'],['म्यूजिक','music'],
   ['डॉक्टर','doctor'],['नर्स','nurse'],['सिनेमा','cinema'],['फिल्म','film'],['मूवी','movie'],
   ['गेम','game'],['बैटमिंटन','badminton'],['क्रिकेट','cricket'],['फुटबॉल','football'],['टेनिस','tennis'],
   ['बाइक','bike'],['कार','car'],['पार्क','park'],['प्रिंट','print'],['पेपर','paper'],
   ['बुक','book'],['नोटबुक','notebook'],['पेंसिल','pencil'],['बैग','bag'],['चेयर','chair'],
   ['टेबल','table'],['रूम','room'],['सीट','seat'],['प्लेट','plate'],['ग्लास','glass'],
   ['चाय','chai'],['कॉफी','coffee'],['सैंडविच','sandwich'],['बर्गर','burger'],['पिज़्ज़ा','pizza'],
   ['सॉरी','sorry'],['थैंक','thank'],['प्लीज़','please'],['एक्चुअली','actually'],['सीरियस','serious'],
   ['बेसिकली','basically'],['एक्ज़ाम','exam'],['टेंशन','tension'],['फैमिली','family'],['हॉस्पिटल','hospital']
  ],
  bn:[
   ['হোমওয়ার্ক','homework'],['স্কুল','school'],['কলেজ','college'],['ফোন','phone'],['পুলিশ','police'],
   ['টিভি','TV'],['প্র্যাকটিস','practice'],['চকোলেট','chocolate'],['ট্রেন','train'],['বাস','bus'],
   ['মোবাইল','mobile'],['ইন্টারনেট','internet'],['কম্পিউটার','computer'],['সিস্টেম','system'],
   ['ফ্রেন্ড','friend'],['টিচার','teacher'],['প্রবলেম','problem'],['ক্লাস','class'],['স্টেশন','station'],
   ['পরীক্ষা','exam'],['ক্যানসেল','cancel'],['বার্থডে','birthday'],['কিচেন','kitchen'],['টিকিট','ticket'],
   ['পার্টি','party'],['ব্যাগ','bag'],['ডান্স','dance'],['ক্যামেরা','camera'],['মিটিং','meeting'],
   ['অফিস','office'],['হোটেল','hotel'],['মার্কেট','market'],['রেজাল্ট','result'],['মিউজিক','music']
  ]
};
const LATIN_SCRIPT_LANGS=new Set(['en','es','de','fr','it','pt','nl','da','nb','nn','cs','pl','sv','tr','vi','id','fi','hu','ro','ms']);
const MAX_PLAYLIST=1024*1024,MAX_SEGMENT=7*1024*1024,MAX_AUDIO_INPUT=20*1024*1024,MAX_SEGMENTS=12;
const SAMPLE_RATE=16000,BYTES_PER_SECOND=SAMPLE_RATE*2;
const cache=new Map(), inflight=new Map();

export class AiError extends Error { constructor(status,code) { super(code);this.status=status;this.code=code; } }
function aborted(signal){if(signal?.aborted)throw new AiError(499,'cancelled')}
class Gate {
  constructor(max,maxQueue){this.max=max;this.maxQueue=maxQueue;this.active=0;this.queue=[];}
  acquire(signal){
    aborted(signal);
    if(this.active<this.max){this.active++;return Promise.resolve(()=>this.release());}
    if(this.queue.length>=this.maxQueue)return Promise.reject(new AiError(503,'busy'));
    return new Promise((resolve,reject)=>{
      const entry={resolve,reject,signal};
      const onAbort=()=>{const i=this.queue.indexOf(entry);if(i>=0)this.queue.splice(i,1);reject(new AiError(499,'cancelled'));};
      entry.onAbort=onAbort;signal?.addEventListener('abort',onAbort,{once:true});this.queue.push(entry);
    });
  }
  release(){
    while(this.queue.length){const row=this.queue.shift();row.signal?.removeEventListener('abort',row.onAbort);if(row.signal?.aborted){row.reject(new AiError(499,'cancelled'));continue;}row.resolve(()=>this.release());return;}
    this.active=Math.max(0,this.active-1);
  }
  async run(signal,fn){const release=await this.acquire(signal);try{return await fn();}finally{release();}}
}
const jobs=new Gate(40,80), extraction=new Gate(4,80), models=new Gate(40,120);
function readKey(){
  if(process.env.NVIDIA_API_KEY)return process.env.NVIDIA_API_KEY.trim();
  const file=process.env.NVIDIA_API_KEY_FILE || path.join(os.homedir(),'.config','kozutv','nvidia-nim.key');
  try{return fs.readFileSync(file,'utf8').trim()}catch{return ''}
}
const moduleRoot=path.dirname(fileURLToPath(import.meta.url));
// The Riva ASR client is optional: it needs @grpc/proto-loader plus riva/proto/*.proto
// on disk. Building that package definition here, at module scope, with no guard meant a
// missing .proto - a partial deploy, a copy tool that skipped one folder, an unzip that
// lost it - threw during `import`, before the HTTP listener ever existed. The whole site
// then vanished behind the CDN with a 502 because of a caption feature. Build it on first
// use instead, and if it cannot be built, report the engine as unavailable: every other
// route keeps serving, and the log says why.
let rivaDefinition=null,rivaError=null;
function rivaPackage(){
  if(!rivaDefinition&&!rivaError){
    try{
      rivaDefinition=grpc.loadPackageDefinition(protoLoader.loadSync(path.join(moduleRoot,'riva/proto/riva_asr.proto'),{keepCase:true,includeDirs:[moduleRoot],defaults:true,longs:Number,enums:String}));
    }catch(e){rivaError=e;}
  }
  return rivaDefinition;
}
export function rivaAvailability(){return rivaPackage()?{ok:true}:{ok:false,reason:String((rivaError&&rivaError.message)||'unavailable').split('\n')[0].slice(0,160)};}
let riva;
function client(){
  const pkg=rivaPackage();
  if(!pkg)throw new AiError(503,'ai_engine_unavailable');
  const Riva=pkg.nvidia.riva.asr.RivaSpeechRecognition;
  return riva ||= new Riva('grpc.nvcf.nvidia.com:443',grpc.credentials.createSsl());
}
function metadata(key,id){const m=new grpc.Metadata();m.set('function-id',id);m.set('authorization','Bearer '+key);return m;}
function attrs(raw){const o={};for(const m of raw.matchAll(/(?:^|,)([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/gi))o[m[1].toUpperCase()]=(m[2]??m[3]??'').trim();return o;}
function mediaOnly(value,base){
  if(typeof value!=='string'||value.length>24000||/[\r\n\\]/.test(value))throw new AiError(400,'invalid_source');
  let u;try{u=new URL(value,base);}catch{throw new AiError(400,'invalid_source');}
  if(u.origin!==new URL(base).origin||u.pathname!=='/api/media'||!u.searchParams.has('url')||!/^[a-f0-9]{40}$/.test(u.searchParams.get('sig')||''))throw new AiError(400,'invalid_source');
  return u.href;
}
async function boundedFetch(url,max,signal){
  aborted(signal);const timeout=AbortSignal.timeout(16000),sig=AbortSignal.any([signal,timeout]);
  let r;try{r=await fetch(url,{signal:sig,redirect:'error',headers:{'Accept-Encoding':'identity'}});}catch{throw new AiError(502,'source_fetch_failed');}
  if(!r.ok){r.body?.cancel().catch(()=>{});throw new AiError(502,'source_fetch_failed');}
  const size=Number(r.headers.get('content-length')||0);if(size>max){await r.body?.cancel().catch(()=>{});throw new AiError(422,'source_too_large');}
  let chunks=[],total=0;
  try {for await(const part of r.body||[]){total+=part.length;if(total>max)throw new AiError(422,'source_too_large');chunks.push(Buffer.from(part));}}
  catch(e){r.body?.cancel().catch(()=>{});if(e instanceof AiError)throw e;throw new AiError(502,'source_fetch_failed');}
  return Buffer.concat(chunks,total);
}
function languageBase(code){return String(code||'').toLowerCase().split(/[-_]/)[0];}
function selectMaster(text,url,language,label,multiple,base){
  const lines=text.split(/\r?\n/).map(x=>x.trim()), audio=[];let variants=[];
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(l.startsWith('#EXT-X-MEDIA:')){const a=attrs(l.slice(13));if(a.TYPE?.toUpperCase()==='AUDIO')audio.push(a);}
    if(l.startsWith('#EXT-X-STREAM-INF:')){let a=attrs(l.slice(18));let j=i+1;while(j<lines.length&&(!lines[j]||lines[j].startsWith('#')))j++;if(lines[j])variants.push({a,url:lines[j]});}
  }
  if(!variants.length&&!audio.length)return null;
  if(audio.length){
    const byLabel=String(label||'').trim().toLocaleLowerCase();
    let matched=audio.filter(a=>languageBase(a.LANGUAGE)===language);
    if(byLabel){
      const exact=matched.filter(a=>String(a.NAME||'').trim().toLocaleLowerCase()===byLabel);
      const unnamed=audio.filter(a=>!a.LANGUAGE&&String(a.NAME||'').trim().toLocaleLowerCase()===byLabel);
      if(exact.length)matched=exact;else if(!matched.length&&unnamed.length)matched=unnamed;
    }
    if(!matched.length && audio.length===1 && !audio[0].LANGUAGE && !multiple)matched=audio;
    if(!matched.length)throw new AiError(422,'audio_rendition_not_identified');
    // Multiple different renditions with the same language are not necessarily
    // the same track (e.g. commentary or a different dub). Never guess.
    if(multiple&&new Set(matched.map(a=>`${a.URI||''}|${a.NAME||''}`)).size>1)throw new AiError(422,'audio_rendition_not_identified');
    const selected=matched.find(a=>String(a.DEFAULT).toUpperCase()==='YES')||matched[0];
    if(selected.URI)return {url:mediaOnly(selected.URI,url),externalAudio:true};
    // FFmpeg maps the first embedded audio stream; it cannot prove which one
    // the player selected when multiple tracks are muxed into a variant.
    if(multiple)throw new AiError(422,'audio_rendition_not_identified');
    variants=variants.filter(v=>v.a.AUDIO===selected['GROUP-ID']);
  } else if(multiple)throw new AiError(422,'audio_rendition_not_identified');
  variants.sort((a,b)=>(Number(a.a.BANDWIDTH)||1e15)-(Number(b.a.BANDWIDTH)||1e15));
  if(!variants.length)throw new AiError(422,'unsupported_playlist');
  return {url:mediaOnly(variants[0].url,url),externalAudio:false};
}
export function parseMediaPlaylist(text,url,base='http://127.0.0.1:3000'){
  if(!/^\s*#EXTM3U\b/.test(text)||!/#EXT-X-ENDLIST\b/i.test(text))throw new AiError(422,'unsupported_playlist');
  if(/#EXT-X-BYTERANGE\s*:|#EXT-X-MAP:[^\n]*BYTERANGE=|#EXT-X-PART\s*:/i.test(text))throw new AiError(422,'unsupported_playlist');
  const lines=text.split(/\r?\n/);let duration=0,pending=0,map=null,disc=0,gap=false;const segments=[];
  for(const raw of lines){const l=raw.trim();if(!l)continue;
    if(l.startsWith('#EXT-X-KEY:')||l.startsWith('#EXT-X-SESSION-KEY:')){const a=attrs(l.slice(l.indexOf(':')+1));if((a.METHOD||'').toUpperCase()!=='NONE')throw new AiError(422,'encrypted_playlist');}
    else if(l.startsWith('#EXT-X-MAP:')){const a=attrs(l.slice(11));if(!a.URI||a.BYTERANGE)throw new AiError(422,'unsupported_playlist');map=mediaOnly(a.URI,url);}
    else if(l.startsWith('#EXT-X-DISCONTINUITY'))disc++;
    else if(l.startsWith('#EXT-X-GAP'))gap=true;
    else if(l.startsWith('#EXTINF:')){pending=Number.parseFloat(l.slice(8));if(!(pending>0&&pending<=120))throw new AiError(422,'unsupported_playlist');}
    else if(!l.startsWith('#')&&pending){segments.push({start:duration,end:duration+pending,url:mediaOnly(l,url),map,disc,gap});duration+=pending;pending=0;gap=false;if(segments.length>40000||duration>28800)throw new AiError(422,'unsupported_playlist');}
  }
  if(!segments.length)throw new AiError(422,'unsupported_playlist');
  return {segments,duration};
}
// FFmpeg 7.0.2 static can crash while parsing some optional MPEG-TS SDT
// metadata. PID 0x11 is reserved for that metadata, not A/V payload. Drop it
// only after positively identifying packet-aligned TS; preserve all other data.
function sanitizeTransportStream(buf){
  if(buf.length<564||buf.length%188!==0||buf[0]!==0x47||buf[188]!==0x47||buf[376]!==0x47)return buf;
  let found=false;for(let i=0;i<buf.length;i+=188){if(buf[i]!==0x47)return buf;if((((buf[i+1]&31)<<8)|buf[i+2])===17){found=true;break;}}
  if(!found)return buf;
  const out=Buffer.allocUnsafe(buf.length);let n=0;
  for(let i=0;i<buf.length;i+=188){if(buf[i]!==0x47)return buf;const pid=((buf[i+1]&31)<<8)|buf[i+2];if(pid!==17){buf.copy(out,n,i,i+188);n+=188;}}
  return out.subarray(0,n);
}
async function decodeAudio(input,offset,duration,signal){
  aborted(signal);
  return new Promise((resolve,reject)=>{
    let chunks=[],n=0,done=false;const maxOutput=Math.ceil((duration+0.6)*BYTES_PER_SECOND);
    const p=spawn(ffmpeg,['-hide_banner','-loglevel','error','-protocol_whitelist','pipe','-threads','1','-i','pipe:0','-ss',String(Math.max(0,offset)),'-t',String(duration),'-map','0:a:0','-vn','-ac','1','-ar',String(SAMPLE_RATE),'-f','s16le','pipe:1'],{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'C'}});
    const timer=setTimeout(()=>finish(new AiError(504,'decode_timeout')),10000);
    const onAbort=()=>finish(new AiError(499,'cancelled'));
    function finish(error,pcm){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);if(error){p.kill('SIGKILL');reject(error);}else resolve(pcm);}
    signal?.addEventListener('abort',onAbort,{once:true});p.on('error',()=>finish(new AiError(502,'decode_failed')));
    p.stdout.on('data',b=>{n+=b.length;if(n>maxOutput)finish(new AiError(422,'decode_too_large'));else chunks.push(b);});
    p.stderr.resume();p.stdin.on('error',()=>{});p.stdout.on('error',()=>finish(new AiError(502,'decode_failed')));
    p.on('close',code=>{if(code!==0||!n)finish(new AiError(422,'unsupported_audio'));else finish(null,Buffer.concat(chunks,n));});
    p.stdin.end(input);
  });
}
async function extractWindow(source,language,label,multiple,start,signal,base){
  let url=mediaOnly(source,base),buf=await boundedFetch(url,MAX_PLAYLIST,signal),text=buf.toString('utf8'),identifiedAudio=!multiple;
  if(!/^\s*#EXTM3U\b/.test(text))throw new AiError(422,'unsupported_format');
  for(let depth=0;depth<3;depth++){
    const next=selectMaster(text,url,language,label,multiple&&!identifiedAudio,base);if(!next)break;
    identifiedAudio ||= next.externalAudio;
    url=next.url;buf=await boundedFetch(url,MAX_PLAYLIST,signal);text=buf.toString('utf8');
    if(!/^\s*#EXTM3U\b/.test(text))throw new AiError(422,'unsupported_playlist');
    if(depth===2&&/#EXT-X-STREAM-INF|#EXT-X-MEDIA:.*TYPE=AUDIO/i.test(text))throw new AiError(422,'unsupported_playlist');
  }
  // A bare media playlist can contain several embedded audio tracks. Unless
  // a specific external HLS rendition was selected above, decline rather than
  // transcribing the first track and attributing it to the user's selection.
  if(!identifiedAudio)throw new AiError(422,'audio_rendition_not_identified');
  const list=parseMediaPlaylist(text,url,base),targetEnd=Math.min(start+AI_WINDOW_SECONDS,list.duration);
  if(start>=list.duration||targetEnd-start<0.15)return {pcm:Buffer.alloc(0),start,end:start,targetEnd:list.duration};
  // Context on both sides reduces mid-word cuts at window boundaries. Output is
  // clipped back to the requested window after recognition.
  const clipStart=Math.max(0,start-1.5),clipEnd=Math.min(list.duration,targetEnd+1.5);
  const chosen=list.segments.filter(s=>s.end>clipStart+0.001&&s.start<clipEnd-0.001);
  if(!chosen.length||chosen.length>MAX_SEGMENTS||chosen.some(s=>s.gap||s.disc!==chosen[0].disc||s.map!==chosen[0].map))throw new AiError(422,'unsupported_playlist');
  let chunks=[],total=0;
  for(const uri of [chosen[0].map,...chosen.map(s=>s.url)].filter(Boolean)){
    const b=await boundedFetch(uri,MAX_SEGMENT,signal);total+=b.length;if(total>MAX_AUDIO_INPUT)throw new AiError(422,'source_too_large');chunks.push(sanitizeTransportStream(b));
  }
  const pcm=await decodeAudio(Buffer.concat(chunks),clipStart-chosen[0].start,clipEnd-clipStart,signal);
  return {pcm,start:clipStart,end:Math.min(clipEnd,clipStart+pcm.length/BYTES_PER_SECOND),targetEnd};
}
// --- Hinglish/Banglish romanization -------------------------------------------------
// Indic transliteration is lossless but meaningless for English loanwords:
// प्रैक्टिस becomes "praiktis" and चॉकलेट becomes "cakalet". Words are therefore
// handled one at a time: a curated map first, then a phonetic match against a
// small English lexicon, and only then the usual transliteration.
const ROMAN_WORDS=new Map();       // exact native spelling -> latin
const ROMAN_LOAN_KEYS=new Map();   // phonetic key -> English spelling
(function(){
  for(const lang of Object.keys(ROMAN_LOANS)){
    const map=ROMAN_WORDS.get(lang)||new Map();
    for(const [native,latin] of ROMAN_LOANS[lang])map.set(native.normalize('NFC'),latin);
    ROMAN_WORDS.set(lang,map);
  }
  const ENGLISH='practice practise chocolate school college phone mobile internet computer system friend friends teacher problem class station exam cancel birthday kitchen sweater ticket party bag dance picnic camera battery light meeting office hotel market project result music doctor nurse cinema film movie game cricket football tennis bike car park paper book notebook pencil chair table room seat plate glass coffee sandwich burger pizza sorry please actually basically family hospital tension homework police train bus television video camera charger laptop keyboard monitor email password message number address question answer mother father brother sister happy sorry welcome change chance travel holiday dinner lunch breakfast water bottle pencil exam study teacher student'.split(/\s+/);
  const fold=w=>{
    let x=w.toLowerCase().replace(/ph/g,'f').replace(/ck/g,'k').replace(/qu/g,'kw')
      .replace(/x/g,'ks').replace(/z/g,'j').replace(/v/g,'w')
      .replace(/([kgtdbp])h/g,'$1');       // aspirates collapse
    return x;
  };
  const keyOf=w=>fold(w).replace(/[^a-z]/g,'').replace(/[aeiouy]/g,'').replace(/(.)\1+/g,'$1');
  const keysFor=w=>{
    // "c" is /k/ or /s/ depending on position, so every combination is tried.
    const base=fold(w); const out=new Set();
    const idx=[...base].map((ch,i)=>ch==='c'?i:-1).filter(i=>i>=0).slice(0,4);
    for(let mask=0;mask<(1<<idx.length);mask++){
      const chars=[...base];
      idx.forEach((i,bit)=>{chars[i]=(mask>>bit)&1?'s':'k'});
      out.add(chars.join('').replace(/[^a-z]/g,'').replace(/[aeiouy]/g,'').replace(/(.)\1+/g,'$1'));
    }
    return [...out];
  };
  for(const word of ENGLISH){
    for(const k of keysFor(word))if(k.length>=3&&!ROMAN_LOAN_KEYS.has(k))ROMAN_LOAN_KEYS.set(k,word);
  }
  void keyOf;
})();
function phoneticLoanword(romanWord){
  const k=romanWord.toLowerCase().replace(/[^a-z]/g,'').replace(/^(s|k)([kgtdbp])/, '$2');
  const folded=k.replace(/c/g,'k').replace(/z/g,'j').replace(/v/g,'w').replace(/([kgtdbp])h/g,'$1')
    .replace(/[aeiouy]/g,'').replace(/(.)\1+/g,'$1');
  if(folded.length<4)return '';      // too short to be reliable
  return ROMAN_LOAN_KEYS.get(folded)||'';
}
function romanWord(word,language){
  const exact=ROMAN_WORDS.get(language)?.get(word.normalize('NFC'));
  if(exact)return exact;
  let out;
  try{out=Sanscript.t(word.normalize('NFC'),ROMAN_SCHEMES[language],'iast');}catch{return ''}
  out=out.replace(/ā/g,'aa').replace(/ī/g,'ee').replace(/ū/g,'oo').replace(/ṛ/g,'ri').replace(/ṝ/g,'ree')
   .replace(/[ṃṁṅñ]/g,'n').replace(/~/g,'n').normalize('NFD').replace(/\p{M}/gu,'').normalize('NFC').replace(/a{3,}/g,'aa');
  if(['hi','bn'].includes(language)){
    out=out.replace(/([bcdfghjklmnpqrstvwxyz])a\b/gi,'$1');
    // Bengali's inherent vowel is short: "aamaar"/"graamer" read as "amar"/"gramer".
    if(language==='bn')out=out.replace(/aa/g,'a').replace(/([a-z]+)ee\b/gi,'$1i');
    if(language==='hi')out=out.replace(/([a-z]{2,})aa\b/gi,'$1a').replace(/([a-z]+)ee\b/gi,'$1i').replace(/([a-z]+)oo\b/gi,'$1u');
  }
  const loan=phoneticLoanword(out);
  return loan||out;
}
function roman(text,language){
  if(!ROMAN_SCHEMES[language])return '';
  try{
    // Split into words and separators; only words are transformed, so Latin
    // runs, numbers and punctuation survive untouched (and are never converted
    // twice, which is what corrupted loanwords before).
    return String(text).normalize('NFC').split(/(\s+)/).map(part=>
      /* whitespace */ /^\s*$/.test(part)||!/\p{L}/u.test(part)
        ? part
        : /\p{Script=Latin}/u.test(part)&&!/[\u0900-\u097f\u0980-\u09ff]/u.test(part)
          ? part
          : part.replace(/\p{L}[\p{L}\p{M}]*/gu,w=>romanWord(w,language))
    ).join('');
  }catch{return '';}
}

function speechPresent(pcm){let sum=0,n=0;for(let i=0;i+1<pcm.length;i+=8){const v=pcm.readInt16LE(i)/32768;sum+=v*v;n++;}return n>0&&Math.sqrt(sum/n)>0.001;}
// Hosted multilingual ASR can auto-detect speech despite a requested code;
// upstream metadata can also be wrong. Reject only an obvious conflict: a
// Latin-script language returning at least ten letters entirely in non-Latin
// scripts. This is a warning signal, not reliable language identification.
function assertCompatibleScript(text,language){
  if(!LATIN_SCRIPT_LANGS.has(language))return;
  const letters=[...String(text||'')].filter(ch=>/\p{L}/u.test(ch));
  if(letters.length>=10&&!letters.some(ch=>/\p{Script=Latin}/u.test(ch)))throw new AiError(422,'audio_language_mismatch');
}
function parakeet(pcm,lang,key,signal){
  return models.run(signal,()=>new Promise((resolve,reject)=>{
    let done=false,results=[];const call=client().StreamingRecognize(metadata(key,PARAKEET),{deadline:new Date(Date.now()+24000)});
    const onAbort=()=>{call.cancel();finish(new AiError(499,'cancelled'));};
    function finish(e,v){if(done)return;done=true;signal?.removeEventListener('abort',onAbort);e?reject(e):resolve(v);}
    signal?.addEventListener('abort',onAbort,{once:true});
    call.on('data',d=>{for(const r of d.results||[])if(r.is_final&&r.alternatives?.[0])results.push(r.alternatives[0]);});
    call.on('error',e=>{const failure=new AiError(502,'transcription_failed');failure.grpcCode=e.code;finish(failure);});call.on('end',()=>finish(null,results));
    call.write({streaming_config:{config:{encoding:'LINEAR_PCM',sample_rate_hertz:SAMPLE_RATE,language_code:lang,max_alternatives:1,enable_automatic_punctuation:true,enable_word_time_offsets:true,audio_channel_count:1},interim_results:false}});
    for(let i=0;i<pcm.length;i+=BYTES_PER_SECOND)call.write({audio_content:pcm.subarray(i,i+BYTES_PER_SECOND)});
    call.end();
  }));
}
function whisper(pcm,lang,key,signal){
  return models.run(signal,()=>new Promise((resolve,reject)=>{
    let done=false;const request={config:{encoding:'LINEAR_PCM',sample_rate_hertz:SAMPLE_RATE,language_code:lang,max_alternatives:1,enable_automatic_punctuation:true,audio_channel_count:1},audio:pcm};
    const call=client().Recognize(request,metadata(key,WHISPER),{deadline:new Date(Date.now()+24000)},(e,r)=>finish(e?new AiError(502,'transcription_failed'):null,r));
    const onAbort=()=>{call.cancel();finish(new AiError(499,'cancelled'));};
    function finish(e,v){if(done)return;done=true;signal?.removeEventListener('abort',onAbort);e?reject(e):resolve(v);}
    signal?.addEventListener('abort',onAbort,{once:true});
  }));
}
const CJK_LANGS=new Set(['zh','yue','ja']);
// Split an unpunctuated CJK run at natural boundaries, preferring punctuation,
// then spacing, then a hard character count so no caption runs off the screen.
function splitCjkText(text,limit=16){
  const out=[];let rest=String(text||'').trim();
  while(rest.length>limit){
    const head=rest.slice(0,limit+8);
    // Prefer a real clause break near the target length, then a spoken pause,
    // and only then a hard cut, so a caption never breaks mid-phrase if it can
    // be avoided.
    let cut=-1;
    for(const rx of [/[。！？!?]/, /[，、；：,;:]/, /\s/]){
      let i=-1;
      for(let k=head.length-1;k>=0;k--){if(rx.test(head[k])){i=k;break}}
      if(i>=limit-8){cut=i+1;break}
    }
    if(cut<0)cut=limit;
    const piece=rest.slice(0,cut).trim();
    if(piece)out.push(piece);
    rest=rest.slice(cut).trim();
  }
  if(rest)out.push(rest);
  return out;
}
const SENTENCE_END=/[.!?।॥。？！؟]$/;
const SOFT_END=/[,;:،、—-]$/;
const DROP_CHARS=/[|｜¦]/g;
function cleanCaptionText(text){
  return String(text||'')
    .replace(DROP_CHARS,' ')
    .replace(/[ \t\u00a0]+/g,' ')
    .replace(/\s*([,;:،、.!?।॥。？！؟])\s*(?=[,;:،、.!?।॥。？！؟])/g,'')
    .replace(/\s+([,;:،、.!?।॥。？！؟])/g,'$1')
    .replace(/([,;:،、])\1+/g,'$1')
    .replace(/^[\s,;:،、.!?।॥。？！؟—-]+/,'')
    .replace(/[\s,;:،、—-]+$/,'')
    .trim();
}
// Words arrive from the model with per-word confidences. Very low scores are
// usually clipped syllables or noise; dropping them avoids half-words while
// keeping unsure but complete words.
function usableWords(results,language,end){
  const words=[];
  for(const r of results)for(const w of r.words||[]){
    const text=String(w.word||'').trim();
    let a=Number(w.start_time)/1000,b=Number(w.end_time)/1000;
    const confidence=Number(w.confidence);
    if(!text||!Number.isFinite(a)||!Number.isFinite(b)||b<a||a>end)continue;
    if(Number.isFinite(confidence)&&confidence>0&&confidence<0.28)continue;
    words.push({text,start:Math.max(0,a),end:Math.max(a+0.06,Math.min(b,a+1.6)),confidence:Number.isFinite(confidence)?confidence:1});
  }
  words.sort((x,y)=>x.start-y.start);
  // Merge duplicate or overlapping repeats emitted for the same instant.
  const merged=[];
  for(const w of words){
    const prev=merged.at(-1);
    if(prev&&w.start-prev.start<0.05&&w.text.toLowerCase()===prev.text.toLowerCase())continue;
    merged.push(w);
  }
  return merged;
}
function wordsToCues(results,language,start,end){
  const words=usableWords(results,language,end-start);
  const cjk=['ja','zh','yue'].includes(language);
  const sep=cjk?'':' ';
  const cues=[];let group=[];let previousEnd=-1;
  const limit=cjk?16:24;              // characters per caption before a break is preferred
  const hardWords=cjk?18:11;
  const emit=()=>{
    if(!group.length)return;
    const raw=group.map(x=>x.text).join(sep);
    const text=cleanCaptionText(raw);
    if(text){
      let a=start+group[0].start,b=Math.min(end,start+group.at(-1).end+0.28);
      // Keep a short readable minimum on screen and never overlap the previous cue.
      if(b-a<0.55)b=Math.min(end,a+0.55);
      if(a<previousEnd-0.02)a=previousEnd-0.02;
      if(b>a+0.05){
        cues.push({start:Number(a.toFixed(3)),end:Number(b.toFixed(3)),text,roman:cleanCaptionText(roman(text,language))||''});
        previousEnd=b;
      }
    }
    group=[];
  };
  const lengthOf=()=>group.reduce((n,x)=>n+x.text.length+(cjk?0:1),0);
  for(let i=0;i<words.length;i++){
    const w=words[i];
    // Pure punctuation belongs to the word before it, never on its own line.
    // Its timestamps are often guessed badly, so they must not stretch the cue:
    // a stray "。" reported 30 s away used to run a Chinese line past its window.
    if(/^[\p{P}\p{S}]+$/u.test(w.text)){
      if(group.length&&w.start<=group.at(-1).end+0.75){
        group.at(-1).text+=w.text;
        group.at(-1).end=Math.max(group.at(-1).end,Math.min(w.end,group.at(-1).end+0.3));
      }
      continue;
    }
    if(group.length){
      const gap=w.start-group.at(-1).end,span=w.end-group[0].start;
      const last=group.at(-1).text;
      const sentenceEnded=SENTENCE_END.test(last);
      const promised=SOFT_END.test(last);
      const wouldOverflow=lengthOf()+w.text.length+(cjk?0:1)>limit;
      if(sentenceEnded||gap>0.9||span>(cjk?4.6:5.2)||wouldOverflow&&(promised||gap>0.22)||group.length>=hardWords)emit();
      else if(wouldOverflow&&gap>0.12)emit();
    }
    group.push({...w});
  }
  emit();
  return cues;
}
// Merge cues that follow each other within a fraction of a second so text does
// not flicker off and on between windows or sentences.
function smoothCues(cues){
  const out=[];
  for(const cue of cues){
    const prev=out.at(-1);
    if(prev&&cue.start-prev.end<0.14&&cue.end-cue.start<6&&prev.text.length+cue.text.length<58&&!SENTENCE_END.test(cue.text)){
      prev.end=Math.max(prev.end,cue.end);
      prev.text=cleanCaptionText(`${prev.text} ${cue.text}`);
      prev.roman=cleanCaptionText(`${prev.roman||''} ${cue.roman||''}`);
      continue;
    }
    out.push({...cue});
  }
  return out;
}
async function transcribe(pcm,language,start,end,key,signal){
  if(!pcm.length||!speechPresent(pcm))return [];
  if(LANGS[language]!=='whisper'){
    let result;try{result=await parakeet(pcm,LANGS[language],key,signal);}catch(e){if(![4,8,14].includes(e.grpcCode))throw e;await new Promise(r=>setTimeout(r,250));aborted(signal);result=await parakeet(pcm,LANGS[language],key,signal);}
    assertCompatibleScript(result.map(r=>r.transcript||'').join(' '),language);
    return smoothCues(wordsToCues(result,language,start,end));
  }
  // Whisper's hosted unary model has no word offsets, so the text of each slice
  // is split into sentence-sized cues and placed proportionally inside that
  // slice. Slices overlap by 0.6 s so a word at a boundary is not cut in half.
  const sliceSec=6,overlap=0.6,pieces=[];
  for(let i=0;i<pcm.length;i+=sliceSec*BYTES_PER_SECOND){
    const clip=pcm.subarray(i,Math.min(pcm.length,i+(sliceSec+overlap)*BYTES_PER_SECOND));
    if(clip.length>=BYTES_PER_SECOND/2&&speechPresent(clip))pieces.push({clip,offset:i/BYTES_PER_SECOND});
  }
  const all=await Promise.all(pieces.map(async p=>{
    const r=await whisper(p.clip,WHISPER_CODE[language]||language,key,signal);
    const text=cleanCaptionText((r.results||[]).map(x=>x.alternatives?.[0]?.transcript||'').join(' '));
    return {p,text};
  }));
  assertCompatibleScript(all.map(x=>x.text).join(' '),language);
  const cues=[];
  for(const {p,text} of all){
    if(!text)continue;
    // Chinese, Cantonese and Japanese write without spaces, so a slice that the
    // model returns without punctuation would otherwise become one huge block.
    // Break CJK runs into caption-sized pieces before laying them out.
    const rawSentences=text.split(/(?<=[.!?।॥。？！؟])\s*/).map(x=>x.trim()).filter(Boolean);
    const sentences=CJK_LANGS.has(language)
      ? rawSentences.flatMap(x=>splitCjkText(x,16))
      : rawSentences;
    const totalChars=sentences.reduce((n,x)=>n+x.length,0)||1;
    const span=Math.min(end-start-p.offset,p.clip.length/BYTES_PER_SECOND);
    let cursor=p.offset;
    for(const sentence of sentences){
      const share=Math.max(0.8,span*sentence.length/totalChars);
      const a=Math.min(end,start+cursor),b=Math.min(end,a+share);
      if(b>a+0.1)cues.push({start:Number(a.toFixed(3)),end:Number(b.toFixed(3)),text:sentence,roman:cleanCaptionText(roman(sentence,language))||''});
      cursor+=share;
    }
  }
  // Overlapping slices can repeat a sentence; keep the first, drop close repeats.
  return cues.filter((c,i)=>!cues.slice(Math.max(0,i-2),i).some(p=>p.text===c.text&&Math.abs(p.start-c.start)<2.2));
}
function cacheGet(key){const x=cache.get(key);if(!x)return null;if(Date.now()-x.time>5*60_000){cache.delete(key);return null;}cache.delete(key);cache.set(key,x);return x.data;}
function waitShared(row,signal){
  aborted(signal);row.waiters++;
  return new Promise((resolve,reject)=>{
    let finished=false;const end=()=>{if(finished)return false;finished=true;signal?.removeEventListener('abort',onAbort);row.waiters--;if(!row.waiters&&!row.done)row.ctrl.abort();return true;};
    const onAbort=()=>{if(end())reject(new AiError(499,'cancelled'));};signal?.addEventListener('abort',onAbort,{once:true});
    row.promise.then(x=>{if(end())resolve(x);},e=>{if(end())reject(e);});
  });
}
export async function requestTranscription(input,signal,port=process.env.PORT||3000){
  const language=languageBase(input.language),time=Number(input.time),src=String(input.src||''),label=String(input.audioLabel||'').slice(0,128),multiple=input.multipleAudio===true;
  if(!LANGS[language]||!Number.isFinite(time)||time<0||time>28799)throw new AiError(400,'invalid_request');
  const base=`http://127.0.0.1:${Number(port)||3000}`,source=mediaOnly(src,base),start=Math.floor(time/AI_WINDOW_SECONDS)*AI_WINDOW_SECONDS,key=readKey();
  if(!key)throw new AiError(503,'transcription_unconfigured');
  const cacheKey=crypto.createHash('sha256').update(JSON.stringify([source,language,label,multiple,start])).digest('hex'),hit=cacheGet(cacheKey);if(hit)return hit;
  let row=inflight.get(cacheKey);
  if(!row){
    const ctrl=new AbortController();row={ctrl,waiters:0,done:false,promise:null};
    row.promise=jobs.run(ctrl.signal,async()=>{
      const window=await extraction.run(ctrl.signal,()=>extractWindow(source,language,label,multiple,start,ctrl.signal,base));
      const all=await transcribe(window.pcm,language,window.start,window.end,key,ctrl.signal);
      const cues=all.filter(c=>c.end>start&&c.start<window.targetEnd).map(c=>({...c,start:Math.max(start,c.start),end:Math.min(window.targetEnd,c.end)}));
      const data={start,end:window.targetEnd,cues,approximate:LANGS[language]==='whisper'};
      cache.set(cacheKey,{time:Date.now(),data});while(cache.size>250)cache.delete(cache.keys().next().value);return data;
    }).finally(()=>{row.done=true;inflight.delete(cacheKey);});
    inflight.set(cacheKey,row);
  }
  return waitShared(row,signal);
}
export const _test={attrs,mediaOnly,selectMaster,roman,wordsToCues,smoothCues,cleanCaptionText,speechPresent,splitCjkText,assertCompatibleScript,extractWindow,sanitizeTransportStream,LANG_CODES:Object.keys(LANGS)};
