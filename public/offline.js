// Register the small essential shell cache. Catalogue and images need internet.
(function(){
 if(!('serviceWorker' in navigator))return;
 function register(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{});}
 if(document.readyState==='complete')requestAnimationFrame(register);
 else window.addEventListener('load',()=>requestAnimationFrame(register),{once:true});
 window.kozutvOfflineState=()=>({supported:true,controlled:Boolean(navigator.serviceWorker.controller)});
})();
