(() => {
const icons = {
 play:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-play" viewBox="0 0 240 240" focusable="false"><path d="M62.8,199.5c-1,0.8-2.4,0.6-3.3-0.4c-0.4-0.5-0.6-1.1-0.5-1.8V42.6c-0.2-1.3,0.7-2.4,1.9-2.6c0.7-0.1,1.3,0.1,1.9,0.4l154.7,77.7c2.1,1.1,2.1,2.8,0,3.8L62.8,199.5z"/></svg>',
 pause:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-pause" viewBox="0 0 240 240" focusable="false"><path d="M100,194.9c0.2,2.6-1.8,4.8-4.4,5c-0.2,0-0.4,0-0.6,0H65c-2.6,0.2-4.8-1.8-5-4.4c0-0.2,0-0.4,0-0.6V45c-0.2-2.6,1.8-4.8,4.4-5c0.2,0,0.4,0,0.6,0h30c2.6-0.2,4.8,1.8,5,4.4c0,0.2,0,0.4,0,0.6V194.9z M180,45.1c0.2-2.6-1.8-4.8-4.4-5c-0.2,0-0.4,0-0.6,0h-30c-2.6-0.2-4.8,1.8-5,4.4c0,0.2,0,0.4,0,0.6V195c-0.2,2.6,1.8,4.8,4.4,5c0.2,0,0.4,0,0.6,0h30c2.6,0.2,4.8-1.8,5-4.4c0-0.2,0-0.4,0-0.6V45.1z"/></svg>',
 volume:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-volume-100" viewBox="0 0 240 240" focusable="false"><path d="M116.4,42.8v154.5c0,2.8-1.7,3.6-3.8,1.7l-54.1-48.1H29c-2.8,0-5.2-2.3-5.2-5.2V94.2c0-2.8,2.3-5.2,5.2-5.2h29.5l54.1-48.1C114.6,39.1,116.4,39.9,116.4,42.8z M192.3,120c0-31.3-18.6-59.6-47.5-71.8l-7.6,19.2c20.9,9.1,34.4,29.8,34.4,52.6s-13.5,43.5-34.4,52.6l7.6,19.2C173.7,179.6,192.3,151.3,192.3,120z M161.4,120c0-18.8-11.7-35.6-29.3-42.2l-7.6,19.3c13,5.9,18.7,21.2,12.8,34.2c-2.6,5.7-7.1,10.2-12.8,12.8l7.6,19.3C149.7,155.8,161.4,138.9,161.4,120z M144.8,27.2l-7.6,19.3c39.6,14.8,59.7,59,44.9,98.6c-7.8,20.9-24.2,37.4-45.2,45.2l7.6,19.3c50.2-17.5,76.7-72.4,59.2-122.6C194.2,59.4,172.5,37.6,144.8,27.2z"/></svg>',
 mute:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-volume-0" viewBox="0 0 240 240" focusable="false"><path d="M116.6,42.9v154.6c0,2.8-1.7,3.6-3.8,1.7l-54.1-48H29c-2.8,0-5.2-2.3-5.2-5.2V94.4c0-2.8,2.3-5.2,5.2-5.2h29.6l54.1-48C114.8,39.2,116.6,40,116.6,42.9z M198.2,120.1l26-26l-14.6-14.6l-26,26l-26-26L143,94.1l26,26l-26,26l14.6,14.6l26-26l26,26l14.6-14.6L198.2,120.1z"/></svg>',
 ccOff:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-cc-off" viewBox="0 0 240 240" focusable="false"><path d="M215,40H25c-2.7,0-5,2.2-5,5v150c0,2.7,2.2,5,5,5h190c2.7,0,5-2.2,5-5V45C220,42.2,217.8,40,215,40z M208.1,188.1H31.9V51.9h176.2V188.1z M77.7,108.9h-1.1c-0.1,1.6-0.2,3.4-0.2,5.4v11.6c0,2,0,3.8,0.1,5.4h1.1c0.3,4.2,3,6.5,8,6.7c3.6,0,6.6-1.9,7.6-5.4c0.2-0.7,0.9-1,1.6-0.8c0,0,0,0,0,0l9.8,2.9c0.6,0.2,1,0.8,0.8,1.5c0,0,0,0.1,0,0.1c-2.2,8.4-9,13.1-19.8,13.1c-14.2-0.2-21.5-8.4-21.8-24.6v-9.6c0.3-16.2,7.5-24.4,21.8-24.6c10.9,0,17.7,4.9,19.8,13.2c0.2,0.7-0.1,1.4-0.8,1.6l-9.9,2.8c-0.6,0.2-1.3-0.2-1.5-0.8c0,0,0,0,0-0.1c-1-3.5-4.1-5.4-7.6-5.4C80.7,102.4,78.1,104.6,77.7,108.9L77.7,108.9z M147.8,108.9h-1.1c-0.1,1.6-0.2,3.4-0.2,5.4v11.6c0,2,0,3.8,0.1,5.4h1.1c0.3,4.2,3,6.5,8,6.7c3.6,0,6.6-1.9,7.6-5.4c0.2-0.7,0.9-1,1.6-0.8c0,0,0,0,0,0l9.8,2.9c0.6,0.2,1,0.8,0.8,1.5c0,0,0,0.1,0,0.1c-2.2,8.4-9,13.1-19.8,13.1c-14.2-0.2-21.5-8.4-21.8-24.6v-9.6c0.3-16.2,7.5-24.4,21.8-24.6c10.9,0,17.7,4.9,19.8,13.2c0.2,0.7-0.1,1.4-0.8,1.6l-9.8,2.9c-0.6,0.2-1.3-0.2-1.5-0.8c0,0,0,0,0-0.1c-1-3.5-4.1-5.4-7.6-5.4C150.8,102.4,148.2,104.6,147.8,108.9L147.8,108.9z"/></svg>',
 ccOn:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-cc-on" viewBox="0 0 240 240" focusable="false"><path d="M215,40H25c-2.7,0-5,2.2-5,5v150c0,2.7,2.2,5,5,5h190c2.7,0,5-2.2,5-5V45C220,42.2,217.8,40,215,40z M108.1,137.7c0.7-0.7,1.5-1.5,2.4-2.3c-2.4,8.9-9.4,14-20.6,14c-14.2-0.2-21.5-8.4-21.8-24.6v-9.6c0.3-16.2,7.5-24.4,21.8-24.6c10.9,0,17.7,4.9,19.8,13.2c0.2,0.7-0.1,1.4-0.8,1.6l-9.9,2.8c-0.6,0.2-1.3-0.2-1.5-0.8c0,0,0,0,0-0.1c-1-3.5-4.1-5.4-7.6-5.4c-5,0.2-7.7,2.4-8,6.7h-1.1c-0.1,1.6-0.2,3.4-0.2,5.4v11.6c0,2,0,3.8,0.1,5.4h1.1c0.3,4.2,3,6.5,8,6.7c3.6,0,6.6-1.9,7.6-5.4c0.2-0.7,0.9-1,1.6-0.8c0,0,0,0,0,0l9.8,2.9c0.6,0.2,1,0.8,0.8,1.5c0,0,0,0.1,0,0.1C109.2,136.7,108.7,137.2,108.1,137.7z M178.2,137.7c0.7-0.7,1.5-1.5,2.4-2.3c-2.4,8.9-9.4,14-20.6,14c-14.2-0.2-21.5-8.4-21.8-24.6v-9.6c0.3-16.2,7.5-24.4,21.8-24.6c10.9,0,17.7,4.9,19.8,13.2c0.2,0.7-0.1,1.4-0.8,1.6l-9.8,2.9c-0.6,0.2-1.3-0.2-1.5-0.8c0,0,0,0,0-0.1c-1-3.5-4.1-5.4-7.6-5.4c-5,0.2-7.7,2.4-8,6.7h-1.1c-0.1,1.6-0.2,3.4-0.2,5.4v11.6c0,2,0,3.8,0.1,5.4h1.1c0.3,4.2,3,6.5,8,6.7c3.6,0,6.6-1.9,7.6-5.4c0.2-0.7,0.9-1,1.6-0.8c0,0,0,0,0,0l9.8,2.9c0.6,0.2,1,0.8,0.8,1.5c0,0,0,0.1,0,0.1C179.3,136.7,178.8,137.2,178.2,137.7z"/></svg>',
 settings:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-settings" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
 pip:'<svg class="jw-svg-icon jw-svg-icon-pip-off" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M21 3C22.1 3 23 3.9 23 5V12H21V5H3V19H12V21H3C1.9 21 1 20.1 1 19V5C1 3.9 1.9 3 3 3H21ZM22 14C22.55 14 23 14.45 23 15V20C23 20.55 22.55 21 22 21H15C14.45 21 14 20.55 14 20V15C14 14.45 14.45 14 15 14H22Z"/><path d="M5.79289 7.20711C5.40237 6.81658 5.40237 6.18342 5.79289 5.79289C6.18342 5.40237 6.81658 5.40237 7.20711 5.79289L10 8.58579V7C10 6.44772 10.4477 6 11 6C11.5523 6 12 6.44772 12 7V11C12 11.5523 11.5523 12 11 12H7C6.44772 12 6 11.5523 6 11C6 10.4477 6.44772 10 7 10H8.58579L5.79289 7.20711Z"/></svg>',
 fullscreen:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-fullscreen-on" viewBox="0 0 240 240" focusable="false"><path d="M96.3,186.1c1.9,1.9,1.3,4-1.4,4.4l-50.6,8.4c-1.8,0.5-3.7-0.6-4.2-2.4c-0.2-0.6-0.2-1.2,0-1.7l8.4-50.6c0.4-2.7,2.4-3.4,4.4-1.4l14.5,14.5l28.2-28.2l14.3,14.3l-28.2,28.2L96.3,186.1z M195.8,39.1l-50.6,8.4c-2.7,0.4-3.4,2.4-1.4,4.4l14.5,14.5l-28.2,28.2l14.3,14.3l28.2-28.2l14.5,14.5c1.9,1.9,4,1.3,4.4-1.4l8.4-50.6c0.5-1.8-0.6-3.6-2.4-4.2C197,39,196.4,39,195.8,39.1L195.8,39.1z"/></svg>',
 exitFullscreen:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-fullscreen-off" viewBox="0 0 240 240" focusable="false"><path d="M109.2,134.9l-8.4,50.1c-0.4,2.7-2.4,3.3-4.4,1.4L82,172l-27.9,27.9l-14.2-14.2l27.9-27.9l-14.4-14.4c-1.9-1.9-1.3-3.9,1.4-4.4l50.1-8.4c1.8-0.5,3.6,0.6,4.1,2.4C109.4,133.7,109.4,134.3,109.2,134.9L109.2,134.9z M172.1,82.1L200,54.2L185.8,40l-27.9,27.9l-14.4-14.4c-1.9-1.9-3.9-1.3-4.4,1.4l-8.4,50.1c-0.5,1.8,0.6,3.6,2.4,4.1c0.5,0.2,1.2,0.2,1.7,0l50.1-8.4c2.7-0.4,3.3-2.4,1.4-4.4L172.1,82.1z"/></svg>',
 download:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11 3h2a1 1 0 0 1 1 1v9.6l3.3-3.3a1 1 0 0 1 1.4 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.4L11 13.6V4a1 1 0 0 1 1-1Z"/><path d="M4 16.5a1 1 0 0 1 2 0V18h12v-1.5a1 1 0 1 1 2 0V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5Z"/></svg>',
 audioTracks:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-audiotracks" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a9 9 0 0 0-9 9v7a3 3 0 0 0 3 3h2v-8H5v-2a7 7 0 0 1 14 0v2h-3v8h2a3 3 0 0 0 3-3v-7a9 9 0 0 0-9-9Z"/><path d="M10 15h4v2h-4v-2Zm0-4h6v2h-6v-2Zm0 8h3v2h-3v-2Z"/></svg>',
 quality:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-quality-100" viewBox="0 0 240 240" focusable="false"><path d="M55,200H35c-3,0-5-2-5-4V175c0-3,2-5,4-5h21c3,0,5,2,5,4v21C60,198,58,200,55,200z M110,144c0-2-2-4-4-4H85c-3,0-5,2-5,5v50c0,3,2,5,4,5h21c3,0,5-2,5-4V144z M160,94c0-2-2-4-4-4h-21c-3,0-5,2-5,5v100c0,3,2,5,4,5h21c3,0,5-2,5-4V94z M210,44c0-2-2-4-4-4h-21c-3,0-5,2-5,5v150c0,3,2,5,4,5h21c3,0,5-2,5-4V44z"/></svg>',
 speed:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-playback-rates" viewBox="0 0 24 24" fill="currentColor"><path d="M2 8.25a.9.9 0 0 1 .9-.9h2.7a.9.9 0 1 1 0 1.8H2.9a.9.9 0 0 1-.9-.9Zm-1 3.75a.9.9 0 0 1 .9-.9h3.7a.9.9 0 1 1 0 1.8H1.9a.9.9 0 0 1-.9-.9Zm1 3.75a.9.9 0 0 1 .9-.9h2.7a.9.9 0 1 1 0 1.8H2.9a.9.9 0 0 1-.9-.9Z"/><path fill-rule="evenodd" clip-rule="evenodd" d="M15 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm-.9 3.75a.9.9 0 0 1 1.8 0v3.35h2.6a.9.9 0 1 1 0 1.8H15a.9.9 0 0 1-.9-.9V8.25Z"/></svg>',
 close:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-close" viewBox="0 0 240 240" focusable="false"><path d="M134.8,120l48.6-48.6c2-1.9,2.1-5.1,0.2-7.1l-7.7-7.7c-1.9-2-5.1-2.1-7.1-0.2L120,105.2L71.4,56.6c-1.9-2-5.1-2.1-7.1-0.2l-7.9,7.8c-2,1.9-2.1,5.1-0.2,7.1L105.2,120l-48.6,48.6c-2,1.9-2.1,5.1-0.2,7.1l7.7,7.7c1.9,2,5.1,2.1,7.1,0.2l48.6-48.6l48.6,48.6c1.9,2,5.1,2.1,7.1,0.2l7.7-7.7c2-1.9,2.1-5.1,0.2-7.1L134.8,120z"/></svg>',
 back:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
 prevEpisode:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-prev" viewBox="0 0 240 240" focusable="false"><g transform="translate(240,0) scale(-1,1)"><path d="M48.5,197.5c-1.8,1.1-4.1,0.5-5.2-1.3c-0.4-0.6-0.6-1.3-0.5-2V45.8c0-2.1,1.7-3.8,3.8-3.8c0.7,0,1.4,0.2,2,0.6l113.4,74.2c1.8,1.1,2.3,3.5,1.1,5.2c-0.3,0.5-0.7,0.8-1.1,1.1L48.5,197.5z M195,195c0,2.8-2.2,5-5,5h-20c-2.8,0-5-2.2-5-5V45c0-2.8,2.2-5,5-5h20c2.8,0,5,2.2,5,5V195z"/></g></svg>',
 nextEpisode:'<svg xmlns="http://www.w3.org/2000/svg" class="jw-svg-icon jw-svg-icon-next" viewBox="0 0 240 240" focusable="false"><path d="M48.5,197.5c-1.8,1.1-4.1,0.5-5.2-1.3c-0.4-0.6-0.6-1.3-0.5-2V45.8c0-2.1,1.7-3.8,3.8-3.8c0.7,0,1.4,0.2,2,0.6l113.4,74.2c1.8,1.1,2.3,3.5,1.1,5.2c-0.3,0.5-0.7,0.8-1.1,1.1L48.5,197.5z M195,195c0,2.8-2.2,5-5,5h-20c-2.8,0-5-2.2-5-5V45c0-2.8,2.2-5,5-5h20c2.8,0,5,2.2,5,5V195z"/></svg>',
 sun:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" focusable="false"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.2v2.3M12 19.5v2.3M4.9 4.9l1.65 1.65M17.45 17.45l1.65 1.65M2.2 12h2.3M19.5 12h2.3M4.9 19.1l1.65-1.65M17.45 6.55l1.65-1.65"/></svg>'
};

const captionPresets={
 'anime-sub':{size:'100',color:'white',background:'black',backgroundOpacity:'0',textOpacity:'100',font:'subSans',weight:'700',edge:'animeOutline',position:'bottom'},
 'anime-dub':{size:'100',color:'white',background:'black',backgroundOpacity:'0',textOpacity:'100',font:'system',weight:'600',edge:'outline',position:'bottom'},
 'ott':{size:'100',color:'white',background:'black',backgroundOpacity:'0',textOpacity:'100',font:'system',weight:'600',edge:'outline',position:'bottom'}
};
const captionColors={white:[255,255,255],yellow:[255,235,59],cyan:[77,238,234],green:[129,255,138],magenta:[255,121,214],orange:[255,154,85],black:[0,0,0],navy:[14,24,44]};
const captionFonts={
 subSans:'"Trebuchet MS", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
 system:'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
 sans:'Arial, Helvetica, sans-serif',
 serif:'Georgia, "Times New Roman", serif',
 mono:'"Courier New", monospace'
};
const captionEdges={
 none:{stroke:'0px transparent',shadow:'none'},
 animeOutline:{stroke:'0.17em #000000',shadow:'0 2px 5px rgba(0,0,0,.82)'},
 outline:{stroke:'0.13em #000000',shadow:'0 2px 4px rgba(0,0,0,.85)'},
 shadow:{stroke:'0px transparent',shadow:'0 2px 4px rgba(0,0,0,.95), 0 0 2px rgba(0,0,0,.9)'},
 raised:{stroke:'0px transparent',shadow:'0 1px 0 #222, 0 2px 0 #111, 0 3px 5px rgba(0,0,0,.9)'},
 depressed:{stroke:'0px transparent',shadow:'0 -1px 0 #000, 0 1px 1px rgba(255,255,255,.35)'}
};
const captionOptions=[
 ['color','Font Color',[['white','White'],['yellow','Yellow'],['cyan','Cyan'],['green','Green'],['orange','Orange'],['magenta','Magenta']]],
 ['textOpacity','Font Opacity',[['100','100%'],['85','85%'],['75','75%'],['50','50%']]],
 ['size','Font Size',[['75','Small'],['90','Medium'],['100','Default'],['125','125%'],['150','150%'],['175','175%'],['200','200%']]],
 ['font','Font Family',[['system','Default'],['subSans','Rounded Sans'],['sans','Sans-serif'],['serif','Serif'],['mono','Monospace']]],
 ['edge','Character Edge',[['animeOutline','Crisp outline'],['outline','Uniform outline'],['shadow','Drop shadow'],['raised','Raised'],['depressed','Depressed'],['none','None']]],
 ['background','Background Color',[['black','Black'],['navy','Dark blue'],['white','White']]],
 ['backgroundOpacity','Background Opacity',[['0','0%'],['25','25%'],['50','50%'],['65','65%'],['75','75%'],['100','100%']]],
 ['position','Window Position',[['bottom','Bottom'],['middle','Middle'],['top','Top']]]
];
const servers=[
 ['vidcore','VidCore'],
 ['embedwave','EmbedWave'],
 ['cinesrc','CineSrc'],
 ['vidlink','VidLink'],
 ['vidsrc','VidSrc']
];
const syncOffsetChoices=[
 ['-10','-10.0s (Earlier)'],['-7.5','-7.5s'],['-5','-5.0s'],['-4','-4.0s'],['-3','-3.0s'],['-2','-2.0s'],['-1.5','-1.5s'],['-1','-1.0s'],['-0.5','-0.5s'],['-0.25','-0.25s'],
 ['0','0.0s (Synced)'],
 ['0.25','+0.25s'],['0.5','+0.5s'],['1','+1.0s'],['1.5','+1.5s'],['2','+2.0s'],['3','+3.0s'],['4','+4.0s'],['5','+5.0s'],['7.5','+7.5s'],['10','+10.0s (Later)']
];
const QUALITY_META={
 2160:{name:'4K',tag:'2160p'},
 1440:{name:'2K',tag:'1440p'},
 1080:{name:'Full HD',tag:'1080p'},
 720:{name:'HD',tag:'720p'},
 576:{name:'SD',tag:'576p'},
 480:{name:'SD',tag:'480p'},
 360:{name:'SD',tag:'360p'},
 240:{name:'Low',tag:'240p'}
};
function classifyQualityTier(width,height){
 const w=Number(width)||0,h=Number(height)||0;
 if(h===2160||w>=3200||h>=1900)return 2160;
 if(h===1440||(w===2560&&h>1080)||(h>=1250&&h<1900))return 1440;
 if(h===1080||(w>=1800&&w<=2650&&h>=720&&h<=1140)||(h>=960&&h<1250))return 1080;
 if(h===720||(w>=1200&&w<1800&&h>=480&&h<=800)||(h>=660&&h<960))return 720;
 if(h===576||h===540||(w>=960&&w<1200&&h>=400))return 576;
 if(h===480||(w>=700&&w<=1120&&h>=300&&h<=530))return 480;
 if(h===360||(w>=480&&h>=220))return 360;
 if(w>0||h>0)return 240;
 return 0;
}
function formatQualityOption(tier){
 const meta=QUALITY_META[tier];
 return meta||{name:`${tier}p`,tag:`${tier}p`};
}
function canPlayHevcCodec(){
 try{
  const v=document.createElement('video');
  const t1=v.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"');
  const t2=v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
  const ms=window.MediaSource?.isTypeSupported?.('video/mp4; codecs="hev1.1.6.L93.B0"')||window.MediaSource?.isTypeSupported?.('video/mp4; codecs="hvc1.1.6.L93.B0"');
  return Boolean((t1&&t1!=='')||(t2&&t2!=='')||ms);
 }catch{return false}
}
const CHINESE_AUDIO_LABELS=['Chinese (Mandarin)','Chinese (Cantonese)'];
const CHINESE_LABEL_RX=/chinese|mandarin|cantonese|中文|普通话|國語|粤语|粵語/i;
const isoAudioNames={
 eng:'English',en:'English',kor:'Korean',ko:'Korean',jpn:'Japanese',ja:'Japanese',
 hin:'Hindi',hi:'Hindi',tam:'Tamil',ta:'Tamil',tel:'Telugu',te:'Telugu',
 mal:'Malayalam',ml:'Malayalam',kan:'Kannada',kn:'Kannada',ben:'Bengali',bn:'Bengali',
 mar:'Marathi',mr:'Marathi',pan:'Punjabi',pa:'Punjabi',guj:'Gujarati',gu:'Gujarati',urd:'Urdu',ur:'Urdu',
 spa:'Spanish',es:'Spanish',fra:'French',fre:'French',fr:'French',
 deu:'German',ger:'German',de:'German',ita:'Italian',it:'Italian',por:'Portuguese',pt:'Portuguese',
 rus:'Russian',ru:'Russian',zho:CHINESE_AUDIO_LABELS[0],chi:CHINESE_AUDIO_LABELS[0],zh:CHINESE_AUDIO_LABELS[0],
 yue:CHINESE_AUDIO_LABELS[1],cmn:CHINESE_AUDIO_LABELS[0],cn:CHINESE_AUDIO_LABELS[0],ara:'Arabic',ar:'Arabic',
 tur:'Turkish',tr:'Turkish',tha:'Thai',th:'Thai',vie:'Vietnamese',vi:'Vietnamese',ind:'Indonesian',id:'Indonesian'
};
const cleanAudioLangPatterns=[
 [/\b(?:vid)?hindi\b|\bhin\b/i,'Hindi'],
 [/\b(?:vid)?tamil\b|\btam\b/i,'Tamil'],
 [/\b(?:vid)?telugu\b|\btel\b/i,'Telugu'],
 [/\b(?:vid)?malayalam\b|\bmal\b/i,'Malayalam'],
 [/\b(?:vid)?kannada\b|\bkan\b/i,'Kannada'],
 [/\b(?:vid)?bengali\b|\bbangla\b|\bben\b/i,'Bengali'],
 [/\b(?:vid)?marathi\b|\bmar\b/i,'Marathi'],
 [/\b(?:vid)?punjabi\b|\bpan\b/i,'Punjabi'],
 [/\b(?:vid)?urdu\b|\burd\b/i,'Urdu'],
 [/\b(?:vid)?english\b|\beng\b/i,'English'],
 [/\b(?:vid)?spanish\b|\blatino\b|\bcastellano\b|\bespa[nñ]ol\b/i,'Spanish'],
 [/\b(?:vid)?french\b|\bfran[cç]ais\b/i,'French'],
 [/\b(?:vid)?german\b|\bdeutsch\b/i,'German'],
 [/\b(?:vid)?portuguese\b|\bdublado\b|\bportugu[eê]s\b/i,'Portuguese'],
 [/\b(?:vid)?italian\b|\bitaliano\b/i,'Italian'],
 [/\b(?:vid)?russian\b/i,'Russian'],
 [/\b(?:vid)?arabic\b/i,'Arabic'],
 [/\b(?:vid)?japanese\b|\bjpn\b/i,'Japanese'],
 [/\b(?:vid)?korean\b|\bkor\b/i,'Korean']
];
const AUDIO_SETTING_CODES=new Set(['en','ja','hi','ta','te','ml','kn','bn','mr','pa','gu','ur','ko','es','fr','de','it','pt','ru','zh','ar','tr','th','vi','id','nl','pl','sv','da','fi','cs','el','hu','ro','uk','he','fa','ms']);
// Languages the hosted models accept (Parakeet profiles plus Whisper's list).
const AI_TRACK_LANGS=new Set(['en','es','de','fr','it','ar','ja','ko','pt','ru','hi','nl','da','nb','nn','cs','pl','sv','th','tr','he','bn','ta','te','ml','kn','mr','pa','gu','ur','zh','vi','id','fi','el','hu','ro','uk','fa','ms','bs','sr','hr','sk','bg','lt','lv','et','is','mk','sq','hy','ka','az','kk','uz','sw','af','si','km','ne','be','tg','sd','am','my','bo','tl','mg','as','jw','su','yue','ca','eu','gl','cy','mi','la','br','oc','fo','mt','sa','haw','ht','ps','tk','sn','so','yo','ln','ha','ba','tt','lb']);
const ROMAN_CAPTION_NAMES={hi:'Hinglish',bn:'Benglish'};
// A Chinese dub may arrive as Chinese/Mandarin/Cantonese/text; keep one friendly,
// stable label per code instead of echoing the raw provider string.
function formatChineseLabel(name,code){
 const base=String(code||'').toLowerCase().split(/[-_]/)[0];
 if(base==='yue'||/cantonese|粤语|粵語/i.test(String(name||'')))return CHINESE_AUDIO_LABELS[1];
 if(base==='zh'||base==='cmn'||base==='cn'||base==='chi'||base==='zho'||CHINESE_LABEL_RX.test(String(name||'')))return CHINESE_AUDIO_LABELS[0];
 return '';
}
function captionLanguageName(code){
 if(isoAudioNames[code])return isoAudioNames[code];
 try{return new Intl.DisplayNames(['en'],{type:'language'}).of(code)||code.toUpperCase()}catch{return code.toUpperCase()}
}
function audioLanguage(entry,index=0){
 const raw=String(entry?.language||'').toLowerCase().trim().split(/[-_]/)[0];
 const named=isoAudioNames[raw]||formatAudioLabel(entry?.label,raw,index);
 const match=Object.entries(isoAudioNames).find(([code,name])=>code.length===2&&name.toLowerCase()===String(named).toLowerCase());
 return match?.[0]||((/^[a-z]{2}$/.test(raw)&&raw!=='un')?raw:'');
}
const genericAudioLabel=value=>/^(?:default(?:\s+audio)?|main|audio(?:[ _-]*\d+)?|track(?:[ _-]*\d+)?|original(?:\s+audio)?|unknown|und|\d+)$/i.test(String(value||'').trim());
// Chinese is written without spaces, so a raw "中文" label needs the same bucket
// mapping that the romanised names already get.
function localizedAudioName(text){
 const raw=String(text||'').trim();
 if(!raw)return '';
 if(CHINESE_LABEL_RX.test(raw))return formatChineseLabel(raw,'');
 return '';
}
function formatAudioLabel(rawLabel,rawLang,index){
 let text=String(rawLabel||'').trim(),langCode=String(rawLang||'').trim().toLowerCase().split(/[-_]/)[0];
 let combined=`${text} ${langCode}`.trim();
 const chinese=formatChineseLabel(text,langCode)||localizedAudioName(text);
 if(chinese)return chinese;
 for(const [rx,cleanName] of cleanAudioLangPatterns){if(rx.test(combined))return cleanName}
 if(isoAudioNames[langCode])return isoAudioNames[langCode];
 if(langCode&&/^[a-z]{2,3}$/.test(langCode)&&!['und','unk'].includes(langCode)){
  try{const name=new Intl.DisplayNames(['en'],{type:'language'}).of(langCode);if(name&&name.toLowerCase()!==langCode)return name}catch{}
 }
 if(text&&!genericAudioLabel(text))return text.replace(/^([A-Za-z]{2,3})(?=\s*(\(|$|-))/,(m)=>isoAudioNames[m.toLowerCase()]||m);
 return index===0?'Original audio':`Audio ${index+1}`;
}

function parseVttTimeSec(ts){
 const m=String(ts||'').trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
 if(!m)return NaN;
 const hh=Number(m[1]||0),mm=Number(m[2]||0),ss=Number(m[3]||0),ms=Number(m[4].padEnd(3,'0'));
 return hh*3600+mm*60+ss+ms/1000;
}
function decodeSubEntities(s){
 return String(s||'').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');
}
const CUE_TIMING_RX=/^((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;
const WATERMARK_CUE_RX=/osdb\.link|opensubtitles\.org|subtitles?\s+by\s+opensubtitles|support\s+us\s+and\s+become\s+vip|advertise\s+your\s+product\s+or\s+brand|addic7ed\.com|subscene\.com|podnapisi\.net|subdl\.com|wyzie\.ru|yts\.(?:mx|lt|ag)|yify/i;
function parseWebVttCues(rawText){
 const text=String(rawText||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(!text)return [];
 // Never apply HLS segment X-TIMESTAMP-MAP offsets to standalone VTT files (causes +10s/+16s drift on full-timeline tracks)
 const lines=text.split('\n');
 const cues=[];
 let i=0;
 while(i<lines.length){
  const trimmed=lines[i].trim();
  if(!trimmed||/^WEBVTT\b|^X-TIMESTAMP-MAP/i.test(trimmed)){i++;continue}
  if(/^(?:NOTE|STYLE|REGION)\b/i.test(trimmed)){
   i++;
   while(i<lines.length&&lines[i].trim())i++;
   continue;
  }
  const m=trimmed.match(CUE_TIMING_RX);
  if(!m){i++;continue}
  const start=Math.max(0,parseVttTimeSec(m[1]));
  const end=Math.max(start+0.08,parseVttTimeSec(m[2]));
  i++;
  const bodyLines=[];
  while(i<lines.length){
   const cur=lines[i].trim();
   if(!cur){i++;break}
   if(CUE_TIMING_RX.test(cur))break;
   if(/^\d+$/.test(cur)&&i+1<lines.length&&CUE_TIMING_RX.test(lines[i+1].trim())){i++;break}
   bodyLines.push(cur);
   i++;
  }
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
  const body=decodeSubEntities(bodyLines.join('\n').replace(/<[^>]+>/g,'').replace(/\{\\[^}]+\}/g,'')).trim();
  if(!body||WATERMARK_CUE_RX.test(body))continue;
  cues.push({start,end,text:body});
 }
 cues.sort((a,b)=>a.start-b.start);
 return cues;
}

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const rgba=(rgb,opacity)=>`rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0,Math.min(1,Number(opacity)/100))})`;
function formatClock(seconds){
 if(!Number.isFinite(seconds)||seconds<0)seconds=0;
 let total=Math.floor(seconds),h=Math.floor(total/3600),m=Math.floor(total/60)%60,s=String(total%60).padStart(2,'0');
 return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;
}
function storePreference(key,value){
 if(/^kozutv-/.test(key)&&typeof window.kozutvSavePreference==='function')return window.kozutvSavePreference(key,value);
 try{localStorage.setItem(key,String(value));return true}catch{return false}
}
function removePreference(key){
 if(/^kozutv-/.test(key)&&typeof window.kozutvRemovePreference==='function')return window.kozutvRemovePreference(key);
 try{localStorage.removeItem(key)}catch{}
}
function readJSON(key,fallback){try{let v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch{return fallback}}
function writeJSON(key,val){storePreference(key,JSON.stringify(val))}
function loadCaptionStyle(mode){
 const preset=captionPresets[mode]||captionPresets['anime-sub'];
 return {...preset,...readJSON(`kozutv-caption-style-${mode}`,{})};
}
function saveCaptionStyle(mode,style){writeJSON(`kozutv-caption-style-${mode}`,style)}

function create(player,options={}){
 // The server's answer is copied, never mutated: availableLangs is grown in
 // place as regional audio is discovered, and the caller's object stays intact.
 const host=player.el(),item=options.item||{},isAnime=item.type==='anime';
 const data={...(options.data||{})};
 if(!Array.isArray(data.availableLangs)&&Array.isArray(options.data?.availableLangs))data.availableLangs=[...options.data.availableLangs];
 let captionMode=isAnime&&options.lang==='sub'?'anime-sub':'ott';
 let subPrefKey=`kozutv-sub-pref-${captionMode}`;
 host.classList.add('mp-host');
 host.dataset.mediaKind=isAnime?'anime':'ott';
 host.dataset.captionMode=captionMode;
 let hideTimer=null,loaderTimer=null,tapSeekTimer=null,singleTapTimer=null,warmPreviewTimer=null;
 let captionStyle=loadCaptionStyle(captionMode),activeTrack=null,captionCueHandler=null,selectedTrackKey=-1,subtitlePrefRestored=false;
 let currentQuality=(()=>{try{return localStorage.getItem('kozutv-quality')||'auto'}catch{return 'auto'}})();
 let audioPrefApplied=Boolean(options.audioPreselected);
 const hevcSupported=canPlayHevcCodec();
 // Identical source URLs are not distinct audio variants. Prefer the metadata
 // matching the actual primary source and use native HLS tracks when present.
 const multiAudioStreams=[];
 for(const stream of (Array.isArray(data.audioStreams)?data.audioStreams:[])){
  if(!stream?.src||(!hevcSupported&&stream.codec==='hevc'))continue;
  const index=multiAudioStreams.findIndex(existing=>existing.src===stream.src);
  if(index<0)multiAudioStreams.push(stream);
  else if(stream.src===data.src&&audioLanguage(stream)===audioLanguage({language:data.audioLang,label:data.audioLabel}))multiAudioStreams[index]=stream;
 }
 let animeRegionalStreams=(Array.isArray(data.regionalStreams)?data.regionalStreams:[]).filter(a=>a?.src&&a?.key&&(hevcSupported||a.codec!=='hevc'));
 let activeAudioStreamIndex=0;
 if(multiAudioStreams.length){
  const matchIdx=multiAudioStreams.findIndex(a=>a.src===data.src);
  if(matchIdx>=0)activeAudioStreamIndex=matchIdx;
 }
 function collectQualityStreams(source){
  const raw=(Array.isArray(source)?source:[]).filter(q=>q?.src&&Number(q.tier)>0);
  const h264Only=raw.filter(q=>q.codec!=='hevc');
  const usable=hevcSupported?raw:(h264Only.length?h264Only:raw);
  const byTier=new Map();
  for(const q of usable){const prev=byTier.get(q.tier);if(!prev||(prev.codec==='hevc'&&q.codec!=='hevc'))byTier.set(q.tier,q)}
  return [...byTier.values()].sort((a,b)=>b.tier-a.tier);
 }
 let qualityStreams=collectQualityStreams(data.qualityStreams);
 let activeQualityStreamTier=(()=>{
  const m=qualityStreams.find(q=>q.src===data.src);
  return m?m.tier:(qualityStreams[0]?.tier||0);
 })();
 try{removePreference('kozutv-brightness');removePreference('vjs-vhs')}catch{}
 let previewPlayer=null,previewInitStarted=false,previewReady=false,previewBusy=false,queuedPreviewTime=null,lastPreviewTime=-99,previewTimer=null;
 let scrubPointerId=null,scrubStartX=0,scrubHoldReady=false,scrubPendingPercent=0;
 let orientationLocked=Boolean((document.fullscreenElement||document.webkitFullscreenElement)&&host.closest('#player')===(document.fullscreenElement||document.webkitFullscreenElement)),disposed=false;
 let pointerStart=null,lastPointerUpAt=0,lastSideTap={side:'',time:0},activeSkipSide='',lastSkipAt=0,skipAccum=0;
 let resyncing=false;

 // Compact 160x90 LRU frame cache for instant 0ms scrub hits
 const frameCache=new Map();
 let lastMainCacheBucket=-1;

 // Lazy remote subtitle catalog: 0 HTTP requests on load; fetched on-demand when selected or restored!
 const remoteCatalog=(Array.isArray(data.tracks)?data.tracks:[]).filter(t=>t?.src).map((t,i)=>({...t,id:'remote-'+i,loadedTrack:null}));
 const remoteTrackObjects=new WeakSet();

 const ui=document.createElement('div');
 ui.className='mp-ui';
 ui.dataset.active='true';
 ui.dataset.paused=options.autoplay===false?'true':'false';
 ui.dataset.autoplay=options.autoplay===false?'false':'true';
 ui.dataset.loading=options.autoplay===false?'false':'true';
 ui.dataset.seeking='false';
 ui.dataset.scrubbing='false';
 ui.dataset.settingsOpen='false';
 ui.dataset.subpanel='';
 ui.innerHTML=`
  <div class="mp-loader" aria-hidden="true"></div>
  <div class="mp-notice" role="status" aria-live="polite" hidden></div>
  <button type="button" class="mp-button mp-prev-ep" title="Previous episode" aria-label="Previous episode"${options.hasPrevEpisode?'':' hidden'}>${icons.prevEpisode}</button>
  <button type="button" class="mp-button mp-next-ep" title="Next episode" aria-label="Next episode"${options.hasNextEpisode?'':' hidden'}>${icons.nextEpisode}</button>
  <div class="mp-tap-seek" data-side="left" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg><span data-seek-text>10s</span></div>
  <div class="mp-tap-seek" data-side="right" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg><span data-seek-text>10s</span></div>
  <div class="mp-captions" aria-live="off"></div>
  <button type="button" class="mp-center-play" aria-label="Play">${icons.play}</button>
  <button type="button" class="mp-skip mp-skip-intro" hidden>Skip Intro</button>
  <button type="button" class="mp-skip mp-skip-outro" hidden>Skip Outro</button>
  <div class="mp-bottom">
   <div class="mp-seek-area">
    <div class="mp-seek-preview" hidden><canvas width="160" height="90"></canvas><span class="mp-preview-time">0:00</span></div>
    <div class="mp-seek-rail">
     <div class="mp-seek-buffer"></div>
     <div class="mp-seek-marker mp-intro-marker" hidden></div>
     <div class="mp-seek-marker mp-outro-marker" hidden></div>
     <div class="mp-seek-progress"></div>
    </div>
    <span class="mp-seek-dot" aria-hidden="true"></span>
    <input class="mp-seek-input" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
   </div>
   <div class="mp-control-row">
    <button type="button" class="mp-button mp-play-control" aria-label="Play">${icons.play}</button>
    <button type="button" class="mp-button mp-mute" aria-label="Mute">${icons.volume}</button>
    <div class="mp-time"><span data-mp-current>0:00</span><span class="mp-time-separator"> / </span><span data-mp-duration>0:00</span></div>
    <div class="mp-spacer"></div>
    <button type="button" class="mp-button mp-download-button" aria-label="Download episode" hidden>${icons.download}</button>
    <button type="button" class="mp-button mp-cc-button" aria-label="Subtitles">${icons.ccOff}</button>
    <button type="button" class="mp-button mp-settings-button" aria-label="Settings">${icons.settings}</button>
    <button type="button" class="mp-button mp-pip" aria-label="Picture in Picture">${icons.pip}</button>
    <button type="button" class="mp-button mp-fullscreen" aria-label="Fullscreen">${icons.fullscreen}</button>
   </div>
  </div>
  <div class="mp-settings" role="dialog" aria-label="Player settings" hidden>
   <div class="mp-settings-tabs" role="tablist">
    <button type="button" class="mp-button mp-tab active" data-tab="cc" aria-label="Subtitles">${icons.ccOff}</button>
    <button type="button" class="mp-button mp-tab" data-tab="audio" aria-label="Audio">${icons.audioTracks}</button>
    <button type="button" class="mp-button mp-tab" data-tab="quality" aria-label="Quality and servers">${icons.quality}</button>
    <button type="button" class="mp-button mp-tab" data-tab="speed" aria-label="Playback speed">${icons.speed}</button>
    <button type="button" class="mp-button mp-settings-close" aria-label="Close settings">${icons.close}</button>
   </div>
   <div class="mp-panel" data-panel="cc">
    <div class="mp-cc-topbar"><button type="button" class="mp-subtitle-settings-link" data-open-caption-style>Settings</button></div>
    <div class="mp-track-list"></div>
   </div>
   <div class="mp-panel" data-panel="caption-style" hidden>
    <div class="mp-style-header"><button type="button" class="mp-button" data-back-cc aria-label="Back to subtitles">${icons.back}</button><strong>Subtitle Settings</strong><button type="button" class="mp-button mp-style-close" data-close-settings aria-label="Close settings">${icons.close}</button></div>
    <div class="mp-style-controls"><label class="mp-style-row"><span>Sync Timing</span><select data-caption-offset>${syncOffsetChoices.map(([v,text])=>`<option value="${v}" ${v==='0'?'selected':''}>${esc(text)}</option>`).join('')}</select></label>${captionOptions.map(([key,label,choices])=>`<label class="mp-style-row"><span>${esc(label)}</span><select data-caption-style="${key}">${choices.map(([v,text])=>`<option value="${v}">${esc(text)}</option>`).join('')}</select></label>`).join('')}</div>
   </div>
   <div class="mp-panel" data-panel="audio" hidden><div class="mp-audio-list"></div></div>
   <div class="mp-panel" data-panel="quality" hidden>
    <div class="mp-quality-list"></div>
    <div class="mp-server-section"><h3>Stream Server</h3><div class="mp-server-list"></div></div>
   </div>
   <div class="mp-panel" data-panel="speed" hidden><div class="mp-speed-list"></div></div>
  </div>`;
 host.appendChild(ui);

 const $=sel=>ui.querySelector(sel),$$=sel=>[...ui.querySelectorAll(sel)];
 // Downloads exist only in the app, and only for a stream that has an episode
 // to save. On the website the button is never rendered at all.
 const downloadButton=$('.mp-download-button');
 (function initDownload(){
  if(!downloadButton)return;
  let canSave=false;
  try{canSave=Boolean(window.kozutvDownloads)&&typeof options.onDownload==='function'}catch{canSave=false}
  if(!canSave){downloadButton.remove();return}
  downloadButton.hidden=false;
  downloadButton.addEventListener('click',async event=>{
   event.stopPropagation();event.preventDefault();
   // One tap saves; a second tap on an already-saved episode opens the
   // Downloads screen, where it can be played or removed deliberately.
   if(options.isDownloaded?.()){options.onOpenDownloads?.();return}
   downloadButton.classList.add('is-busy');
   let started=false;
   try{started=(await options.onDownload?.())===true}catch{started=false}
   downloadButton.classList.remove('is-busy');
   // The icon only claims "saved" once the phone actually accepted the job.
   downloadButton.classList.toggle('is-saved',started);
  });
 })();
 const centerPlay=$('.mp-center-play'),playButton=$('.mp-play-control'),muteButton=$('.mp-mute'),ccButton=$('.mp-cc-button'),fullscreenButton=$('.mp-fullscreen'),pipButton=$('.mp-pip'),prevEpButton=$('.mp-prev-ep'),nextEpButton=$('.mp-next-ep');
 const seekArea=$('.mp-seek-area'),seekInput=$('.mp-seek-input'),seekProgress=$('.mp-seek-progress'),seekBuffer=$('.mp-seek-buffer'),seekPreview=$('.mp-seek-preview'),previewCanvas=$('.mp-seek-preview canvas'),previewTime=$('.mp-preview-time');
 const currentEl=$('[data-mp-current]'),durationEl=$('[data-mp-duration]'),captionsEl=$('.mp-captions'),settings=$('.mp-settings');
 const skipIntro=$('.mp-skip-intro'),skipOutro=$('.mp-skip-outro'),introMarker=$('.mp-intro-marker'),outroMarker=$('.mp-outro-marker');
 const tapLeft=$('.mp-tap-seek[data-side="left"]'),tapRight=$('.mp-tap-seek[data-side="right"]');

 if(!document.pictureInPictureEnabled)pipButton.hidden=true;

 const showControls=()=>{
  ui.dataset.active='true';
  clearTimeout(hideTimer);
  if(settings.hidden&&ui.dataset.scrubbing!=='true')hideTimer=setTimeout(()=>{if(settings.hidden&&ui.dataset.scrubbing!=='true'&&seekPreview.hidden)ui.dataset.active='false'},3000);
 };
 const hideControls=()=>{clearTimeout(hideTimer);if(settings.hidden&&ui.dataset.scrubbing!=='true')ui.dataset.active='false'};
 const toggleControls=()=>{if(ui.dataset.active==='true')hideControls();else showControls()};

 let activeTapAnim=null,pendingSkipTarget=null,skipCommitTimer=null;
 function triggerTapSeek(side,seconds){
  const el=side==='left'?tapLeft:tapRight,other=side==='left'?tapRight:tapLeft;
  other.classList.remove('is-animating');
  if(activeTapAnim){try{activeTapAnim.cancel()}catch{}activeTapAnim=null}
  el.querySelector('[data-seek-text]').textContent=`${seconds}s`;
  el.classList.add('is-animating');
  if(typeof el.animate==='function'&&!document.documentElement.classList.contains('reduce-motion')){
   const dx=side==='right'?[ -8, 2, 6, 10 ]:[ 8, -2, -6, -10 ];
   activeTapAnim=el.animate([
    {opacity:0,transform:`translate3d(${dx[0]}px, -50%, 0)`,offset:0},
    {opacity:1,transform:`translate3d(${dx[1]}px, -50%, 0)`,offset:0.2},
    {opacity:1,transform:`translate3d(${dx[2]}px, -50%, 0)`,offset:0.74},
    {opacity:0,transform:`translate3d(${dx[3]}px, -50%, 0)`,offset:1}
   ],{duration:600,easing:'cubic-bezier(.22, .8, .28, 1)',fill:'forwards'});
  }
  clearTimeout(tapSeekTimer);
  tapSeekTimer=setTimeout(()=>{
   el.classList.remove('is-animating');
   if(activeTapAnim){try{activeTapAnim.cancel()}catch{}activeTapAnim=null}
  },620);
 }
 function preferredSeekStep(){
  let n=10;try{n=Number(localStorage.getItem('kozutv-seek-step'))||10}catch{}
  return [5,10,15,30].includes(n)?n:10;
 }
 function performSkipSeek(delta,hideUiOnSkip=false){
  const now=Date.now();
  const side=delta>=0?'right':'left';
  const stepAbs=Math.abs(delta)||10;
  skipAccum=(activeSkipSide===side&&now-lastSkipAt<650)?skipAccum+stepAbs:stepAbs;
  activeSkipSide=side;
  lastSkipAt=now;
  if(hideUiOnSkip)hideControls();
  const dur=Number(player.duration());
  const base=pendingSkipTarget!==null?pendingSkipTarget:(Number(player.currentTime())||0);
  const target=Math.max(0,Number.isFinite(dur)&&dur>0?Math.min(Math.max(0,dur-0.15),base+delta):base+delta);
  pendingSkipTarget=target;
  // Update timestamp and progress bar on frame 0 without waiting for MSE seek completion
  currentEl.textContent=formatClock(target);
  if(Number.isFinite(dur)&&dur>0&&ui.dataset.scrubbing!=='true'){
   const pct=Math.max(0,Math.min(100,target/dur*100));
   seekProgress.style.width=`${pct}%`;
   seekInput.value=String(Math.round(pct*10));
  }
  triggerTapSeek(side,skipAccum);
  clearTimeout(skipCommitTimer);
  const commitSeek=()=>{
   skipCommitTimer=null;
   if(disposed||pendingSkipTarget===null)return;
   const finalTarget=pendingSkipTarget;
   pendingSkipTarget=null;
   try{player.currentTime(finalTarget)}catch{}
   updateSkip();
   if(selectedTrackKey>=0)renderCaptions();
  };
  // Commit immediately on isolated single press when not mid-seek; coalesce rapid multi-taps over 75ms to prevent MSE SourceBuffer thrashing
  if(!player.seeking()&&skipAccum<=stepAbs){
   commitSeek();
  }else{
   skipCommitTimer=setTimeout(commitSeek,75);
  }
 }

 function applyCaptionStyle(){
  const preset=captionPresets[captionMode]||captionPresets['anime-sub'];
  const fg=captionColors[captionStyle.color]||captionColors.white;
  const bg=captionColors[captionStyle.background]||captionColors.black;
  const bgOp=Number(captionStyle.backgroundOpacity??preset.backgroundOpacity);
  const edgeSpec=captionEdges[captionStyle.edge]||captionEdges[preset.edge]||captionEdges.none;
  const weight=captionStyle.weight||(captionMode==='anime-dub'?'400':captionMode==='anime-sub'?'700':'600');
  const hasBox=bgOp>0;
  host.style.setProperty('--mp-subtitle-scale',String(Math.min(2,Math.max(.5,(Number(captionStyle.size||preset.size)||100)/100))));
  host.style.setProperty('--mp-subtitle-color',rgba(fg,captionStyle.textOpacity??100));
  host.style.setProperty('--mp-subtitle-background',rgba(bg,bgOp));
  host.style.setProperty('--mp-subtitle-font',captionFonts[captionStyle.font]||captionFonts[preset.font]||captionFonts.system);
  host.style.setProperty('--mp-subtitle-weight',weight);
  host.style.setProperty('--mp-subtitle-stroke',edgeSpec.stroke||'0px transparent');
  host.style.setProperty('--mp-subtitle-shadow',edgeSpec.shadow||'none');
  host.style.setProperty('--mp-subtitle-padding',hasBox?'.04em .2em':'.02em .1em');
  host.style.setProperty('--mp-subtitle-radius','0px');
  host.style.setProperty('--mp-subtitle-line-height',hasBox?'1.34':'1.25');
  host.style.setProperty('--mp-subtitle-gap',hasBox?'1px':'2px');
  ui.dataset.captionPosition=captionStyle.position||'bottom';
  for(let select of $$('[data-caption-style]'))select.value=captionStyle[select.dataset.captionStyle]||preset[select.dataset.captionStyle];
 }

 function manualTracks(){
  return Array.from(player.textTracks()||[]).filter(t=>(t.kind==='subtitles'||t.kind==='captions')&&!remoteTrackObjects.has(t));
 }
 // Captions follow the audio which is actually selected, never the preferred
 // language when the player has fallen back to a different source.
 function selectedAudioInfo(){
  const tracks=Array.from(player.audioTracks?.()||[]),active=tracks.find(t=>t.enabled),nativeLang=active?audioLanguage(active):'';
  let lang='';
  if(isAnime){
   const value=String(options.lang||data.activeLang||'sub').toLowerCase();
   // A labelled track actually selected by Video.js is stronger evidence than
   // the source requested earlier, which can contain multiple audio tracks.
   lang=nativeLang||(value==='sub'?(audioLanguage({language:data.audioLang})||String(item.originalLanguage||'ja').slice(0,2)):value==='dub'?'en':value);
  }else lang=nativeLang||audioLanguage({language:data.audioLang,label:data.audioLabel});
  // An unlabelled selection among several tracks is not proof of a language.
  if(active&&tracks.length>1&&!nativeLang)lang='';
  if(!/^[a-z]{2}$/.test(lang)||lang==='un')lang='';
  const label=active&&nativeLang===lang?String(active.label||''):(String(data.audioLabel||''));
  return {language:lang,label:label.slice(0,128),multiple:tracks.length>1};
 }
 // The settings toggle defaults to false, so an unset key must mean off. It
 // used to read "anything that is not the string false is on", which made a
 // fresh browser - where nothing is stored yet - silently enable it.
 function transcriptionEnabled(){
  try{
   const raw=localStorage.getItem('kozutv-ai-transcription');
   if(raw===null||raw===undefined||raw==='')return false;
   return raw==='true'||raw==='1'||raw==='on';
  }catch{return false}
 }
 let aiFallback=false,aiActive=false,aiRoman=false,aiTrackLanguage='',aiGeneration=0,aiWindows=new Map(),aiRequests=new Map(),aiRetry=new Map(),captionAudioTimer=null;
 function combinedTracks(){
  const language=selectedAudioInfo().language;
  if(!language)return [];
  const animeProvider=isAnime&&String(options.lang||data.activeLang||'sub').toLowerCase()==='sub';
  const manual=manualTracks().map((t,i)=>({kind:'manual',track:t,language:t.language||'',label:t.label||t.language||`Subtitle ${i+1}`}));
  const remote=remoteCatalog.map((entry,i)=>({kind:'remote',entry,language:entry.language||'',label:entry.label||entry.language||`Subtitle ${manual.length+i+1}`}));
  // Signs & Songs / forced tracks are an anime concept; they stay visible on
  // every anime audio choice (sub or dub) and are never surfaced for TV/movies.
  const isSignsSongs=t=>/signs|songs|forced/i.test(String(t.label||''));
  const matching=[...manual,...remote].filter(t=>animeProvider
   ?/^en/i.test(audioLanguage({language:t.language,label:t.label})||'')
   :audioLanguage({language:t.language,label:t.label})===language);
  if(isAnime){
   const extraSigns=[...manual,...remote].filter(t=>isSignsSongs(t)&&!matching.includes(t));
   if(extraSigns.length)matching.push(...extraSigns);
  }
  const aiRows=()=>{
   const rows=[];
   // Japanese anime uses the provider's own English subtitles (MegaPlay /
   // Crunchyroll); there is no English (AI) row on that path. An AI row is only
   // offered in the language actually being spoken.
   // Chinese audio arrives under zh, yue or a bare "Chinese" label; the caption
   // row names the script that was actually selected rather than a generic one.
   const spoken=String(selectedAudioInfo()?.label||'').toLowerCase();
   const baseName=captionLanguageName(language);
   // The AI track is a transcription of the audio, so its name is the language
   // being SPOKEN, not the player's UI language. English audio must read
   // "English" (it previously read "Hindi" whenever the interface was Hindi).
   const spokenLanguage=audioLanguage(selectedAudioInfo()||{})||language;
   const spokenName=captionLanguageName(spokenLanguage)||baseName;
   const aiLabel=/cantonese|yue/i.test(spoken)
    ? CHINESE_AUDIO_LABELS[1]
    : /mandarin|chinese|zh/i.test(spoken) && ['zh','yue'].includes(spokenLanguage) ? CHINESE_AUDIO_LABELS[0] : spokenName;
   if(!rows.some(r=>r.label===aiLabel))rows.push({kind:'ai',language:spokenLanguage,aiLanguage:language,label:aiLabel,roman:false});
   if(ROMAN_CAPTION_NAMES[language])rows.push({kind:'ai',language,aiLanguage:language,label:ROMAN_CAPTION_NAMES[language],roman:true});
   return rows;
  };
  if(transcriptionEnabled()&&!aiFallback&&AI_TRACK_LANGS.has(language)){
   // Anime Japanese audio keeps the provider's own English subtitle first
   // (MegaPlay's track for this exact video); AI captions follow as choices.
   if(animeProvider)return [...matching,...aiRows()];
   return aiRows();
  }
  return animeProvider?matching:matching.filter(t=>audioLanguage({language:t.language,label:t.label})===language);
 }
 function cancelAi(clear=true){
  aiGeneration++;for(const ctrl of aiRequests.values())ctrl.abort();aiRequests.clear();aiRetry.clear();
  if(clear)aiWindows.clear();
 }
 function refreshAiCues(){
  if(!aiActive)return;
  // A small visual lead favors slightly early over late captions. The media
  // timeline and the server's cue timestamps remain unchanged.
  const earlyLead=0.18;
  activeParsedCues=[...aiWindows.values()].flatMap(w=>(w.cues||[]).map(c=>({start:Math.max(0,Number(c.start)-earlyLead),end:Number(c.end),text:aiRoman?String(c.roman||''):String(c.text||'')})))
   .filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.end>c.start&&c.text).sort((a,b)=>a.start-b.start);
  lastRenderedCaptionSig='';renderCaptions();
 }
 function fallbackToExistingCaptions(reason=''){
  if(disposed||!aiActive)return;
  const wasSelected=selectedTrackKey>=0;cancelAi();aiActive=false;aiFallback=true;selectedTrackKey=-1;activeParsedCues=null;bindActiveTrack(null);
  // A possible label/content mismatch means we cannot safely assume even a
  // matching-language subtitle file matches the spoken audio. Leave it off.
  if(reason==='audio_language_mismatch'){
   subtitlePrefRestored=true;selectSubtitle(-1,false);return;
  }
  // Captions that cannot be produced must not become a conversation: keep the
  // subtitle choice empty (no AI rows) and say nothing at all.
  const items=combinedTracks();
  if(wasSelected&&items.length&&reason!=='suppressed'){subtitlePrefRestored=true;selectSubtitle(0,false)}
  else{selectSubtitle(-1,false)}
 }
 function pumpAi(){
  if(disposed||!aiActive||!transcriptionEnabled()||aiFallback)return;
  const audio=selectedAudioInfo();if(!audio.language||!data.src)return;
  // A track may name a different transcription language than the audio itself
  // (e.g. English (AI) captions over Japanese audio).
  const aiLang=aiTrackLanguage||audio.language;
  const now=Math.max(0,Number(player.currentTime())||0),base=Math.floor(now/12)*12,duration=Number(player.duration())||Infinity;
  const generation=aiGeneration;
  for(const target of [base,base+12]){
   const windowKey=`${aiLang}:${target}`;
   if(target>=duration||aiWindows.has(windowKey)||aiRequests.has(windowKey)||(aiRetry.get(windowKey)?.after||0)>Date.now())continue;
   const ctrl=new AbortController();aiRequests.set(windowKey,ctrl);
   let timedOut=false;
   const timeout=setTimeout(()=>{timedOut=true;ctrl.abort()},42000);
   fetch('/api/ai-transcription',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',signal:ctrl.signal,
    body:JSON.stringify({src:data.src,language:aiLang,audioLabel:audio.label,multipleAudio:audio.multiple,time:target})})
    .then(async r=>{const body=await r.json().catch(()=>({}));if(!r.ok){const e=Error(body.error||'transcription_failed');e.status=r.status;e.code=body.error;throw e}return body})
    .then(result=>{
     if(disposed||generation!==aiGeneration||!aiActive)return;
     aiRetry.delete(windowKey);aiWindows.set(windowKey,result);
     while(aiWindows.size>8)aiWindows.delete(aiWindows.keys().next().value);
     refreshAiCues();
    }).catch(e=>{
     if(disposed||generation!==aiGeneration||!aiActive||(ctrl.signal.aborted&&!timedOut))return;
     const prior=aiRetry.get(windowKey)?.count||0;
     // 400/403/422 and an unconfigured key will never succeed, so stop at once.
     if([400,403,422].includes(e.status)||e.code==='transcription_unconfigured'){fallbackToExistingCaptions(e.code);return}
     // Everything else is retried silently in the background (3 attempts) and
     // then dropped without any message.
     if(prior>=2){fallbackToExistingCaptions('suppressed');return}
     aiRetry.set(windowKey,{count:prior+1,after:Date.now()+2500*(prior+1)});
    }).finally(()=>{clearTimeout(timeout);if(aiRequests.get(windowKey)===ctrl)aiRequests.delete(windowKey)});
  }
 }
 let lastCaptionAudioSignature='';
 function captionAudioSignature(){const a=selectedAudioInfo();return `${data.src||''}|${a.language}|${a.label}|${a.multiple}|${transcriptionEnabled()}`}
 function refreshCaptionContext(force=false){
  if(disposed)return;const signature=captionAudioSignature();if(!force&&signature===lastCaptionAudioSignature)return;
  const wasOn=selectedTrackKey>=0,preferRoman=aiActive&&aiRoman;lastCaptionAudioSignature=signature;
  cancelAi();aiActive=false;aiFallback=false;selectedTrackKey=-1;activeParsedCues=null;captionAutoOffset=0;subtitlePrefRestored=false;
  if(autoSyncAbort){try{autoSyncAbort.abort()}catch{}autoSyncAbort=null}
  bindActiveTrack(null);disableAllNativeTracks();
  const items=combinedTracks();
  if(wasOn&&items.length){const preferred=preferRoman?items.findIndex(x=>x.kind==='ai'&&x.roman):0;subtitlePrefRestored=true;selectSubtitle(preferred<0?0:preferred,false)}
  else{selectSubtitle(-1,false);restoreSubtitlePreference()}
  renderTracks();
 }
 function scheduleCaptionContext(){clearTimeout(captionAudioTimer);captionAudioTimer=setTimeout(()=>refreshCaptionContext(),80)}

 function disableAllNativeTracks(){
  for(let track of Array.from(player.textTracks()||[]))if(track.kind==='subtitles'||track.kind==='captions')track.mode='disabled';
 }
 // Keep the user's selected language when changing to a source-specific,
 // independently timed caption catalog.
 function replaceRemoteCatalog(tracks,oldIndex){
  const previous=oldIndex>=0?combinedTracks()[oldIndex]:null;
  const entries=(Array.isArray(tracks)?tracks:[]).filter(t=>t?.src).map((t,i)=>({...t,id:'remote-'+i,loadedTrack:null}));
  remoteCatalog.splice(0,remoteCatalog.length,...entries);
  const items=combinedTracks(),label=String(previous?.label||'').toLowerCase(),language=String(previous?.language||'').toLowerCase();
  let next=oldIndex<0?-1:items.findIndex(t=>label&&String(t.label||'').toLowerCase()===label);
  if(next<0&&oldIndex>=0&&language)next=items.findIndex(t=>String(t.language||'').toLowerCase()===language);
  selectedTrackKey=next;
  activeParsedCues=null;captionAutoOffset=0;lastRenderedCaptionSig='';
  if(autoSyncAbort){try{autoSyncAbort.abort()}catch{}autoSyncAbort=null}
  bindActiveTrack(null);disableAllNativeTracks();renderTracks();
  return next;
 }
 let activeParsedCues=null,captionSyncOffset=0,captionAutoOffset=0,lastRenderedCaptionSig='',autoSyncAbort=null;
 const autoSyncCache=new Map();
 const NON_SPEECH_CUE_RX=/^[♪♫#\s]+$|^\[[^\]]+\]$|^\([^)]+\)$/;
 function extractAdtsFromTsBytes(ts){
  let off=-1;
  const lim=Math.min(ts.length-376,4096);
  for(let i=0;i<=lim;i++){
   if(ts[i]===0x47&&ts[i+188]===0x47){off=i;break}
  }
  if(off<0)return null;
  const chunks=[];
  let audioPid=-1;
  for(let p=off;p+188<=ts.length;p+=188){
   if(ts[p]!==0x47)continue;
   const pusi=(ts[p+1]&0x40)!==0;
   const pid=((ts[p+1]&0x1f)<<8)|ts[p+2];
   const afc=(ts[p+3]>>4)&0x3;
   if((afc&1)===0||pid===0||pid===0x1fff)continue;
   let idx=p+4;
   if(afc===3)idx+=1+ts[idx];
   if(idx>=p+188)continue;
   if(pusi&&idx+9<=p+188&&ts[idx]===0&&ts[idx+1]===0&&ts[idx+2]===1){
    const sid=ts[idx+3];
    if(sid>=0xc0&&sid<=0xdf){
     if(audioPid<0)audioPid=pid;
     if(pid===audioPid){
      const pay=idx+9+ts[idx+8];
      if(pay<p+188)chunks.push(ts.subarray(pay,p+188));
     }
    }
   }else if(pid===audioPid){
    chunks.push(ts.subarray(idx,p+188));
   }
  }
  if(!chunks.length)return null;
  let total=0;
  for(const c of chunks)total+=c.length;
  const out=new Uint8Array(total);
  let pos=0;
  for(const c of chunks){out.set(c,pos);pos+=c.length}
  return out;
 }
 async function decryptHlsAes128(cipherU8,keyBytes,ivHex,seqNum){
  const iv=new Uint8Array(16);
  if(ivHex){
   const clean=ivHex.replace(/^0x/i,'').padStart(32,'0').slice(-32);
   for(let i=0;i<16;i++)iv[i]=parseInt(clean.slice(i*2,i*2+2),16)||0;
  }else{
   const dv=new DataView(iv.buffer);
   dv.setUint32(12,seqNum>>>0,false);
  }
  const cryptoKey=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-CBC'},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-CBC',iv},cryptoKey,cipherU8);
  return new Uint8Array(plain);
 }
 async function computeAudioSubtitleOffsetSec(streamSrc,cues,signal){
  const AudioCtx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!AudioCtx||!streamSrc||!Array.isArray(cues)||cues.length<25)return 0;
  const speechCues=cues.filter(c=>{
   if(!c||!(c.end>c.start))return false;
   const t=String(c.text||'').replace(/[♪♫]/g,'').trim();
   return t.length>=2&&!NON_SPEECH_CUE_RX.test(c.text.trim());
  });
  if(speechCues.length<22)return 0;

  const toAbsUrl=(rel,base)=>new URL(rel,base.startsWith('http')?base:(location.origin+(base.startsWith('/')?'':'/')+base)).toString();
  const masterUrl=toAbsUrl(streamSrc,location.href);
  const mRes=await fetch(masterUrl,{signal});
  if(!mRes.ok)return 0;
  let playlistText=await mRes.text();
  let mediaUrl=masterUrl;

  if(playlistText.includes('#EXT-X-STREAM-INF')||playlistText.includes('#EXT-X-MEDIA:TYPE=AUDIO')){
   const lines=playlistText.split(/\r?\n/);
   let chosenAudioUri='';
   const activeTracks=Array.from(player.audioTracks?.()||[]);
   const activeTrackObj=activeTracks.find(t=>t.enabled);
   const wantAudioName=String(activeTrackObj?.label||'').toLowerCase();
   const wantAudioLang=String(activeTrackObj?.language||'').toLowerCase();
   for(const raw of lines){
    const l=raw.trim();
    if(!l.startsWith('#EXT-X-MEDIA:')||!/TYPE=AUDIO/i.test(l))continue;
    const uri=l.match(/URI="([^"]+)"/i)?.[1];
    if(!uri)continue;
    const name=(l.match(/NAME="([^"]+)"/i)?.[1]||'').toLowerCase();
    const lang=(l.match(/LANGUAGE="([^"]+)"/i)?.[1]||'').toLowerCase();
    if((wantAudioName&&name===wantAudioName)||(wantAudioLang&&lang===wantAudioLang)){chosenAudioUri=uri;break}
    if(!chosenAudioUri&&/DEFAULT=YES/i.test(l))chosenAudioUri=uri;
   }
   if(chosenAudioUri){
    mediaUrl=toAbsUrl(chosenAudioUri,masterUrl);
   }else{
    let bestUri='',bestBw=Infinity;
    for(let i=0;i<lines.length;i++){
     const l=lines[i].trim();
     if(!l.startsWith('#EXT-X-STREAM-INF'))continue;
     const bw=Number(l.match(/BANDWIDTH=(\d+)/i)?.[1])||99999999;
     for(let j=i+1;j<lines.length;j++){
      const u=lines[j].trim();
      if(u&&!u.startsWith('#')){if(bw<bestBw){bestBw=bw;bestUri=u}break}
     }
    }
    if(bestUri)mediaUrl=toAbsUrl(bestUri,masterUrl);
   }
   if(mediaUrl!==masterUrl){
    const vRes=await fetch(mediaUrl,{signal});
    if(!vRes.ok)return 0;
    playlistText=await vRes.text();
   }
  }

  let segTime=0,pendingDur=0,mediaSeq=0,initMapUrl='',curKey=null;
  const segments=[];
  for(const raw of playlistText.split(/\r?\n/)){
   const l=raw.trim();
   if(!l)continue;
   if(l.startsWith('#EXT-X-MEDIA-SEQUENCE:'))mediaSeq=Number(l.split(':')[1])||0;
   else if(l.startsWith('#EXT-X-MAP:')){
    const u=l.match(/URI="([^"]+)"/i)?.[1];
    if(u)initMapUrl=toAbsUrl(u,mediaUrl);
   }else if(l.startsWith('#EXT-X-KEY:')){
    const method=l.match(/METHOD=([^,\s]+)/i)?.[1]||'NONE';
    if(method.toUpperCase()==='AES-128'){
     const ku=l.match(/URI="([^"]+)"/i)?.[1];
     const iv=l.match(/IV=([^,\s]+)/i)?.[1]||'';
     curKey=ku?{url:toAbsUrl(ku,mediaUrl),iv}:null;
    }else curKey=null;
   }else if(l.startsWith('#EXTINF:')){
    pendingDur= parseFloat(l.slice(8))||0;
   }else if(!l.startsWith('#')&&pendingDur>0){
    const seq=mediaSeq+segments.length;
    segments.push({start:segTime,end:segTime+pendingDur,dur:pendingDur,url:toAbsUrl(l,mediaUrl),seq,key:curKey});
    segTime+=pendingDur;
    pendingDur=0;
   }
  }
  if(segments.length<8||segTime<150)return 0;

  // Choose up to 2 high-contrast spoken dialogue windows (26s each) after intro/logos
  const minStart=Math.min(segTime*0.2,Math.max(55,(Number(data.intro?.end)||0)+12));
  const maxStart=Math.max(minStart+10,segTime-50);
  const winDur=26;
  const candWindows=[];
  for(let ws=minStart;ws<=maxStart;ws+=15){
   const we=ws+winDur;
   let cnt=0,covered=0;
   for(const c of speechCues){
    if(c.end<=ws)continue;
    if(c.start>=we)break;
    cnt++;
    covered+=Math.min(we,c.end)-Math.max(ws,c.start);
   }
   const duty=covered/winDur;
   if(cnt>=6&&duty>=0.18&&duty<=0.74){
    candWindows.push({ws,we,score:cnt*(1-Math.abs(duty-0.44))});
   }
  }
  candWindows.sort((a,b)=>b.score-a.score);
  const chosenWins=[];
  for(const w of candWindows){
   if(chosenWins.every(p=>Math.abs(p.ws-w.ws)>=60))chosenWins.push(w);
   if(chosenWins.length>=2)break;
  }
  if(!chosenWins.length)return 0;

  let initBuf=null;
  if(initMapUrl){
   const ir=await fetch(initMapUrl,{signal});
   if(ir.ok)initBuf=new Uint8Array(await ir.arrayBuffer());
  }
  const keyCache=new Map();
  const SR=8000,PAD=5.6;
  const windowPairs=[];

  for(const win of chosenWins){
   const padStart=Math.max(0,win.ws-PAD),padEnd=Math.min(segTime,win.we+PAD);
   const winSegs=segments.filter(s=>s.end>padStart&&s.start<padEnd).slice(0,12);
   if(winSegs.length<2)continue;
   const totalSamples=Math.ceil((padEnd-padStart)*SR);
   const stitched=new Float32Array(totalSamples);
   const decCtx=new AudioCtx(1,SR,SR);

   // Fetch segments in gentle batches of 4 so we never saturate browser per-origin connections during video startup
   const segBuffers=[];
   for(let b=0;b<winSegs.length;b+=4){
    const batch=await Promise.all(winSegs.slice(b,b+4).map(async seg=>{
     try{
      const r=await fetch(seg.url,{signal});
      if(!r.ok)return null;
      let u8=new Uint8Array(await r.arrayBuffer());
      if(seg.key?.url){
       let kb=keyCache.get(seg.key.url);
       if(!kb){
        const kr=await fetch(seg.key.url,{signal});
        if(!kr.ok)return null;
        kb=new Uint8Array(await kr.arrayBuffer());
        keyCache.set(seg.key.url,kb);
       }
       u8=await decryptHlsAes128(u8,kb,seg.key.iv,seg.seq);
      }
      let payload=u8;
      if(initBuf){
       const combo=new Uint8Array(initBuf.length+u8.length);
       combo.set(initBuf,0);combo.set(u8,initBuf.length);
       payload=combo;
      }else{
       const adts=extractAdtsFromTsBytes(u8);
       if(adts)payload=adts;
      }
      const ab=await decCtx.decodeAudioData(payload.buffer.slice(payload.byteOffset,payload.byteOffset+payload.byteLength));
      return {seg,ab};
     }catch{return null}
    }));
    segBuffers.push(...batch);
   }

   let decodedCount=0;
   for(const item of segBuffers){
    if(!item?.ab)continue;
    decodedCount++;
    const {seg,ab}=item;
    const ch0=ab.getChannelData(0);
    const ch1=ab.numberOfChannels>1?ab.getChannelData(1):null;
    const srcSr=ab.sampleRate||SR;
    const dstOffset=Math.round((seg.start-padStart)*SR);
    const outLen=Math.round(ch0.length*SR/srcSr);
    for(let i=0;i<outLen;i++){
     const di=dstOffset+i;
     if(di<0||di>=totalSamples)continue;
     const si=Math.min(ch0.length-1,Math.floor(i*srcSr/SR));
     stitched[di]=ch1?0.5*(ch0[si]+ch1[si]):ch0[si];
    }
   }
   if(decodedCount<Math.max(2,Math.floor(winSegs.length*0.6)))continue;

   // Native WebAudio C++ vocal-band (350-3000 Hz) + rumble (<180 Hz) separation
   const runFilter=async(type1,f1,type2,f2)=>{
    const oc=new AudioCtx(1,totalSamples,SR);
    const buf=oc.createBuffer(1,totalSamples,SR);
    buf.getChannelData(0).set(stitched);
    const src=oc.createBufferSource();src.buffer=buf;
    const b1=oc.createBiquadFilter();b1.type=type1;b1.frequency.value=f1;b1.Q.value=0.707;
    src.connect(b1);
    if(type2){
     const b2=oc.createBiquadFilter();b2.type=type2;b2.frequency.value=f2;b2.Q.value=0.707;
     b1.connect(b2);b2.connect(oc.destination);
    }else b1.connect(oc.destination);
    src.start(0);
    const rendered=await oc.startRendering();
    return rendered.getChannelData(0);
   };
   const [vocalPcm,rumblePcm]=await Promise.all([
    runFilter('highpass',350,'lowpass',3000),
    runFilter('lowpass',180,null,0)
   ]);

   const hop=80; // 10ms = 100 Hz envelope
   const nEnv=Math.floor(totalSamples/hop);
   const rawEnv=new Float32Array(nEnv);
   for(let f=0;f<nEnv;f++){
    let sv=0,sr=0,base=f*hop;
    for(let k=0;k<hop;k++){
     const v=vocalPcm[base+k],r=rumblePcm[base+k];
     sv+=v*v;sr+=r*r;
    }
    const vRms=Math.sqrt(sv/hop),rRms=Math.sqrt(sr/hop);
    rawEnv[f]=Math.max(0,Math.log1p(vRms*45)-0.55*Math.log1p(rRms*35));
   }
   // Subtract 7.0s slow BGM floor, then smooth across 140ms syllable gaps so spoken phrases match dialogue cue blocks
   const detrended=new Float32Array(nEnv);
   const halfW=350;
   let runSum=0;
   for(let i=0;i<Math.min(nEnv,halfW);i++)runSum+=rawEnv[i];
   for(let i=0;i<nEnv;i++){
    if(i+halfW<nEnv)runSum+=rawEnv[i+halfW];
    if(i-halfW-1>=0)runSum-=rawEnv[i-halfW-1];
    const cnt=Math.min(nEnv-1,i+halfW)-Math.max(0,i-halfW)+1;
    detrended[i]=Math.max(0,rawEnv[i]-0.82*(runSum/cnt));
   }
   const env=new Float32Array(nEnv);
   const smHalf=7;
   let smSum=0;
   for(let i=0;i<Math.min(nEnv,smHalf);i++)smSum+=detrended[i];
   for(let i=0;i<nEnv;i++){
    if(i+smHalf<nEnv)smSum+=detrended[i+smHalf];
    if(i-smHalf-1>=0)smSum-=detrended[i-smHalf-1];
    const cnt=Math.min(nEnv-1,i+smHalf)-Math.max(0,i-smHalf)+1;
    env[i]=smSum/cnt;
   }

   const coreFrames=Math.floor((win.we-win.ws)*100);
   const coreStartIdx=Math.round((win.ws-padStart)*100);
   const subGate=new Float32Array(coreFrames);
   for(const c of speechCues){
    if(c.end<=win.ws)continue;
    if(c.start>=win.we)break;
    const i0=Math.max(0,Math.floor((c.start-win.ws)*100));
    const i1=Math.min(coreFrames,Math.ceil((c.end-win.ws)*100));
    for(let k=i0;k<i1;k++)subGate[k]=1;
   }
   let gMean=0;
   for(let k=0;k<coreFrames;k++)gMean+=subGate[k];
   gMean/=coreFrames;
   let gVar=0;
   for(let k=0;k<coreFrames;k++){subGate[k]-=gMean;gVar+=subGate[k]*subGate[k]}
   if(gVar<1e-3)continue;
   windowPairs.push({env,coreStartIdx,coreFrames,subGate,gNorm:Math.sqrt(gVar)});
  }

  if(!windowPairs.length)return 0;
  const maxLag=520; // ±5.20s at 10ms resolution
  const corrs=new Float32Array(maxLag*2+1);
  let bestLag=0,bestCorr=-1;
  for(let lag=-maxLag;lag<=maxLag;lag++){
   let wSum=0,wCount=0;
   for(const wp of windowPairs){
    const startIdx=wp.coreStartIdx+lag;
    if(startIdx<0||startIdx+wp.coreFrames>wp.env.length)continue;
    let aMean=0;
    for(let k=0;k<wp.coreFrames;k++)aMean+=wp.env[startIdx+k];
    aMean/=wp.coreFrames;
    let num=0,aVar=0;
    for(let k=0;k<wp.coreFrames;k++){
     const av=wp.env[startIdx+k]-aMean;
     num+=av*wp.subGate[k];
     aVar+=av*av;
    }
    if(aVar>1e-6){
     wSum+=num/(Math.sqrt(aVar)*wp.gNorm);
     wCount++;
    }
   }
   const c=wCount?wSum/wCount:0;
   corrs[lag+maxLag]=c;
   if(c>bestCorr){bestCorr=c;bestLag=lag}
  }

  let bgSum=0,bgSq=0,bgN=0;
  for(let lag=-maxLag;lag<=maxLag;lag++){
   if(Math.abs(lag-bestLag)<=35)continue;
   const c=corrs[lag+maxLag];
   bgSum+=c;bgSq+=c*c;bgN++;
  }
  const bgMean=bgN?bgSum/bgN:0;
  const bgStd=bgN?Math.sqrt(Math.max(1e-8,bgSq/bgN-bgMean*bgMean)):1;
  const zScore=(bestCorr-bgMean)/bgStd;
  const offsetSec=Number((bestLag*0.01).toFixed(2));
  if(bestCorr>=0.16&&zScore>=2.45&&Math.abs(offsetSec)>=0.12){
   return offsetSec;
  }
  return 0;
 }
 function scheduleAutoCaptionSync(entry,cues,expectedIndex){
  if(autoSyncAbort){try{autoSyncAbort.abort()}catch{}autoSyncAbort=null}
  captionAutoOffset=0;
  if(!entry||!Array.isArray(cues)||cues.length<25||navigator.connection?.saveData)return;
  if(data.type==='video/mp4'||/\.mp4(?:\?|$)/i.test(data.src||''))return;
  // Native MegaPlay Sub / native [CC] tracks come from the exact same HLS bundle at 0.00s
  const isNativeMega=isAnime&&(options.lang==='sub'||/\[cc\]/i.test(entry.label||''))&&/[?&]p=megaplay(?:&|$)/.test(data.src||'')&&/[?&]p=megaplay(?:&|$)/.test(entry.src||'')&&!/[?&]o=/.test(entry.src||'');
  if(isNativeMega)return;

  const activeTracks=Array.from(player.audioTracks?.()||[]);
  const activeAudioSig=activeTracks.find(t=>t.enabled)?.label||'0';
  const cacheKey=`${data.src}||${entry.src}||${activeAudioSig}`;
  if(autoSyncCache.has(cacheKey)){
   captionAutoOffset=autoSyncCache.get(cacheKey)||0;
   lastRenderedCaptionSig='';
   renderCaptions();
   return;
  }
  const ctrl=new AbortController();
  autoSyncAbort=ctrl;
  const launchSync=()=>{
   if(disposed||ctrl.signal.aborted||selectedTrackKey!==expectedIndex)return;
   computeAudioSubtitleOffsetSec(data.src,cues,ctrl.signal)
    .then(offset=>{
     if(disposed||ctrl.signal.aborted)return;
     autoSyncCache.set(cacheKey,offset);
     if(selectedTrackKey===expectedIndex){
      captionAutoOffset=offset;
      lastRenderedCaptionSig='';
      renderCaptions();
     }
    })
    .catch(()=>{});
  };
  if(player.readyState()>=2){
   setTimeout(launchSync,180);
  }else{
   let started=false;
   const onceReady=()=>{if(started)return;started=true;setTimeout(launchSync,250)};
   player.one('canplay',onceReady);
   setTimeout(onceReady,1800);
  }
 }
 function paintCaptionLines(lines){
  const sig=lines.join('\n||\n');
  if(sig===lastRenderedCaptionSig)return;
  lastRenderedCaptionSig=sig;
  // Update the existing cue nodes in place so a one-line change never tears
  // down and rebuilds the caption block (that rebuild is what made the last
  // line jump and blink between updates).
  const rows=captionsEl.children;
  for(let i=0;i<lines.length;i++){
   let line=rows[i];
   if(!line){
    line=document.createElement('div');
    line.className='mp-caption-cue';
    const span=document.createElement('span');
    span.className='mp-caption-text';
    line.appendChild(span);
    captionsEl.appendChild(line);
   }
   let span=line.firstElementChild;
   if(!span||span.className!=='mp-caption-text'){
    span=document.createElement('span');span.className='mp-caption-text';line.textContent='';line.appendChild(span);
   }
   if(span.textContent!==lines[i]){
    // Swap the string only. No opacity/transform is ever applied to a line, so a
    // word change can never look like a dissolve or a jump.
    span.textContent=lines[i];
   }
  }
  for(let i=rows.length-1;i>=lines.length;i--)rows[i].remove();
 }
 let lastCaptionHold={sig:'',until:0};
 function captionLinesNow(){
  if(selectedTrackKey<0)return [];
  if(Array.isArray(activeParsedCues)){
   const rawMediaEl=host.querySelector('video.vjs-tech')||host.querySelector('video');
   const nowSec=(Number(rawMediaEl?.currentTime??player.currentTime())||0)-captionAutoOffset-captionSyncOffset;
   const lines=[],seen=new Set();
   let lo=0,hi=activeParsedCues.length-1,startIdx=0;
   while(lo<=hi){const mid=(lo+hi)>>1;if(activeParsedCues[mid].start<=nowSec){startIdx=mid;lo=mid+1}else hi=mid-1}
   for(let i=Math.max(0,startIdx-8);i<activeParsedCues.length;i++){
    const c=activeParsedCues[i];
    if(c.start>nowSec+0.02)break;
    if(nowSec>=c.start&&nowSec<=c.end&&c.text&&!seen.has(c.text)){seen.add(c.text);lines.push(c.text)}
   }
   return lines;
  }
  if(!activeTrack?.activeCues?.length)return [];
  const seen=new Set(),lines=[];
  for(let i=0;i<activeTrack.activeCues.length;i++){
   const text=String(activeTrack.activeCues[i].text||'').replace(/<[^>]+>/g,'').replace(/\{\\[^}]+\}/g,'').trim();
   if(!text||seen.has(text))continue;
   seen.add(text);lines.push(text);
  }
  return lines;
 }
 function nextCueStartsWithin(seconds){
  // True only when another cue of the same track follows the current one almost
  // immediately; a real pause between lines must still clear the caption.
  if(!Array.isArray(activeParsedCues))return false;
  const rawMediaEl=host.querySelector('video.vjs-tech')||host.querySelector('video');
  const nowSec=(Number(rawMediaEl?.currentTime??player.currentTime())||0)-captionAutoOffset-captionSyncOffset;
  for(let i=0;i<activeParsedCues.length;i++){
   const c=activeParsedCues[i];
   if(c.start<=nowSec)continue;
   return c.start-nowSec<=seconds;
  }
  return false;
 }
 function renderCaptions(){
  if(selectedTrackKey<0){paintCaptionLines([]);lastCaptionHold={sig:'',until:0};return}
  const lines=captionLinesNow();
  const sig=lines.join('\n||\n');
  const nowMs=Date.now();
  // Bridge only tiny gaps between adjacent cues, so a final line never flickers
  // off between two cues while a real pause still clears the caption.
  // 33 ms polling can land in the sliver between two cues. Never paint an empty
  // frame when the next cue is imminent; the previous line stays up for one tick.
  if(!sig&&lastCaptionHold.sig&&nextCueStartsWithin(0.8))return;
  if(sig){
   lastCaptionHold={sig,until:nowMs+140};
   paintCaptionLines(lines);
   return;
  }
  // One poll tick of grace, never more: a finished cue must clear promptly.
  if(lastCaptionHold.sig&&nowMs<lastCaptionHold.until)return;
  lastCaptionHold={sig:'',until:0};
  paintCaptionLines([]);
 }
 function bindActiveTrack(track){
  if(activeTrack&&captionCueHandler)activeTrack.removeEventListener('cuechange',captionCueHandler);
  activeTrack=track||null;
  if(activeTrack){
   activeTrack.mode='showing';
   captionCueHandler=()=>renderCaptions();
   activeTrack.addEventListener('cuechange',captionCueHandler);
  }
  renderCaptions();
 }
 async function loadDirectRemoteCues(entry,expectedIndex){
  if(Array.isArray(entry.parsedCues)){
   if(selectedTrackKey===expectedIndex&&combinedTracks()[expectedIndex]?.entry===entry){
    activeParsedCues=entry.parsedCues;
    scheduleAutoCaptionSync(entry,entry.parsedCues,expectedIndex);
    renderCaptions();
   }
   return;
  }
  if(!entry.loadingPromise){
   entry.loadingPromise=fetch(entry.src,{signal:AbortSignal.timeout(9000)})
    .then(r=>r.ok?r.text():'')
    .then(txt=>parseWebVttCues(txt))
    .catch(()=>[]);
  }
  const cues=await entry.loadingPromise;
  if(cues.length)entry.parsedCues=cues;
  else entry.loadingPromise=null;
  if(!disposed&&selectedTrackKey===expectedIndex&&combinedTracks()[expectedIndex]?.entry===entry){
   activeParsedCues=cues;
   scheduleAutoCaptionSync(entry,cues,expectedIndex);
   renderCaptions();
  }
 }
 function selectSubtitle(index,persist=true){
  disableAllNativeTracks();
  let items=combinedTracks(),chosen=index>=0?items[index]:null;
  if(aiActive&&chosen?.kind!=='ai')cancelAi();
  aiActive=chosen?.kind==='ai';aiRoman=Boolean(chosen?.roman);aiTrackLanguage=aiActive?(chosen.aiLanguage||chosen.language||''):'';
  selectedTrackKey=chosen?index:-1;
  activeParsedCues=null;
  captionAutoOffset=0;
  if(autoSyncAbort){try{autoSyncAbort.abort()}catch{}autoSyncAbort=null}
  lastRenderedCaptionSig='';
  if(!chosen){
   bindActiveTrack(null);
   if(persist)writeJSON(subPrefKey,{enabled:false});
  }else{
   if(persist)writeJSON(subPrefKey,{enabled:true,language:String(chosen.language||'').toLowerCase(),label:String(chosen.label||'').toLowerCase()});
   if(chosen.kind==='ai'){
    bindActiveTrack(null);refreshAiCues();pumpAi();
   }else if(chosen.kind==='manual'){
    bindActiveTrack(chosen.track);
   }else if(chosen.kind==='remote'){
    bindActiveTrack(null);
    loadDirectRemoteCues(chosen.entry,index);
   }
  }
  let on=selectedTrackKey>=0;
  ccButton.innerHTML=on?icons.ccOn:icons.ccOff;
  ccButton.classList.toggle('on',on);
  let tab=$('[data-tab="cc"]');if(tab)tab.innerHTML=on?icons.ccOn:icons.ccOff;
  renderTracks();
 }
 function pickDefaultEnglishTrackIndex(items){
  // Anime Japanese audio: the default subtitle is MegaPlay's English track.
  // AI tracks (including the optional Japanese AI caption) are only opened by
  // choosing them explicitly.
  let idx=items.findIndex(it=>it.kind!=='ai'&&(()=>{
   const l=String(it.label||'').trim().toLowerCase(),lang=String(it.language||'').trim().toLowerCase();
   return (/^english\b/.test(l)||lang==='en'||lang==='eng')&&!/signs|songs|forced/i.test(l);
  })());
  if(idx<0)idx=items.findIndex(it=>it.kind!=='ai'&&(/^en/i.test(it.language||'')||/english/i.test(it.label||'')));
  if(idx<0)idx=items.findIndex(it=>it.kind!=='ai');
  return idx;
 }
 function restoreSubtitlePreference(){
  if(subtitlePrefRestored)return;
  const items=combinedTracks();
  const pref=readJSON(subPrefKey,null);
  if(!pref){
   const englishIndex=pickDefaultEnglishTrackIndex(items);
   if(captionMode==='anime-sub'&&englishIndex>=0){
    subtitlePrefRestored=true;
    selectSubtitle(englishIndex,false);
   }
   return;
  }
  if(!pref.enabled){subtitlePrefRestored=true;return}
  if(!items.length)return;
  const wantLabel=String(pref.label||'').trim().toLowerCase();
  const wantLang=String(pref.language||'').trim().toLowerCase();
  let idx=items.findIndex(it=>wantLabel&&it.label.trim().toLowerCase()===wantLabel);
  if(idx<0&&wantLabel)idx=items.findIndex(it=>{let l=it.label.trim().toLowerCase();return l.startsWith(wantLabel.split(/[\s(-]/)[0])||wantLabel.startsWith(l.split(/[\s(-]/)[0])});
  if(idx<0&&wantLang)idx=items.findIndex(it=>String(it.language||'').toLowerCase().startsWith(wantLang.slice(0,2)));
  if(idx<0)idx=0;
  if(idx>=0){
   subtitlePrefRestored=true;
   selectSubtitle(idx,false);
  }
 }
 function renderTracks(){
  let items=combinedTracks(),list=$('.mp-track-list');
  list.innerHTML=`<button type="button" class="mp-list-row ${selectedTrackKey<0?'selected':''}" data-track="-1"><span>Off</span></button>`+items.map((item,i)=>`<button type="button" class="mp-list-row ${selectedTrackKey===i?'selected':''}" data-track="${i}"><span>${esc(item.label)}</span></button>`).join('');
 }

 // Quality Controls: Genuine multi-tier resolution detection (4K, 2K, Full HD, HD, SD) + instant switching for both HLS & qualityStreams
 function qualityLevels(){return player.qualityLevels?.()||null}
 function vhsRepresentations(){
  try{return player.tech({IWillNotUseThisInPlugins:true})?.vhs?.representations?.()||[]}catch{return []}
 }
 function availableQualityTiers(){
  const tiers=new Set();
  if(qualityStreams.length){
   for(const qs of qualityStreams)if(qs.tier>0)tiers.add(qs.tier);
  }
  const levels=qualityLevels();
  if(levels?.length){
   for(let i=0;i<levels.length;i++){
    const t=classifyQualityTier(levels[i].width,levels[i].height);
    if(t>0)tiers.add(t);
   }
  }
  if(!tiers.size){
   const reps=vhsRepresentations();
   for(const rep of reps){
    const t=classifyQualityTier(rep.width,rep.height);
    if(t>0)tiers.add(t);
   }
  }
  if(!tiers.size){
   const mediaEl=host.querySelector('video.vjs-tech');
   const liveTier=classifyQualityTier(mediaEl?.videoWidth,mediaEl?.videoHeight);
   if(liveTier>0)tiers.add(liveTier);
  }
  return [...tiers].sort((a,b)=>b-a);
 }
 function currentPlayingTier(){
  const mediaEl=host.querySelector('video.vjs-tech');
  const live=classifyQualityTier(mediaEl?.videoWidth,mediaEl?.videoHeight);
  if(live>0)return live;
  if(qualityStreams.length&&activeQualityStreamTier>0)return activeQualityStreamTier;
  const levels=qualityLevels();
  if(levels?.length&&levels.selectedIndex>=0){
   const sel=levels[levels.selectedIndex];
   if(sel)return classifyQualityTier(sel.width,sel.height);
  }
  return 0;
 }
 let sourceSwitching=false,cancelActiveSwitch=null,noticeTimer=null;
 function notify(message,persistent=false){
  const box=$('.mp-notice');if(!box)return;
  clearTimeout(noticeTimer);box.textContent=message||'';box.hidden=!message;
  if(message&&!persistent)noticeTimer=setTimeout(()=>{if(!disposed)box.hidden=true},4200);
 }
 function switchMediaSource(payload,{nextLang='',preserveTracks=false,onCommit=null}={}){
  if(disposed||!payload?.src)return Promise.resolve(false);
  if(sourceSwitching)return Promise.resolve(false);
  const old={src:data.src,type:data.type||'application/x-mpegURL',time:Number(player.currentTime())||0,paused:player.paused(),rate:Number(player.playbackRate())||1,sub:selectedTrackKey};
  const nextType=payload.type||(/\.mp4(?:\?|$)/i.test(payload.src)&&!/\.m3u8/i.test(payload.src)?'video/mp4':old.type);
  const commit=()=>{
   let sub=preserveTracks?old.sub:replaceRemoteCatalog(payload.tracks||[],old.sub);
   data.src=payload.src;data.type=nextType;
   for(const k of ['intro','outro','allowSub','allowDub','audioLang','audioLabel','sourceKey','server','provider'])if(payload[k]!==undefined)data[k]=payload[k];
   if(payload.sourceKey)options.server=payload.sourceKey;
   try{options.onSourceCommit?.(payload)}catch{}
   if(Object.prototype.hasOwnProperty.call(payload,'qualityStreams')){
    qualityStreams=collectQualityStreams(payload.qualityStreams);data.qualityStreams=payload.qualityStreams;
    const q=qualityStreams.find(q=>q.src===payload.src);activeQualityStreamTier=q?.tier||0;
   }
   if(Array.isArray(payload.regionalStreams))animeRegionalStreams=payload.regionalStreams.filter(a=>a?.src&&a?.key&&(hevcSupported||a.codec!=='hevc'));
   if(nextLang)options.lang=nextLang;
   const nextCaptionMode=isAnime&&options.lang==='sub'?'anime-sub':'ott';
   if(nextCaptionMode!==captionMode){
    captionMode=nextCaptionMode;subPrefKey=`kozutv-sub-pref-${captionMode}`;host.dataset.captionMode=captionMode;
    captionStyle=loadCaptionStyle(captionMode);applyCaptionStyle();
    // The previous audio's subtitle pick must not leak into the new mode.
    selectedTrackKey=-1;subtitlePrefRestored=false;lastCaptionAudioSignature='';
   }
   try{onCommit?.()}catch{}
   if(old.rate!==1)try{player.playbackRate(old.rate)}catch{}
   const dur=Number(player.duration())||0;
   if(old.time>0&&(!dur||old.time<dur-5))try{player.currentTime(old.time)}catch{}
   if(sub>=0){const tracks=combinedTracks();if(tracks[sub]?.entry)tracks[sub].entry.loadedTrack=null}
   refreshCaptionContext(true);
   cachedLowSrc=null;lowSrcPromise=null;disposePreviewPlayer();frameCache.clear();
   renderQuality();renderAudio();updateLoading();
   if(old.paused)player.pause();else player.play().catch(()=>{});
  };
  if(payload.src===old.src){commit();return Promise.resolve(true)}
  sourceSwitching=true;ui.dataset.loading='true';notify('');
  return new Promise(resolve=>{
   let timer=null,done=false,phase='switch';
   const cleanup=()=>{clearTimeout(timer);player.off('loadedmetadata',onLoaded);player.off('error',onError)};
   const finish=ok=>{if(done)return;done=true;cleanup();sourceSwitching=false;cancelActiveSwitch=null;if(!disposed){notify('');updateLoading()}resolve(ok)};
   const onLoaded=()=>{
    if(done||disposed)return finish(false);
    if(phase==='rollback'){
     if(old.rate!==1)try{player.playbackRate(old.rate)}catch{}
     const dur=Number(player.duration())||0;if(old.time>0&&(!dur||old.time<dur-5))try{player.currentTime(old.time)}catch{}
     if(old.sub>=0){const tracks=combinedTracks();if(tracks[old.sub]?.entry)tracks[old.sub].entry.loadedTrack=null;selectSubtitle(old.sub,false)}
     if(old.paused)player.pause();else player.play().catch(()=>{});
     return finish(false);
    }
    try{commit();finish(true)}catch{rollback()}
   };
   const onError=()=>{if(phase==='rollback'){cleanup();sourceSwitching=false;cancelActiveSwitch=null;done=true;if(!disposed)notify('The previous source could not be restored. Please retry.');return resolve(false)}rollback()};
   const rollback=()=>{
    if(done)return;cleanup();phase='rollback';try{player.error(null)}catch{}
    player.on('loadedmetadata',onLoaded);player.on('error',onError);
    timer=setTimeout(()=>{if(done)return;cleanup();sourceSwitching=false;cancelActiveSwitch=null;done=true;if(!disposed)notify('The previous source did not reload. Please retry.');resolve(false)},12000);
    try{player.src({src:old.src,type:old.type})}catch{onError()}
   };
   cancelActiveSwitch=()=>{if(done)return;done=true;cleanup();sourceSwitching=false;cancelActiveSwitch=null;resolve(false)};
   player.on('loadedmetadata',onLoaded);player.on('error',onError);
   timer=setTimeout(rollback,15000);
   try{player.error(null);player.src({src:payload.src,type:nextType})}catch{rollback()}
  });
 }
 function switchDirectQualityStream(targetValue){
  if(qualityStreams.length<2)return null;
  let chosen=qualityStreams[0];
  if(targetValue!=='auto'){
   const want=Number(targetValue)||1080,exact=qualityStreams.find(q=>q.tier===want),le=qualityStreams.filter(q=>q.tier<=want);
   chosen=exact||(le.length?le[0]:qualityStreams[qualityStreams.length-1]);
  }
  if(chosen.src===data.src){activeQualityStreamTier=chosen.tier;return Promise.resolve(true)}
  const stillQuality=qualityStreams;
  return switchMediaSource({...chosen,qualityStreams:stillQuality},{preserveTracks:true,onCommit:()=>{activeQualityStreamTier=chosen.tier}});
 }
 function applyQualityToVhs(value,flushBuffer=false){
  if(sourceSwitching)return;
  if(qualityStreams.length>1){
   const levels=qualityLevels();
   let distinctHls=0;
   if(levels?.length){
    const s=new Set();
    for(let i=0;i<levels.length;i++){const t=classifyQualityTier(levels[i].width,levels[i].height);if(t>0)s.add(t)}
    distinctHls=s.size;
   }
   if(distinctHls<2){const switching=switchDirectQualityStream(value);if(switching)return switching}
  }
  const levels=qualityLevels();
  const vhs=player.tech({IWillNotUseThisInPlugins:true})?.vhs;
  const reps=vhsRepresentations();
  if((!levels||!levels.length)&&!reps.length)return;
  const nudgeBuffer=()=>{
   if(!flushBuffer||disposed)return;
   setTimeout(()=>{
    if(disposed)return;
    const t=Number(player.currentTime())||0;
    const dur=Number(player.duration())||0;
    if(Number.isFinite(dur)&&dur>1&&t>=0){
     try{player.currentTime(Math.min(dur-0.25,Math.max(0,t+0.01)))}catch{}
    }
   },140);
  };
  if(value==='auto'){
   if(levels?.length)for(let i=0;i<levels.length;i++)levels[i].enabled=true;
   for(const rep of reps){try{rep.enabled(true)}catch{}}
   if(vhs?.options_){vhs.options_.goalBufferLength=30;vhs.options_.maxGoalBufferLength=60}
   try{vhs?.playlistController_?.fastQualityChange_?.()}catch{}
   nudgeBuffer();
   return;
  }
  const target=Number(value)||1080;
  const detectedTiers=[];
  if(levels?.length){
   for(let i=0;i<levels.length;i++){
    const t=classifyQualityTier(levels[i].width,levels[i].height);
    if(t>0&&!detectedTiers.includes(t))detectedTiers.push(t);
   }
  }
  if(!detectedTiers.length&&reps.length){
   for(const rep of reps){
    const t=classifyQualityTier(rep.width,rep.height);
    if(t>0&&!detectedTiers.includes(t))detectedTiers.push(t);
   }
  }
  if(detectedTiers.length){
   const exact=detectedTiers.includes(target)?target:null;
   const le=detectedTiers.filter(t=>t<=target);
   const chosenTier=exact||(le.length?Math.max(...le):Math.min(...detectedTiers));
   if(levels?.length){
    for(let i=0;i<levels.length;i++){
     const t=classifyQualityTier(levels[i].width,levels[i].height);
     levels[i].enabled=(t===chosenTier);
    }
   }
   for(const rep of reps){
    const t=classifyQualityTier(rep.width,rep.height);
    if(t>0){try{rep.enabled(t===chosenTier)}catch{}}
   }
  }else if(levels?.length>1){
   const sorted=[...Array(levels.length).keys()].sort((a,b)=>(levels[b].bandwidth||0)-(levels[a].bandwidth||0));
   const rank=target>=1080?0:target>=720?Math.min(1,sorted.length-1):target>=480?Math.min(2,sorted.length-1):sorted.length-1;
   const chosenIdx=sorted[rank];
   for(let i=0;i<levels.length;i++)levels[i].enabled=(i===chosenIdx);
  }
  if(vhs?.options_){
   vhs.options_.goalBufferLength=30;
   vhs.options_.maxGoalBufferLength=60;
  }
  try{vhs?.playlistController_?.fastQualityChange_?.()}catch{}
  nudgeBuffer();
 }
 function selectQuality(value,persist=true){
  if(sourceSwitching)return;
  const previous=currentQuality;
  currentQuality=String(value||'auto');
  const result=applyQualityToVhs(currentQuality,Boolean(persist));
  renderQuality();
  const complete=ok=>{
   if(disposed)return;
   if(!ok)currentQuality=previous;
   else if(persist){try{storePreference('kozutv-quality',currentQuality)}catch{}}
   renderQuality();
  };
  if(result&&typeof result.then==='function')result.then(complete,()=>complete(false));
  else complete(true);
 }
 function renderQuality(){
  const tiers=availableQualityTiers(),list=$('.mp-quality-list');
  const activeTier=currentPlayingTier();
  const autoTag=activeTier?`<span class="mp-quality-tag">${esc(formatQualityOption(activeTier).name)}</span>`:'';
  const rows=tiers.map(tier=>{
   const meta=formatQualityOption(tier);
   const isSelected=currentQuality===String(tier);
   return `<button type="button" class="mp-list-row ${isSelected?'selected':''}" data-quality="${tier}"><span>${esc(meta.name)}</span><span class="mp-quality-tag">${esc(meta.tag)}</span></button>`;
  }).join('');
  list.innerHTML=`<button type="button" class="mp-list-row ${currentQuality==='auto'?'selected':''}" data-quality="auto"><span>Auto</span>${autoTag}</button>`+rows;
  const serverSection=$('.mp-server-section'),serverList=$('.mp-server-list');
  serverSection.hidden=isAnime;
  if(!isAnime){
   let currentServer=options.server||'vidcore';
   const availableServers=isAnime?[['megaplay','MegaPlay']]:servers;
   serverList.innerHTML=availableServers.map(([key,name])=>`<button type="button" class="mp-list-row ${currentServer===key?'selected':''}" data-server-choice="${key}"><span>${esc(name)}</span></button>`).join('');
  }
 }

 function persistAudioChoice(chosen,index){
  const language=audioLanguage(chosen,index),label=formatAudioLabel(chosen.label,chosen.language,index).toLowerCase();
  writeJSON('kozutv-audio-pref',{language:String(chosen.language||'').toLowerCase(),label});
  // Preserve the old per-player setting when the track is not represented by
  // the new selector; otherwise the two controls describe the same preference.
  if(AUDIO_SETTING_CODES.has(language))storePreference('kozutv-ott-audio',language);
  else removePreference('kozutv-ott-audio');
 }
 function switchMultiAudioStream(selectedIndex,persist=true){
  const chosen=multiAudioStreams[selectedIndex];if(!chosen)return Promise.resolve(false);
  if(persist)persistAudioChoice(chosen,selectedIndex);
  if(selectedIndex===activeAudioStreamIndex&&data.src===chosen.src){renderAudio();return Promise.resolve(true)}
  const payload={...chosen,audioLang:chosen.language||'',audioLabel:chosen.label||'',tracks:chosen.tracks||[],qualityStreams:[]};
  return switchMediaSource(payload,{onCommit:()=>{activeAudioStreamIndex=selectedIndex}});
 }
 function switchHlsAudioTrack(selectedIndex,persist=true){
  let tracks=Array.from(player.audioTracks?.()||[]);
  let chosen=tracks[selectedIndex];
  if(!chosen)return;
  if(persist)persistAudioChoice(chosen,selectedIndex);
  if(!chosen.enabled){
   let anchorTime=Number(player.currentTime())||0,wasPaused=player.paused(),switchedAt=Date.now();
   tracks.forEach((item,index)=>{item.enabled=index===selectedIndex});
   refreshCaptionContext();
   if(anchorTime>0){
    let done=false;
    const syncAudioPosition=()=>{if(disposed||done)return;let elapsed=wasPaused?0:Math.min(1.5,Math.max(0,(Date.now()-switchedAt)/1000)),expected=anchorTime+elapsed;if(Math.abs((Number(player.currentTime())||0)-expected)>1.2){try{player.currentTime(anchorTime)}catch{}}};
    const onSwitchCanplay=()=>{syncAudioPosition();cleanup();if(!wasPaused)player.play().catch(()=>{})};
    const cleanup=()=>{if(done)return;done=true;clearTimeout(disarmTimer);clearTimeout(checkTimer);player.off('canplay',onSwitchCanplay)};
    const disarmTimer=setTimeout(cleanup,2500);
    const checkTimer=setTimeout(()=>{if(disposed||player.isDisposed?.()||!player.tech_)return;syncAudioPosition();if(!player.seeking()&&player.readyState()>=3)cleanup()},400);
    player.on('canplay',onSwitchCanplay);
    try{player.currentTime(anchorTime);updateLoading()}catch{}
   }
   if(selectedTrackKey>=0&&Array.isArray(activeParsedCues)){
    const items=combinedTracks();
    if(items[selectedTrackKey]?.entry)scheduleAutoCaptionSync(items[selectedTrackKey].entry,activeParsedCues,selectedTrackKey);
   }
  }
  renderAudio();
 }
 function readOttAudioPreference(){
  let setting=null;try{setting=localStorage.getItem('kozutv-ott-audio')}catch{}
  if(setting!==null)return setting==='auto'?null:{language:String(setting).toLowerCase(),label:''};
  // Existing installs retain their earlier player preference until Settings
  // explicitly chooses the new selector (including Original / default).
  const legacy=readJSON('kozutv-audio-pref',null);
  return legacy?{language:audioLanguage(legacy),label:String(legacy.label||'').toLowerCase()}:null;
 }
 function rankedAudioIndices(list,pref){
  if(!pref)return [];
  const found=[],add=i=>{if(i>=0&&!found.includes(i))found.push(i)};
  if(pref.label)list.forEach((entry,i)=>{if(formatAudioLabel(entry.label,entry.language,i).toLowerCase()===pref.label)add(i)});
  // Try the wanted language, then the original language of the title. Never
  // silently substitute English: a viewer who picked Hindi got English audio
  // because of that fallback, which is worse than respecting the default track.
  const wanted=[pref.language].filter(Boolean);
  for(const lang of wanted)list.forEach((entry,i)=>{if(audioLanguage(entry,i)===lang)add(i)});
  if(!found.length){
   const original=String(item?.originalLanguage||'').slice(0,2).toLowerCase();
   if(original)list.forEach((entry,i)=>{if(audioLanguage(entry,i)===original)add(i)});
  }
  return found;
 }
 // Last resort, used only when a track that exists cannot actually play (a dead
 // URL, an unsupported codec). Order mirrors the old behaviour: English, then
 // the original language, then the rest.
 function fallbackAudioIndices(list,skip){
  const out=[],add=i=>{if(i>=0&&!skip.includes(i)&&!out.includes(i))out.push(i)};
  list.forEach((entry,i)=>{if(audioLanguage(entry,i)==='en')add(i)});
  list.forEach((entry,i)=>{if(audioLanguage(entry,i)==='ja')add(i)});
  list.forEach((_,i)=>add(i));
  return out;
 }
 async function tryMultiAudioChoice(index){
  const chosen=multiAudioStreams[index];if(!chosen||sourceSwitching)return;
  persistAudioChoice(chosen,index);
  const ranked=[index,...rankedAudioIndices(multiAudioStreams,{language:audioLanguage(chosen,index),label:''})];
  for(const i of [...new Set(ranked)]){
   if(disposed)return;
   if(await switchMultiAudioStream(i,false))return;
  }
 }
 let audioPrefTimer=null;
 function restoreAudioPreference(){
  if(isAnime||audioPrefApplied||disposed)return;
  if(sourceSwitching){clearTimeout(audioPrefTimer);audioPrefTimer=setTimeout(restoreAudioPreference,200);return}
  const pref=readOttAudioPreference();
  if(multiAudioStreams.length>1){
   audioPrefApplied=true;
   // The wanted language comes first, so a title that HAS Hindi plays Hindi
   // even when English is also offered. English is only reached when the
   // wanted language is missing from this release or its file fails.
   const ranked=rankedAudioIndices(multiAudioStreams,pref);
   const order=ranked.length?[...ranked,...fallbackAudioIndices(multiAudioStreams,ranked)]
    :fallbackAudioIndices(multiAudioStreams,[]);
   void (async()=>{for(const index of order){if(disposed)return;if(await switchMultiAudioStream(index,false))return}})();
   return;
  }
  const tracks=Array.from(player.audioTracks?.()||[]);
  if(tracks.length<2)return;
  audioPrefApplied=true;
  const ranked=rankedAudioIndices(tracks,pref);
  const order=ranked.length?ranked:fallbackAudioIndices(tracks,[]);
  const index=order[0];
  if(index!==undefined&&!tracks[index].enabled)switchHlsAudioTrack(index,false);
 }
 function setAudioDiscovery(status){if(!disposed){data.audioDiscovery=status;renderAudio()}}
 function setAnimeLangs(langs){
  if(disposed||!isAnime)return;
  const list=(Array.isArray(langs)?langs:[]).map(String).filter(Boolean);
  if(!list.length)return;
  data.availableLangs=[...new Set([...(data.availableLangs||[]),...list])];
  renderAudio();
 }
 function setAnimeRegionalStreams(streams){
  if(disposed||!isAnime)return;
  animeRegionalStreams=(Array.isArray(streams)?streams:[]).filter(a=>a?.src&&a?.key&&(hevcSupported||a.codec!=='hevc'));
  // A newly discovered language is appended, never swapped in: the menu grows
  // once and then stays stable for the rest of the episode.
  if(animeRegionalStreams.length){
   const keys=animeRegionalStreams.map(a=>a.key);
   data.availableLangs=[...new Set([...(data.availableLangs||[]),...keys])];
  }
  renderAudio();
 }
 function switchAnimeSource(nextPayload,nextLang){
  if(disposed||!isAnime||!nextPayload?.src)return Promise.resolve(false);
  const actual=nextPayload.activeLang||nextPayload.key||nextLang;
  if(actual!==nextLang)return Promise.resolve(false);
  return switchMediaSource({...nextPayload,tracks:nextPayload.tracks||[],qualityStreams:nextPayload.qualityStreams||[]},{nextLang});
 }
 function renderAudio(){
  const list=$('.mp-audio-list');
  if(isAnime){
   let currentLang=options.lang||'sub';
   let choices=[];
   // Only what this release actually carries is offered. The menu used to list
   // a language, then fail when it was picked; now the stream itself declares
   // its languages, so the list is the truth and nothing is hidden behind a
   // failed request. A language that arrives after this paint (a late regional
   // probe) re-renders the list, so an option never disappears unannounced.
   const declared=Array.isArray(data.availableLangs)&&data.availableLangs.length
    ? data.availableLangs.map(String)
    : null;
   const regionalLabel={hi:'Hindi',ta:'Tamil',te:'Telugu',ml:'Malayalam',kn:'Kannada',bn:'Bengali',mr:'Marathi',pa:'Punjabi',gu:'Gujarati',ur:'Urdu',zh:'Chinese',yue:'Cantonese'};
   const labelFor=key=>{
    if(key==='sub')return captionLanguageName(String(item.originalLanguage||'ja').slice(0,2));
    if(key==='dub')return 'English';
    const stream=animeRegionalStreams.find(a=>a.key===key);
    return stream?.label||regionalLabel[key]||captionLanguageName(key);
   };
   if(declared){
    // The stream itself said what it carries; every one of those plays, so
    // every one is listed - and nothing else is.
    for(const key of declared){if(!choices.some(([k])=>k===key))choices.push([key,labelFor(key)])}
   }else{
    const canSub=currentLang==='sub'||(item.sub!==false&&data.allowSub!==false);
    const canDub=currentLang==='dub'||(item.dub!==false&&data.allowDub!==false);
    if(canSub)choices.push(['sub',labelFor('sub')]);
    if(canDub)choices.push(['dub',labelFor('dub')]);
    for(const r of animeRegionalStreams){
     if(r?.key&&!choices.some(([k])=>k===r.key))choices.push([r.key,r.label||r.key.toUpperCase()]);
    }
   }
   // A language discovered after this paint joins the list rather than being
   // dropped: the menu only ever grows during one episode.
   for(const r of animeRegionalStreams){
    if(r?.key&&!choices.some(([k])=>k===r.key))choices.push([r.key,labelFor(r.key)]);
   }
   // The track that is playing is always listed, even if a late-arriving list
   // has not caught up yet.
   if(!choices.some(([key])=>key===currentLang)){const labels={hi:'Hindi',ta:'Tamil',te:'Telugu',ml:'Malayalam',kn:'Kannada',bn:'Bengali'};choices.push([currentLang,labels[currentLang]||currentLang.toUpperCase()])}

   const sourceRows=choices.map(([key,label])=>`<button type="button" class="mp-list-row ${currentLang===key?'selected':''}" data-audio-choice="${esc(key)}"><span>${esc(label)}</span></button>`).join('');
   const tracks=Array.from(player.audioTracks?.()||[]);
   list.innerHTML=tracks.length>1
    ?'<div class="mp-audio-group">Audio source</div>'+sourceRows+'<div class="mp-audio-group">Audio track</div>'+tracks.map((track,i)=>`<button type="button" class="mp-list-row ${track.enabled?'selected':''}" data-audio-track="${i}"><span>${esc(formatAudioLabel(track.label,track.language,i))}</span></button>`).join('')
    :sourceRows;
   return;
  }
  let tracks=Array.from(player.audioTracks?.()||[]);
  const nativeRows=()=>{
   const labels=tracks.map((t,i)=>formatAudioLabel(t.label,t.language,i));
   const totals=new Map(),counts=new Map();for(const label of labels)totals.set(label,(totals.get(label)||0)+1);
   return tracks.map((track,i)=>{const label=labels[i],n=(counts.get(label)||0)+1;counts.set(label,n);
    return `<button type="button" class="mp-list-row ${track.enabled?'selected':''}" data-audio-track="${i}"><span>${esc(label)}${totals.get(label)>1?` (${n})`:''}</span></button>`}).join('');
  };
  if(multiAudioStreams.length>1){
   const sourceRows=multiAudioStreams.map((stream,i)=>`<button type="button" class="mp-list-row ${activeAudioStreamIndex===i?'selected':''}" data-audio-stream="${i}"><span>${esc(formatAudioLabel(stream.label,stream.language,i))}</span></button>`).join('');
   // Separate source streams and embedded renditions are both real options;
   // previously the source menu hid every native HLS track.
   list.innerHTML=tracks.length>1?'<div class="mp-audio-group">Audio source</div>'+sourceRows+'<div class="mp-audio-group">Audio track in current source</div>'+nativeRows():sourceRows;
   return;
  }
  if(tracks.length>1){
   list.innerHTML=nativeRows();
  }else{
   const track=tracks[0]||null,one=multiAudioStreams.find(a=>a.src===data.src)||null;
   let label=String(track?.label||'').trim(),language=String(track?.language||'').trim();
   if(!label||genericAudioLabel(label))label=one?.label||data.audioLabel||'';
   if(!language||/^(und|unk|unknown)$/i.test(language))language=one?.language||data.audioLang||'';
   const display=formatAudioLabel(label,language,0);
   list.innerHTML=`<div class="mp-list-row selected"><span>${esc(display)}</span></div>`;
  }
 }

 function renderPlaybackSettings(){
  let rate=Number(player.playbackRate()||1),rates=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
  $('.mp-speed-list').innerHTML=rates.map(v=>`<button type="button" class="mp-list-row ${Math.abs(rate-v)<.01?'selected':''}" data-rate="${v}"><span>${v}x</span></button>`).join('');
 }

 function openSettings(tab='cc'){
  settings.hidden=false;
  ui.dataset.settingsOpen='true';
  showPanel(tab);
  renderTracks();renderAudio();renderQuality();renderPlaybackSettings();
  ui.dataset.active='true';clearTimeout(hideTimer);
 }
 function closeSettings(){
  settings.hidden=true;
  ui.dataset.settingsOpen='false';
  ui.dataset.subpanel='';
  showControls();
 }
 function showPanel(name){
  ui.dataset.subpanel=name==='caption-style'?'caption-style':'';
  for(let tab of $$('.mp-tab'))tab.classList.toggle('active',tab.dataset.tab===(name==='caption-style'?'cc':name));
  for(let panel of $$('[data-panel]'))panel.hidden=panel.dataset.panel!==name;
 }

 function updateLoading(){
  if(disposed||player.isDisposed?.()||!player.tech_)return;
  let preStart=!player.hasStarted()&&ui.dataset.autoplay==='true';
  let isSeeking=Boolean(player.seeking());
  let isBuffering=Boolean(resyncing||(!player.error()&&(player.hasClass('vjs-waiting')||(isSeeking&&player.readyState()<3)||(!player.paused()&&player.hasStarted()&&player.readyState()<2))));
  ui.dataset.seeking=String(isSeeking);
  if(preStart||resyncing){
   clearTimeout(loaderTimer);loaderTimer=null;
   ui.dataset.loading='true';
  }else if(isBuffering){
   if(ui.dataset.loading!=='true'&&!loaderTimer){
    loaderTimer=setTimeout(()=>{loaderTimer=null;updateLoading()},140);
   }
  }else{
   clearTimeout(loaderTimer);loaderTimer=null;
   ui.dataset.loading='false';
  }
 }
 function updatePlay(){
  if(disposed||player.isDisposed?.()||!player.tech_)return;
  if(player.hasStarted())ui.dataset.autoplay='false';
  if(resyncing){updateLoading();return}
  let paused=player.paused();
  ui.dataset.paused=String(paused);
  updateLoading();
  playButton.innerHTML=paused?icons.play:icons.pause;
  playButton.setAttribute('aria-label',paused?'Play':'Pause');
  centerPlay.innerHTML=icons.play;
  centerPlay.setAttribute('aria-label',player.currentTime()>0?'Resume':'Play');
 }
 function toggleMasterMute(){
  const nextMuted=!player.muted();
  try{
   player.muted(nextMuted);
   if(!nextMuted)player.volume(1);
  }catch{}
  try{
   storePreference('kozutv-muted',String(nextMuted));
   removePreference('kozutv-volume');
  }catch{}
  updateVolume();
 }
 function updateVolume(){
  const muted=Boolean(player.muted());
  muteButton.innerHTML=muted?icons.mute:icons.volume;
  muteButton.setAttribute('aria-label',muted?'Unmute':'Mute');
 }
 function placeMarker(el,range,duration){
  let start=Number(range?.start),end=Number(range?.end);
  if(!(duration>0&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&start<duration)){el.hidden=true;return}
  let left=Math.max(0,Math.min(100,start/duration*100)),right=Math.max(left,Math.min(100,end/duration*100));
  el.style.left=`${left}%`;el.style.width=`${Math.max(.6,right-left)}%`;el.hidden=false;
 }
 function updateSkip(){
  let current=player.currentTime()||0,intro=data.intro,outro=data.outro;
  skipIntro.hidden=!(Number(intro?.end)>Number(intro?.start)&&current>=Number(intro.start)&&current<Number(intro.end)-.4);
  skipOutro.hidden=!(Number(outro?.end)>Number(outro?.start)&&current>=Number(outro.start)&&current<Number(outro.end)-.4);
 }
 function updateTime(){
  let duration=player.duration(),current=pendingSkipTarget!==null?pendingSkipTarget:(player.currentTime()||0);
  currentEl.textContent=formatClock(current);
  if(Number.isFinite(duration)&&duration>0){
   durationEl.textContent=formatClock(duration);
   if(ui.dataset.scrubbing!=='true'){
    let pct=Math.max(0,Math.min(100,current/duration*100));
    seekProgress.style.width=`${pct}%`;
    seekArea.style.setProperty('--mp-scrub-percent',`${pct}%`);
    seekInput.value=String(Math.round(pct*10));
   }
   let buffered=player.buffered();
   let end=buffered?.length?buffered.end(buffered.length-1):0;
   seekBuffer.style.width=`${Math.max(0,Math.min(100,end/duration*100))}%`;
   placeMarker(introMarker,data.intro,duration);
   placeMarker(outroMarker,data.outro,duration);
  }
  updateSkip();
 }

 // Fast Scrub Thumbnail Preview:
 // 1. Pre-resolves lowest-bitrate variant .m3u8 in background once main video starts playing
 // 2. Caches 160x90 frames in memory (both opportunistically from main video & from preview seeks)
 function cacheFrameAt(bucket,sourceCanvasOrVideo){
  try{
   const off=document.createElement('canvas');
   off.width=160;off.height=90;
   off.getContext('2d').drawImage(sourceCanvasOrVideo,0,0,160,90);
   if(frameCache.has(bucket))frameCache.delete(bucket);
   frameCache.set(bucket,off);
   if(frameCache.size>72)frameCache.delete(frameCache.keys().next().value);
  }catch{}
 }
 function paintPreviewCanvas(source,bucket){
  const ctx=previewCanvas.getContext('2d');
  ctx.drawImage(source,0,0,previewCanvas.width,previewCanvas.height);
  seekPreview.classList.add('has-frame');
  previewCanvas.dataset.hasFrame='true';
  if(bucket!==undefined&&!frameCache.has(bucket))cacheFrameAt(bucket,previewCanvas);
 }
 async function resolveLowestVariantSrc(masterSrc){
  try{
   const r=await fetch(masterSrc,{signal:AbortSignal.timeout(3500)});
   if(!r.ok)return masterSrc;
   const text=await r.text();
   if(!text.includes('#EXT-X-STREAM-INF'))return masterSrc;
   const lines=text.split(/\r?\n/);
   let bestUri=null,bestScore=Infinity;
   for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line.startsWith('#EXT-X-STREAM-INF'))continue;
    let nextUri='';
    for(let j=i+1;j<lines.length;j++){const cand=lines[j].trim();if(cand&&!cand.startsWith('#')){nextUri=cand;break}}
    if(!nextUri)continue;
    const bwMatch=line.match(/BANDWIDTH=(\d+)/i);
    const resMatch=line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bw=bwMatch?Number(bwMatch[1]):9999999;
    const h=resMatch?Number(resMatch[2]):9999;
    const score=h*100000+bw;
    if(score<bestScore){bestScore=score;bestUri=new URL(nextUri,location.origin+masterSrc).pathname+new URL(nextUri,location.origin+masterSrc).search}
   }
   return bestUri||masterSrc;
  }catch{return masterSrc}
 }
 let cachedLowSrc=null,lowSrcPromise=null,previewIdleTimer=null,previewGeneration=0;
 function primeLowSrc(){
  if(cachedLowSrc||lowSrcPromise||!data.src)return lowSrcPromise||Promise.resolve(cachedLowSrc||data.src);
  const source=data.src;
  const request=resolveLowestVariantSrc(source).catch(()=>source).then(u=>{
   if(!disposed&&data.src===source)cachedLowSrc=u||source;
   return u||source;
  }).finally(()=>{if(lowSrcPromise===request)lowSrcPromise=null});
  lowSrcPromise=request;return request;
 }
 function disposePreviewPlayer(){
  previewGeneration++;
  clearTimeout(previewIdleTimer);clearTimeout(previewTimer);
  previewIdleTimer=null;previewBusy=false;queuedPreviewTime=null;
  if(previewPlayer&&!previewPlayer.isDisposed()){
   try{previewPlayer.dispose()}catch{}
  }
  previewPlayer=null;previewInitStarted=false;previewReady=false;lastPreviewTime=-99;
 }
 function schedulePreviewIdleDispose(){
  clearTimeout(previewIdleTimer);
  previewIdleTimer=setTimeout(()=>{
   if(!disposed&&ui.dataset.scrubbing!=='true'&&seekPreview.hidden)disposePreviewPlayer();
  },5000);
 }
 async function ensurePreviewPlayer(){
  clearTimeout(previewIdleTimer);
  if(previewInitStarted||disposed||!data.src||navigator.connection?.saveData)return;
  previewInitStarted=true;
  const stamp=previewGeneration,lowSrc=cachedLowSrc||await primeLowSrc();
  if(disposed||!previewInitStarted||stamp!==previewGeneration)return;
  const holder=document.createElement('video');
  holder.className='video-js mp-preview-source';
  holder.muted=true;holder.playsInline=true;holder.preload='auto';
  holder.setAttribute('playsinline','');holder.setAttribute('webkit-playsinline','');
  holder.setAttribute('aria-hidden','true');
  host.appendChild(holder);
  previewPlayer=window.videojs(holder,{
   controls:false,muted:true,preload:'auto',inactivityTimeout:0,
   html5:{vhs:{overrideNative:true,enableLowInitialPlaylist:true,limitRenditionByPlayerDimensions:true,bandwidth:90000,goalBufferLength:0.5,maxGoalBufferLength:1.2,backBufferLength:0.4},nativeAudioTracks:false,nativeTextTracks:false}
  });
  previewPlayer.src({src:lowSrc,type:data.type||'application/x-mpegURL'});
  const markReady=()=>{
   if(previewReady||disposed||!previewPlayer)return;
   let levels=previewPlayer.qualityLevels?.();
   if(levels?.length){
    let minIndex=0,minScore=Infinity;
    for(let i=0;i<levels.length;i++){let score=(levels[i].height||9999)*10000+(levels[i].bandwidth||0);if(score<minScore){minScore=score;minIndex=i}}
    for(let i=0;i<levels.length;i++)levels[i].enabled=i===minIndex;
   }
   previewReady=true;
   if(queuedPreviewTime!==null){
    const q=queuedPreviewTime;queuedPreviewTime=null;
    drawPreviewAt(q);
   }
  };
  previewPlayer.one('loadedmetadata',markReady);
  previewPlayer.one('loadeddata',markReady);
  previewPlayer.one('canplay',markReady);
  try{previewPlayer.load()}catch{}
  if(previewPlayer.readyState?.()>=1)markReady();
 }
 function drawFromVideo(videoEl,bucket){
  if(!videoEl||videoEl.readyState<2||!videoEl.videoWidth)return false;
  paintPreviewCanvas(videoEl,bucket);
  return true;
 }
 function drawPreviewAt(targetTime){
  if(disposed||seekPreview.hidden)return;
  clearTimeout(previewIdleTimer);
  const bucket=Math.max(0,Math.round(targetTime/3));
  if(frameCache.has(bucket)){
   paintPreviewCanvas(frameCache.get(bucket));
   lastPreviewTime=targetTime;
   return;
  }
  const mainVideo=host.querySelector('video.vjs-tech');
  if(Math.abs((player.currentTime()||0)-targetTime)<1.8&&drawFromVideo(mainVideo,bucket))return;
  queuedPreviewTime=targetTime;
  ensurePreviewPlayer();
  if(!previewReady||!previewPlayer||previewBusy||Math.abs(targetTime-lastPreviewTime)<.35)return;
  queuedPreviewTime=null;
  previewBusy=true;lastPreviewTime=targetTime;
  const previewVideo=previewPlayer.el().querySelector('video')||previewPlayer.tech({IWillNotUseThisInPlugins:true})?.el?.();
  const cleanup=()=>{
   clearTimeout(previewTimer);
   if(previewPlayer&&!previewPlayer.isDisposed()){
    previewPlayer.off('seeked',checkReady);
    previewPlayer.off('loadeddata',checkReady);
    previewPlayer.off('canplay',checkReady);
    previewPlayer.off('timeupdate',checkReady);
   }
  };
  const finish=()=>{
   cleanup();
   const doneBucket=Math.max(0,Math.round(targetTime/3));
   if(!seekPreview.hidden&&previewVideo&&!previewVideo.seeking)drawFromVideo(previewVideo,doneBucket);
   else lastPreviewTime=-99;
   previewBusy=false;
   if(!seekPreview.hidden&&queuedPreviewTime!==null&&Math.abs(queuedPreviewTime-targetTime)>=0.8){
    const next=queuedPreviewTime;queuedPreviewTime=null;
    drawPreviewAt(next);
   }else if(seekPreview.hidden){
    schedulePreviewIdleDispose();
   }
  };
  const checkReady=()=>{
   if(previewVideo&&previewVideo.readyState>=2&&!previewVideo.seeking)finish();
  };
  previewTimer=setTimeout(finish,15000);
  previewPlayer.on('seeked',checkReady);
  previewPlayer.on('loadeddata',checkReady);
  previewPlayer.on('canplay',checkReady);
  previewPlayer.on('timeupdate',checkReady);
  try{
   previewPlayer.currentTime(targetTime);
   const vhsLoader=previewPlayer.tech({IWillNotUseThisInPlugins:true})?.vhs?.playlistController_?.mainSegmentLoader_;
   vhsLoader?.load?.();
  }catch{finish()}
 }
 function showHoverPreview(percent){
  let duration=player.duration();if(!(Number.isFinite(duration)&&duration>0))return;
  showControls();
  let clamped=Math.max(0,Math.min(1,percent)),time=clamped*duration;
  previewTime.textContent=formatClock(time);
  seekPreview.hidden=false;
  let areaWidth=seekArea.clientWidth||320,cardHalf=(seekPreview.offsetWidth||120)/2;
  let px=Math.max(cardHalf,Math.min(areaWidth-cardHalf,clamped*areaWidth));
  seekPreview.style.left=`${px}px`;
  drawPreviewAt(time);
 }
 function updateScrubVisual(percent){
  let duration=player.duration();if(!(Number.isFinite(duration)&&duration>0))return 0;
  let clamped=Math.max(0,Math.min(1,percent)),time=clamped*duration;
  seekArea.style.setProperty('--mp-scrub-percent',`${clamped*100}%`);
  seekProgress.style.width=`${clamped*100}%`;
  seekInput.value=String(Math.round(clamped*1000));
  previewTime.textContent=formatClock(time);
  if(scrubHoldReady)seekPreview.hidden=false;
  let areaWidth=seekArea.clientWidth||320,cardHalf=(seekPreview.offsetWidth||120)/2;
  let px=Math.max(cardHalf,Math.min(areaWidth-cardHalf,clamped*areaWidth));
  seekPreview.style.left=`${px}px`;
  if(scrubHoldReady)drawPreviewAt(time);
  return time;
 }
 function percentFromClientX(clientX){
  let rect=seekArea.getBoundingClientRect();
  return rect.width?Math.max(0,Math.min(1,(clientX-rect.left)/rect.width)):0;
 }
 function beginScrub(event){
  let duration=player.duration();if(!(Number.isFinite(duration)&&duration>0))return;
  scrubPointerId=event.pointerId;
  scrubStartX=event.clientX;
  scrubHoldReady=event.pointerType==='mouse';
  ui.dataset.scrubbing='true';
  ui.dataset.active='true';
  clearTimeout(hideTimer);
  ensurePreviewPlayer();
  seekInput.setPointerCapture?.(event.pointerId);
  scrubPendingPercent=percentFromClientX(event.clientX);
  updateScrubVisual(scrubPendingPercent);
  clearTimeout(seekArea._holdTimer);
  if(!scrubHoldReady){
   seekArea._holdTimer=setTimeout(()=>{if(ui.dataset.scrubbing==='true'){scrubHoldReady=true;updateScrubVisual(scrubPendingPercent)}},65);
  }
 }
 function moveScrub(event){
  if(ui.dataset.scrubbing!=='true'){
   if(event.pointerType==='mouse')showHoverPreview(percentFromClientX(event.clientX));
   return;
  }
  if(scrubPointerId!==null&&event.pointerId!==scrubPointerId)return;
  scrubPendingPercent=percentFromClientX(event.clientX);
  if(Math.abs(event.clientX-scrubStartX)>4)scrubHoldReady=true;
  updateScrubVisual(scrubPendingPercent);
 }
 function endScrub(event){
  if(ui.dataset.scrubbing!=='true'||(event?.pointerId!==undefined&&scrubPointerId!==null&&event.pointerId!==scrubPointerId))return;
  clearTimeout(seekArea._holdTimer);
  let pct=event?.clientX!==undefined?percentFromClientX(event.clientX):Number(seekInput.value)/1000;
  let duration=player.duration();
  ui.dataset.scrubbing='false';
  seekPreview.hidden=true;
  scrubPointerId=null;scrubHoldReady=false;
  schedulePreviewIdleDispose();
  if(Number.isFinite(duration)&&duration>0){player.currentTime(pct*duration);updateLoading()}
  updateTime();showControls();
 }
 const documentPointerUp=event=>endScrub(event);
 document.addEventListener('pointerup',documentPointerUp,true);
 document.addEventListener('pointercancel',documentPointerUp,true);
 seekArea.addEventListener('pointerenter',()=>{if(!navigator.connection?.saveData)primeLowSrc()});
 seekArea.addEventListener('pointermove',event=>{if(ui.dataset.scrubbing!=='true'&&event.pointerType==='mouse')showHoverPreview(percentFromClientX(event.clientX))});
 seekArea.addEventListener('pointerleave',()=>{if(ui.dataset.scrubbing!=='true'){seekPreview.hidden=true;schedulePreviewIdleDispose()}});
 seekInput.addEventListener('pointerdown',beginScrub);
 seekInput.addEventListener('pointermove',moveScrub);
 seekInput.addEventListener('pointerup',endScrub);
 seekInput.addEventListener('pointercancel',endScrub);
 seekInput.addEventListener('input',()=>{if(ui.dataset.scrubbing!=='true'){let d=player.duration();if(d>0)player.currentTime(Number(seekInput.value)/1000*d)}});

 const togglePlayback=()=>{if(player.paused())player.play().catch(()=>{});else player.pause()};
 playButton.addEventListener('click',()=>{togglePlayback();showControls()});
 centerPlay.addEventListener('click',()=>{player.play().catch(()=>{});showControls()});
 muteButton.addEventListener('click',()=>{
  toggleMasterMute();
  showControls();
 });
 ccButton.addEventListener('click',()=>settings.hidden?openSettings('cc'):closeSettings());
 $('.mp-settings-button').addEventListener('click',()=>settings.hidden?openSettings('cc'):closeSettings());
 $('.mp-settings-close').addEventListener('click',closeSettings);
 skipIntro.addEventListener('click',()=>{if(Number(data.intro?.end)>0)player.currentTime(Number(data.intro.end));showControls()});
 skipOutro.addEventListener('click',()=>{if(Number(data.outro?.end)>0)player.currentTime(Number(data.outro.end));showControls()});
 prevEpButton?.addEventListener('click',event=>{event.stopPropagation();if(options.hasPrevEpisode)options.onPrevEpisode?.()});
 nextEpButton?.addEventListener('click',event=>{event.stopPropagation();if(options.hasNextEpisode)options.onNextEpisode?.()});
 pipButton.addEventListener('click',async()=>{
  try{
   const video=host.querySelector('video');
   if(document.pictureInPictureElement)await document.exitPictureInPicture();
   else if(video?.requestPictureInPicture)await video.requestPictureInPicture();
  }catch{}
  showControls();
 });

 async function toggleFullscreen(){
  const container=host.closest('#player')||host;
  const active=document.fullscreenElement||document.webkitFullscreenElement||player.isFullscreen();
  if(active){
   try{if(document.fullscreenElement)await document.exitFullscreen();else if(player.isFullscreen())player.exitFullscreen()}catch{}
   if(orientationLocked){orientationLocked=false;try{screen.orientation?.unlock?.()}catch{}}
   return;
  }
  try{
   if(container.requestFullscreen)await container.requestFullscreen({navigationUI:'hide'});
   else if(container.webkitRequestFullscreen)container.webkitRequestFullscreen();
   else player.requestFullscreen();
  }catch{try{player.requestFullscreen()}catch{}}
  const mobileViewport=window.matchMedia?.('(max-width: 920px)')?.matches||navigator.maxTouchPoints>0;
  if(mobileViewport&&screen.orientation?.lock){
   try{await screen.orientation.lock('landscape');orientationLocked=true}catch{}
  }
 }
 function updateFullscreen(){
  const container=host.closest('#player')||host;
  const fullscreenElement=document.fullscreenElement||document.webkitFullscreenElement;
  const active=fullscreenElement===container||fullscreenElement===host||player.isFullscreen();
  ui.classList.toggle('mp-is-fullscreen',Boolean(active));
  fullscreenButton.innerHTML=active?icons.exitFullscreen:icons.fullscreen;
  fullscreenButton.setAttribute('aria-label',active?'Exit Fullscreen':'Fullscreen');
  if(!active&&orientationLocked){orientationLocked=false;try{screen.orientation?.unlock?.()}catch{}}
 }
 fullscreenButton.addEventListener('click',()=>{toggleFullscreen();showControls()});
 document.addEventListener('fullscreenchange',updateFullscreen);
 player.on('fullscreenchange',updateFullscreen);

 settings.addEventListener('click',event=>{
  let tab=event.target.closest('[data-tab]');if(tab){showPanel(tab.dataset.tab);return}
  if(event.target.closest('[data-open-caption-style]')){showPanel('caption-style');return}
  if(event.target.closest('[data-back-cc]')){showPanel('cc');return}
  if(event.target.closest('[data-close-settings]')){closeSettings();return}
  let track=event.target.closest('[data-track]');if(track){selectSubtitle(Number(track.dataset.track),true);return}
  let quality=event.target.closest('[data-quality]');if(quality){selectQuality(quality.dataset.quality,true);closeSettings();return}
  let server=event.target.closest('[data-server-choice]');if(server){let value=server.dataset.serverChoice;try{if(!isAnime)storePreference('kozutv-server-pref',value)}catch{}closeSettings();options.onServerChange?.(value);return}
  let audioChoice=event.target.closest('[data-audio-choice]');
  if(audioChoice){
   let value=audioChoice.dataset.audioChoice;
   // Paint the choice immediately (the reload can take a moment and touching the
   // list twice used to feel like a long press was needed).
   options.lang=value;renderAudio();
   closeSettings();options.onAudioChange?.(value);return;
  }
  let audioStream=event.target.closest('[data-audio-stream]');if(audioStream){void tryMultiAudioChoice(Number(audioStream.dataset.audioStream));closeSettings();return}
  let audioTrack=event.target.closest('[data-audio-track]');if(audioTrack){switchHlsAudioTrack(Number(audioTrack.dataset.audioTrack),!isAnime);closeSettings();return}
  let rate=event.target.closest('[data-rate]');if(rate){
   let v=Number(rate.dataset.rate)||1;
   player.playbackRate(v);
   try{storePreference('kozutv-speed',String(v))}catch{}
   renderPlaybackSettings();
   return;
  }
 });
 settings.addEventListener('change',event=>{
  let offsetControl=event.target.closest('[data-caption-offset]');
  if(offsetControl){captionSyncOffset=Number(offsetControl.value)||0;lastRenderedCaptionSig='';renderCaptions();return}
  let styleControl=event.target.closest('[data-caption-style]');
  if(styleControl){captionStyle[styleControl.dataset.captionStyle]=styleControl.value;saveCaptionStyle(captionMode,captionStyle);applyCaptionStyle()}
 });

 // Unified Touch & Mouse Surface Gestures:
 // - Single tap/click outside center: toggle controls
 // - Double tap/click Left (<34%): rewind by the preferred seek interval
 // - Double tap/click Right (>66%): advance by the preferred seek interval
 // - Single tap/click in Estimated Center (36%..64% x, 28%..72% y): pause/resume video
 function isControlElement(target){
  return Boolean(target?.closest?.('.mp-bottom, .mp-settings, .mp-center-play, .mp-skip, .mp-prev-ep, .mp-next-ep'));
 }
 function handleSurfaceTap(clientX,clientY){
  if(disposed||ui.dataset.scrubbing==='true')return;
  if(!settings.hidden){closeSettings();return}
  const rect=host.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const rx=(clientX-rect.left)/rect.width,ry=(clientY-rect.top)/rect.height;
  const now=Date.now();
  if((rx<0.34||rx>0.66)&&ry>=0.25&&ry<=0.85){
   const side=rx<0.34?'left':'right';
   const isDouble=(lastSideTap.side===side&&now-lastSideTap.time<300)||(activeSkipSide===side&&now-lastSkipAt<650);
   if(isDouble){
    clearTimeout(singleTapTimer);singleTapTimer=null;
    lastSideTap={side:'',time:0};
    performSkipSeek(side==='right'?preferredSeekStep():-preferredSeekStep(),true);
    return;
   }
   lastSideTap={side,time:now};
   clearTimeout(singleTapTimer);
   singleTapTimer=setTimeout(()=>{
    singleTapTimer=null;
    lastSideTap={side:'',time:0};
    toggleControls();
   },220);
   return;
  }
  clearTimeout(singleTapTimer);singleTapTimer=null;lastSideTap={side:'',time:0};
  if(rx>=0.36&&rx<=0.64&&ry>=0.28&&ry<=0.72){
   if(!player.paused()){player.pause();showControls()}
   else{player.play().catch(()=>{});showControls()}
   return;
  }
  toggleControls();
 }

 // Hold Space (Desktop) & Hold Screen (Mobile/Touch) -> Silent Temporary 2x Speed Boost (no visual badge)
 let holdSpeedActive=false,holdSpeedSource='',holdSpeedPrevRate=1,spacePressed=false,spaceHoldTimer=null,touchHoldTimer=null;
 function engageHoldSpeed(source){
  if(disposed||holdSpeedActive||player.paused()||ui.dataset.scrubbing==='true')return;
  holdSpeedActive=true;
  holdSpeedSource=source;
  holdSpeedPrevRate=Number(videoEl?.playbackRate||player.playbackRate())||1;
  try{
   player.playbackRate(2);
   if(videoEl)videoEl.playbackRate=2;
  }catch{}
  if(source==='touch')hideControls();
 }
 function releaseHoldSpeed(){
  clearTimeout(spaceHoldTimer);spaceHoldTimer=null;
  clearTimeout(touchHoldTimer);touchHoldTimer=null;
  spacePressed=false;
  if(!holdSpeedActive)return;
  const restoreRate=holdSpeedPrevRate||1;
  holdSpeedActive=false;
  holdSpeedSource='';
  if(!disposed){
   try{
    player.playbackRate(restoreRate);
    if(videoEl)videoEl.playbackRate=restoreRate;
   }catch{}
   renderPlaybackSettings();
  }
 }

 const onKeyDown=event=>{
  if(disposed||!host.isConnected)return;
  if(event.ctrlKey||event.altKey||event.metaKey)return;
  const active=document.activeElement;
  const isEditable=active&&!active.classList?.contains('mp-seek-input')&&(
   active.tagName==='INPUT'||active.tagName==='SELECT'||active.tagName==='TEXTAREA'||active.isContentEditable
  );
  if(isEditable)return;
  if(active&&!host.contains(active)&&(active.matches?.('[data-hero-details],[data-description-toggle]')||active.closest?.('#main-menu')))return;

  const key=event.key;
  const lower=key.length===1?key.toLowerCase():key;
  const consume=()=>{event.preventDefault();event.stopPropagation()};

  if(key===' '||event.code==='Space'){
   consume();
   if(event.repeat||spacePressed||holdSpeedActive)return;
   if(player.paused()){
    togglePlayback();
    showControls();
    return;
   }
   spacePressed=true;
   clearTimeout(spaceHoldTimer);
   spaceHoldTimer=setTimeout(()=>{
    spaceHoldTimer=null;
    if(spacePressed&&!player.paused())engageHoldSpeed('space');
   },200);
   return;
  }
  if(lower==='k'){
   consume();
   togglePlayback();
   showControls();
   return;
  }
  if(key==='ArrowLeft'||lower==='j'){
   consume();
   performSkipSeek(-preferredSeekStep(),false);
   return;
  }
  if(key==='ArrowRight'||lower==='l'){
   consume();
   performSkipSeek(preferredSeekStep(),false);
   return;
  }
  if(key==='ArrowUp'||key==='ArrowDown'){
   consume();
   const step=key==='ArrowUp'?0.1:-0.1;
   const curVol=player.muted()?0:(Number(player.volume())||0);
   const nextVol=Math.max(0,Math.min(1,Math.round((curVol+step)*100)/100));
   try{
    player.volume(nextVol>0?nextVol:1);
    player.muted(nextVol<=0);
    storePreference('kozutv-muted',String(nextVol<=0));
   }catch{}
   updateVolume();
   showControls();
   return;
  }
  if(lower==='m'){
   consume();
   toggleMasterMute();
   showControls();
   return;
  }
  if(lower==='f'){
   consume();
   toggleFullscreen();
   showControls();
   return;
  }
  if(lower==='c'){
   consume();
   const items=combinedTracks();
   const englishIndex=pickDefaultEnglishTrackIndex(items);
   if(selectedTrackKey>=0){
    selectSubtitle(-1,true);
   }else if(englishIndex>=0){
    selectSubtitle(englishIndex,true);
   }
   showControls();
   return;
  }
  if(key==='N'&&event.shiftKey){
   if(options.hasNextEpisode){consume();options.onNextEpisode?.()}
   return;
  }
  if(key==='P'&&event.shiftKey){
   if(options.hasPrevEpisode){consume();options.onPrevEpisode?.()}
   return;
  }
  if(/^[0-9]$/.test(key)&&!event.shiftKey){
   const dur=Number(player.duration());
   if(Number.isFinite(dur)&&dur>0){
    consume();
    player.currentTime((Number(key)/10)*dur);
    updateTime();
    showControls();
   }
   return;
  }
  if(key==='<'||key==='>'){
   consume();
   const rates=[0.25,0.5,0.75,1,1.25,1.5,1.75,2];
   const curRate=Number(videoEl?.playbackRate||player.playbackRate())||1;
   let rIdx=rates.findIndex(r=>Math.abs(r-curRate)<0.02);
   if(rIdx<0)rIdx=3;
   const nextIdx=Math.max(0,Math.min(rates.length-1,rIdx+(key==='>'?1:-1)));
   try{if(videoEl)videoEl.playbackRate=rates[nextIdx];player.playbackRate(rates[nextIdx]);storePreference('kozutv-speed',String(rates[nextIdx]))}catch{}
   renderPlaybackSettings();
   showControls();
   return;
  }
  if((key===','||key==='.')&&player.paused()){
   consume();
   const dur=Number(player.duration()),cur=Number(player.currentTime())||0;
   const nextT=Math.max(0,Number.isFinite(dur)&&dur>0?Math.min(dur,cur+(key==='.'?1/30:-1/30)):cur);
   player.currentTime(nextT);
   updateTime();
   return;
  }
  if(key==='Escape'&&!settings.hidden){
   consume();
   closeSettings();
  }
 };
 window.addEventListener('keydown',onKeyDown,true);
 const onKeyUp=event=>{
  if(disposed)return;
  if(event.key===' '||event.code==='Space'){
   if(!spacePressed&&!(holdSpeedActive&&holdSpeedSource==='space'))return;
   event.preventDefault();event.stopPropagation();
   clearTimeout(spaceHoldTimer);spaceHoldTimer=null;
   const wasHolding=holdSpeedActive&&holdSpeedSource==='space';
   spacePressed=false;
   if(wasHolding){
    releaseHoldSpeed();
   }else{
    togglePlayback();
    showControls();
   }
  }
 };
 const onWindowBlur=()=>releaseHoldSpeed();
 const onVisibilityChange=()=>{if(document.hidden)releaseHoldSpeed()};
 window.addEventListener('keyup',onKeyUp,true);
 window.addEventListener('blur',onWindowBlur);
 document.addEventListener('visibilitychange',onVisibilityChange);

 let lastMouseX=-1,lastMouseY=-1;
 const onHostContextMenu=event=>{
  if(holdSpeedActive||pointerStart)event.preventDefault();
 };
 const onHostPointerDown=event=>{
  if(event.button>0)return;
  if(isControlElement(event.target)){if(settings.hidden)showControls();pointerStart=null;return}
  pointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),type:event.pointerType||''};
  clearTimeout(touchHoldTimer);touchHoldTimer=null;
  if(event.pointerType!=='mouse'&&!player.paused()&&settings.hidden&&ui.dataset.scrubbing!=='true'){
   const pid=event.pointerId;
   touchHoldTimer=setTimeout(()=>{
    touchHoldTimer=null;
    if(pointerStart&&pointerStart.id===pid&&!player.paused()&&settings.hidden){
     engageHoldSpeed('touch');
    }
   },260);
  }
 };
 const onHostPointerUp=event=>{
  clearTimeout(touchHoldTimer);touchHoldTimer=null;
  if(holdSpeedActive&&holdSpeedSource==='touch'){
   pointerStart=null;
   lastPointerUpAt=Date.now();
   releaseHoldSpeed();
   return;
  }
  if(!pointerStart||event.pointerId!==pointerStart.id)return;
  let dist=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y),dt=Date.now()-pointerStart.time;
  let {x,y}=pointerStart;pointerStart=null;
  if(dist<20&&dt<500&&!isControlElement(event.target)){
   lastPointerUpAt=Date.now();
   handleSurfaceTap(x,y);
  }
 };
 const onHostPointerCancel=()=>{
  clearTimeout(touchHoldTimer);touchHoldTimer=null;
  pointerStart=null;
  if(holdSpeedActive&&holdSpeedSource==='touch'){
   lastPointerUpAt=Date.now();
   releaseHoldSpeed();
  }
 };
 host.addEventListener('contextmenu',onHostContextMenu);
 host.addEventListener('pointerdown',onHostPointerDown);
 host.addEventListener('pointerup',onHostPointerUp);
 host.addEventListener('pointercancel',onHostPointerCancel);
 let rawTouchStart=null;
 const onHostTouchStart=event=>{
  if(pointerStart||event.touches.length!==1||isControlElement(event.target))return;
  const t=event.touches[0];
  rawTouchStart={x:t.clientX,y:t.clientY};
  clearTimeout(touchHoldTimer);
  if(!player.paused()&&settings.hidden&&ui.dataset.scrubbing!=='true'){
   touchHoldTimer=setTimeout(()=>{
    touchHoldTimer=null;
    if(rawTouchStart&&!player.paused()&&settings.hidden)engageHoldSpeed('touch');
   },260);
  }
 };
 const onHostTouchMove=event=>{
  if(!rawTouchStart||!event.touches.length)return;
  const t=event.touches[0];
  if(Math.hypot(t.clientX-rawTouchStart.x,t.clientY-rawTouchStart.y)>16){
   clearTimeout(touchHoldTimer);touchHoldTimer=null;
  }
 };
 const onHostTouchEnd=event=>{
  clearTimeout(touchHoldTimer);touchHoldTimer=null;
  rawTouchStart=null;
  if(holdSpeedActive&&holdSpeedSource==='touch'){
   if(event.cancelable)event.preventDefault();
   lastPointerUpAt=Date.now();
   releaseHoldSpeed();
  }
 };
 host.addEventListener('touchstart',onHostTouchStart,{passive:true});
 host.addEventListener('touchmove',onHostTouchMove,{passive:true});
 host.addEventListener('touchend',onHostTouchEnd,{passive:false});
 host.addEventListener('touchcancel',onHostTouchEnd,{passive:true});
 host.addEventListener('pointermove',event=>{
  if(pointerStart&&event.pointerId===pointerStart.id&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>16){
   clearTimeout(touchHoldTimer);touchHoldTimer=null;
  }
  if(event.pointerType!=='mouse'||pointerStart||!settings.hidden||Date.now()-lastPointerUpAt<350||Date.now()-lastSkipAt<800)return;
  if(lastMouseX<0||Math.hypot(event.clientX-lastMouseX,event.clientY-lastMouseY)>4)showControls();
  lastMouseX=event.clientX;lastMouseY=event.clientY;
 });

 const videoEl=player.tech({}).el(),techFallbackClick=event=>{if(Date.now()-lastPointerUpAt>400)handleSurfaceTap(event.clientX,event.clientY)};
 if(videoEl)videoEl.style.filter='';
 videoEl.addEventListener('click',techFallbackClick);
 videoEl.addEventListener('resize',renderQuality);

 const nativeLoadingEvents=['loadstart','waiting','seeking','seeked','canplay','playing','pause','stalled'];
 for(let ev of nativeLoadingEvents)videoEl.addEventListener(ev,updateLoading);

 // Pre-resolve lowest-variant playlist URL string only (zero MSE/video decoder during playback!)
 player.one('playing',()=>{
  if(!navigator.connection?.saveData){
   clearTimeout(warmPreviewTimer);
   warmPreviewTimer=setTimeout(()=>primeLowSrc(),1500);
  }
 });
 player.on(['play','playing'],()=>{
  updatePlay();
  if(ui.dataset.active==='true'&&settings.hidden&&Date.now()-lastSkipAt>800)showControls();
 });
 player.on(['pause','ended'],()=>{releaseHoldSpeed();updatePlay();if(!resyncing&&settings.hidden)showControls()});
 player.on(['loadstart','waiting','seeking','seeked','canplay','canplaythrough','loadeddata','error'],updateLoading);
 player.on(['volumechange'],updateVolume);
 player.on(['timeupdate','progress','durationchange','loadedmetadata','seeking','seeked'],()=>{updateTime();updateSkip()});
 player.on('timeupdate',renderCaptions);

 // Real-time A/V Sync & Stall Recovery Guardian (prevents frozen video + out-of-sync audio)
 let wdLastTime=-1,wdLastFrames=-1,wdFrozenTicks=0,wdFreezeAnchor=0,lastResyncAt=0,resyncPollTimer=null;
 const stallTimestamps=[];
 function bufferedAheadAt(t){
  const b=videoEl?.buffered;
  if(!b)return {ahead:0,nextStart:null};
  let ahead=0,nextStart=null;
  for(let i=0;i<b.length;i++){
   const s=b.start(i),e=b.end(i);
   if(t>=s-0.18&&t<=e+0.05)ahead=Math.max(ahead,Math.max(0,e-t));
   else if(s>t&&s-t<=1.5&&e-s>=1.2&&(nextStart===null||s<nextStart))nextStart=s;
  }
  return {ahead,nextStart};
 }
 function finishResync(anchor){
  clearInterval(resyncPollTimer);resyncPollTimer=null;
  if(disposed)return;
  let settled=false;
  const resumeAfterSeek=()=>{
   if(settled||disposed)return;
   settled=true;
   videoEl?.removeEventListener('seeked',onNativeSeeked);
   resyncing=false;
   lastResyncAt=Date.now();
   wdLastTime=-1;wdLastFrames=-1;wdFrozenTicks=0;
   updateLoading();
   const p=videoEl?videoEl.play():player.play();
   Promise.resolve(p).catch(()=>{updatePlay()});
  };
  const onNativeSeeked=()=>{clearTimeout(fallback);resumeAfterSeek()};
  const fallback=setTimeout(resumeAfterSeek,550);
  videoEl?.addEventListener('seeked',onNativeSeeked,{once:true});
  try{videoEl.currentTime=anchor}catch{clearTimeout(fallback);resumeAfterSeek()}
 }
 function triggerAvResync(anchor){
  if(disposed||resyncing)return;
  resyncing=true;
  lastResyncAt=Date.now();
  updateLoading();
  try{videoEl.pause()}catch{}
  if(bufferedAheadAt(anchor).ahead>=1.6){
   finishResync(anchor);
   return;
  }
  const waitStarted=Date.now();
  clearInterval(resyncPollTimer);
  resyncPollTimer=setInterval(()=>{
   if(disposed){clearInterval(resyncPollTimer);resyncPollTimer=null;return}
   if(bufferedAheadAt(anchor).ahead>=1.8||Date.now()-waitStarted>=4500){
    finishResync(anchor);
   }
  },220);
 }
 const syncWatchdogTimer=setInterval(()=>{
  if(disposed||resyncing||!videoEl||videoEl.paused||videoEl.ended||videoEl.seeking||ui.dataset.scrubbing==='true')return;
  const cur=Number(videoEl.currentTime)||0;
  const q=videoEl.getVideoPlaybackQuality?.();
  const frames=q&&typeof q.totalVideoFrames==='number'?q.totalVideoFrames:-1;
  const {ahead,nextStart}=bufferedAheadAt(cur);
  if(wdLastTime>=0&&Date.now()-lastResyncAt>3200){
   const dt=cur-wdLastTime;
   // 1. Jump tiny fMP4 segment-boundary micro-gap if buffered data sits right ahead
   if(Math.abs(dt)<0.04&&ahead<0.08&&nextStart!==null){
    lastResyncAt=Date.now();
    try{videoEl.currentTime=nextStart+0.04}catch{}
    wdLastTime=nextStart+0.04;wdLastFrames=frames;wdFrozenTicks=0;
    return;
   }
   // 2. Detect frozen video while audio keeps playing (prevents out-of-sync audio)
   if(dt>=0.42&&frames>=0&&wdLastFrames>=0&&frames===wdLastFrames&&videoEl.videoWidth>0){
    if(wdFrozenTicks===0)wdFreezeAnchor=wdLastTime;
    wdFrozenTicks++;
    if(wdFrozenTicks>=2){
     wdFrozenTicks=0;
     triggerAvResync(Math.max(0,wdFreezeAnchor));
     return;
    }
   }else{
    wdFrozenTicks=0;
   }
  }
  wdLastTime=cur;
  wdLastFrames=frames;
 },850);

 const captionSyncTimer=setInterval(()=>{
  if(disposed||selectedTrackKey<0)return;
  renderCaptions();
 },33);
 player.on(['timeupdate','seeked','seeking','play','ratechange'],()=>{
  if(!disposed&&selectedTrackKey>=0){renderCaptions();if(aiActive)pumpAi()}
 });
 player.on('seeking',()=>{if(aiActive){cancelAi(false);pumpAi()}});
 const aiPumpTimer=setInterval(()=>{if(aiActive)pumpAi()},1000);
 const onPreferenceRestore=()=>refreshCaptionContext();
 window.addEventListener('kozutv-preferences-restored',onPreferenceRestore);

 // Restore persisted speed, mute, quality, audio & captions across page reloads!
 let savedSpeed=(()=>{try{return Number(localStorage.getItem('kozutv-speed'))||1}catch{return 1}})();
 let savedMuted=(()=>{try{return localStorage.getItem('kozutv-muted')==='true'}catch{return false}})();
 try{player.muted(savedMuted);player.volume(1)}catch{}

 let startupPrefsApplied=false,qualityDebounce=null;
 const applyStartupPreferences=()=>{
  if(disposed||startupPrefsApplied||player.readyState()<1)return;
  startupPrefsApplied=true;
  if(savedSpeed&&savedSpeed!==1)try{player.playbackRate(savedSpeed)}catch{}
  if(currentQuality!=='auto')applyQualityToVhs(currentQuality);
  restoreAudioPreference();
  restoreSubtitlePreference();
  renderQuality();renderAudio();renderPlaybackSettings();updateTime();updateLoading();
 };
 player.on(['loadeddata','canplay'],applyStartupPreferences);
 player.on('loadedmetadata',()=>{
  if(savedSpeed&&savedSpeed!==1)try{player.playbackRate(savedSpeed)}catch{}
  restoreSubtitlePreference();
  renderQuality();renderAudio();renderPlaybackSettings();updateTime();updateLoading();
  setTimeout(applyStartupPreferences,120);
 });

 let levels=qualityLevels();
 if(levels?.on){
  levels.on('addqualitylevel',()=>{
   renderQuality();
   if(startupPrefsApplied&&currentQuality!=='auto'){
    clearTimeout(qualityDebounce);
    qualityDebounce=setTimeout(()=>applyQualityToVhs(currentQuality),60);
   }
  });
  levels.on('change',renderQuality);
 }
 let textTracks=player.textTracks();
 textTracks.addEventListener?.('addtrack',()=>{restoreSubtitlePreference();renderTracks()});
 let audioTracks=player.audioTracks();
 audioTracks.addEventListener?.('addtrack',()=>{if(startupPrefsApplied){clearTimeout(audioPrefTimer);audioPrefTimer=setTimeout(restoreAudioPreference,80)}renderAudio();scheduleCaptionContext()});
 audioTracks.addEventListener?.('change',()=>{renderAudio();scheduleCaptionContext()});

 player.one('dispose',()=>{
  disposed=true;cancelAi();clearTimeout(captionAudioTimer);clearInterval(aiPumpTimer);window.removeEventListener('kozutv-preferences-restored',onPreferenceRestore);
  if(cancelActiveSwitch)cancelActiveSwitch();clearTimeout(noticeTimer);clearTimeout(audioPrefTimer);
  if(autoSyncAbort){try{autoSyncAbort.abort()}catch{}autoSyncAbort=null}
  if(activeTapAnim){try{activeTapAnim.cancel()}catch{}activeTapAnim=null}
  clearTimeout(spaceHoldTimer);clearTimeout(touchHoldTimer);clearTimeout(skipCommitTimer);
  clearInterval(syncWatchdogTimer);clearInterval(resyncPollTimer);clearInterval(captionSyncTimer);
  clearTimeout(hideTimer);clearTimeout(loaderTimer);clearTimeout(tapSeekTimer);clearTimeout(singleTapTimer);clearTimeout(previewTimer);clearTimeout(warmPreviewTimer);clearTimeout(qualityDebounce);clearTimeout(previewIdleTimer);
  document.removeEventListener('fullscreenchange',updateFullscreen);
  document.removeEventListener('visibilitychange',onVisibilityChange);
  document.removeEventListener('pointerup',documentPointerUp,true);
  document.removeEventListener('pointercancel',documentPointerUp,true);
  window.removeEventListener('keydown',onKeyDown,true);
  window.removeEventListener('keyup',onKeyUp,true);
  window.removeEventListener('blur',onWindowBlur);
  host.removeEventListener('contextmenu',onHostContextMenu);
  host.removeEventListener('pointerdown',onHostPointerDown);
  host.removeEventListener('pointerup',onHostPointerUp);
  host.removeEventListener('pointercancel',onHostPointerCancel);
  host.removeEventListener('touchstart',onHostTouchStart);
  host.removeEventListener('touchmove',onHostTouchMove);
  host.removeEventListener('touchend',onHostTouchEnd);
  host.removeEventListener('touchcancel',onHostTouchEnd);
  videoEl?.removeEventListener('click',techFallbackClick);
  videoEl?.removeEventListener('resize',renderQuality);
  for(let ev of nativeLoadingEvents)videoEl?.removeEventListener(ev,updateLoading);
  if(activeTrack&&captionCueHandler)activeTrack.removeEventListener('cuechange',captionCueHandler);
  if(orientationLocked&&(document.fullscreenElement||document.webkitFullscreenElement)!==host.closest('#player'))try{screen.orientation?.unlock?.()}catch{}
  disposePreviewPlayer();
  frameCache.clear();
  ui.remove();
 });

 lastCaptionAudioSignature=captionAudioSignature();applyCaptionStyle();disableAllNativeTracks();restoreSubtitlePreference();updatePlay();updateVolume();updateTime();renderTracks();renderAudio();renderQuality();renderPlaybackSettings();updateFullscreen();showControls();
 player.megaUI={ui,showControls,hideControls,openSettings,closeSettings,selectSubtitle,selectQuality,setAnimeLangs,setAudioDiscovery,setAnimeRegionalStreams,switchAnimeSource,notify,isSourceSwitching:()=>sourceSwitching,onAutoplayBlocked:()=>{ui.dataset.autoplay='false';ui.dataset.paused='true';updateLoading();showControls()}};
 return player.megaUI;
}

window.MegaPlayUI={create};
})();
