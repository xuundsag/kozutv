// Cache the essential shell and bounded public images; account APIs stay live.
(function(){
 if(!('serviceWorker' in navigator))return;
 function register(){navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});}
 if(document.readyState==='complete')requestAnimationFrame(register);
 else window.addEventListener('load',()=>requestAnimationFrame(register),{once:true});
 window.kozutvOfflineState=()=>({supported:true,controlled:Boolean(navigator.serviceWorker.controller)});
})();
