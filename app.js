const tracks = [];
let activeUrl = null;
let activeAudio = null;
let currentTrackIndex = -1;
let shuffleEnabled = false;
let playerVolume = Number(localStorage.getItem('laos-remix-volume'));
if(!Number.isFinite(playerVolume))playerVolume=0.8;
let favorites = new Set(JSON.parse(localStorage.getItem('laos-remix-favorites') || '[]'));
let favoritesOnly = false;
let filtersOpen = true;
let selectedCollection = 'all';
let selectedFolderId = null;
const list = document.querySelector('#track-list');
const folderBrowser = document.querySelector('#folder-browser');
const count = document.querySelector('#song-count');
let localAdminView = Boolean(window.LAOS_ADMIN?.isAdmin) || ['localhost','127.0.0.1'].includes(location.hostname);
document.addEventListener('laos-admin-change',event=>{localAdminView=Boolean(event.detail?.isAdmin);renderTracks(currentFilter());});
const memberGrid = document.querySelector('#member-grid');
const memberCount = document.querySelector('#member-count');
let membersCache = [];
document.querySelector('#np-volume').value=playerVolume;
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function renderMembers(members=[]) {
  if (!memberGrid) return;
  membersCache = members;
  memberCount.textContent = String(members.length).padStart(2,'0');
  memberGrid.innerHTML = members.length ? members.slice(0,4).map(member => `<article class="member-card" data-member-open="${escapeHtml(member.id)}" tabindex="0" role="link" aria-label="ดูช่องทางติดต่อนักทำเพลง ${escapeHtml(member.name)}"><span class="member-avatar">${escapeHtml([...member.name].slice(0,2).join(''))}</span><strong>${escapeHtml(member.name)}</strong><span class="member-status"><i></i> รับทำเพลง</span><span class="member-card-hint">ดูช่องทางติดต่อ ↗</span></article>`).join('') : '<p class="members-empty">ยังไม่มีรายชื่อคนรับทำเพลง</p>';
}
if (memberGrid) fetch('/api/members').then(response=>response.ok?response.json():[]).then(renderMembers).catch(()=>renderMembers());
memberGrid?.addEventListener('click', event => {
  const card=event.target.closest('[data-member-open]'); if(!card||event.target.closest('[data-member-delete]'))return;
  if(!membersCache.some(item=>item.id===card.dataset.memberOpen))return;
  window.location.href=`producers.html#${encodeURIComponent(card.dataset.memberOpen)}`;
});
memberGrid?.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-member-open]')){event.preventDefault();event.target.click();}});
const formatDuration = seconds => { if (!Number.isFinite(seconds)) return '—:—'; const min=Math.floor(seconds/60), sec=Math.floor(seconds%60); return `${min}:${String(sec).padStart(2,'0')}`; };
const isNewTrack = track => {
  const uploadedAt = Number(track.uploadedAt) || Number(String(track.id || '').match(/^\d+/)?.[0]);
  return Number.isFinite(uploadedAt) && uploadedAt > 0 && Date.now() - uploadedAt < 7 * 24 * 60 * 60 * 1000;
};
const currentFilter=()=>document.querySelector('#genre-filter')?.value||'all';
function renderTracks(filter=currentFilter()) {
  const order=document.querySelector('#sort-order')?.value||'staff';
  const folderMode=selectedCollection==='folders';
  const folderGroups=new Map();
  tracks.filter(track=>track.folderId&&track.folderName).forEach(track=>{
    if(!folderGroups.has(track.folderId))folderGroups.set(track.folderId,{name:track.folderName,total:0});
    folderGroups.get(track.folderId).total++;
  });
  folderBrowser.hidden=!folderMode;
  list.hidden=folderMode&&!selectedFolderId;
  if(folderMode&&!selectedFolderId){
    folderBrowser.innerHTML=folderGroups.size?[...folderGroups].map(([id,folder])=>`<article class="folder-card"><button class="folder-open" type="button" data-folder-id="${escapeHtml(id)}"><span class="folder-card-icon">▰</span><span><strong title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</strong><small>${folder.total} เพลง</small></span><b>›</b></button><button class="folder-share" type="button" data-folder-share="${escapeHtml(id)}" data-folder-name="${escapeHtml(folder.name)}" aria-label="แชร์เพลง Set ${escapeHtml(folder.name)}" title="แชร์ลิงก์เพลง Set">↗</button><a class="folder-download" href="/api/folders/${encodeURIComponent(id)}/download" download aria-label="ดาวน์โหลดเพลงทั้งหมดใน ${escapeHtml(folder.name)} เป็น ZIP" title="ดาวน์โหลดเพลงทั้งชุด" data-folder-download>⇩</a></article>`).join(''):'<div class="empty-state">ยังไม่มีเพลง Set<br><small>เลือกทั้งโฟลเดอร์หรืออัปโหลดหลายเพลงพร้อมกัน เพื่อสร้างเพลง Set อัตโนมัติ</small></div>';
  }else if(folderMode){
    const folder=folderGroups.get(selectedFolderId);
    folderBrowser.innerHTML=`<button class="folder-back" type="button" data-folder-back>← กลับไปเพลง Set</button><strong class="folder-current">${escapeHtml(folder?.name||'เพลง Set')}</strong>`;
  }
  let visible=tracks.map((track,index)=>({...track,index})).filter(track=>(!folderMode||(selectedFolderId&&track.folderId===selectedFolderId))&&(selectedCollection==='all'||selectedCollection==='folders'||(track.collection||(['credit','remix'].includes(track.genre)?track.genre:'remix'))===selectedCollection)&&(filter==='all'||track.genre===filter)&&(!favoritesOnly||favorites.has(track.id||String(track.index)))&&(!document.querySelector('#highlights-toggle')?.checked||track.highlight||(track.collection||'remix')==='remix'));
  if(order==='title')visible.sort((a,b)=>a.title.localeCompare(b.title));
  if(order==='top')visible.sort((a,b)=>(Number(b.downloads)||0)-(Number(a.downloads)||0));
  if(order==='newest')visible.sort((a,b)=>b.index-a.index);
  document.querySelectorAll('.category-link').forEach(button=>button.classList.toggle('active',button.dataset.collection===selectedCollection));
  list.innerHTML = visible.map((track,position)=>`<article class="track ${currentTrackIndex===track.index?'is-current':''}">
    <span class="track-number">${String(position+1).padStart(2,'0')}</span><span class="cover ${track.coverClass||'uploaded'}">${track.coverUrl?`<img src="${escapeHtml(track.coverUrl)}" alt="ปก ${escapeHtml(track.title)}" loading="lazy">`:escapeHtml(track.cover||'LR')}</span>
    <button class="play-button" aria-label="เล่น ${escapeHtml(track.title)}" data-play="${track.index}">${currentTrackIndex===track.index&&activeAudio&&!activeAudio.paused?'Ⅱ':'▶'}</button>
    <span class="track-info"><strong>${escapeHtml(track.title)} ${track.highlight||isNewTrack(track)?'<em class="new-badge">NEW</em>':''}</strong><span>${escapeHtml(track.artist)} ${track.fileUrl?`<small class="download-count" title="ยอดดาวน์โหลด">⇩ ${Number(track.downloads)||0} ดาวน์โหลด</small>`:''}</span></span>
    <span class="tag">${track.genre==='lao'?'เพลงลาว':'อื่น ๆ'}</span><span class="track-duration"><span>${escapeHtml(track.duration)}</span></span>
    <div class="waveform" data-waveform="${track.index}" style="--progress:0%" aria-hidden="true">${Array.from({length:112},(_,i)=>`<i style="--wave:${18+((i*37+track.index*23+(i%7)*19)%76)}%;--delay:${(i%9)*.04}s"></i>`).join('')}</div>
    ${track.fileUrl?`<a class="download" href="/api/tracks/${encodeURIComponent(track.id)}/download" download="${escapeHtml(track.fileName)}" aria-label="ดาวน์โหลดเพลง" title="ดาวน์โหลด" data-download="${track.index}">⇩</a><button class="share-button" type="button" aria-label="แชร์ลิงก์ดาวน์โหลดเพลง" title="แชร์ลิงก์ดาวน์โหลด" data-share="${track.index}">↗</button>`:'<span class="download unavailable" aria-label="ไม่มีไฟล์ดาวน์โหลด">—</span>'}
    <button class="favorite-button ${favorites.has(track.id||String(track.index))?'favorited':''}" data-favorite="${track.index}" aria-label="เพิ่มเพลงโปรด">★</button>
    ${localAdminView&&track.fileUrl?`<button class="move-button" data-move="${track.index}" aria-label="ย้ายไป${track.collection==='credit'?'รีมิกซ์':'ซาวด์เครดิต'}" title="ย้ายไป${track.collection==='credit'?'รีมิกซ์':'ซาวด์เครดิต'}">⇄</button><button class="edit-button" data-edit="${track.index}" aria-label="แก้ไขชื่อเพลง" title="แก้ไขชื่อเพลง">✎</button><button class="delete-button" data-delete="${track.index}" aria-label="ลบเพลง" title="ลบเพลง">⌫</button>`:''}
  </article>`).join('');
  document.querySelector('#empty-state').hidden=folderMode||visible.length>0;
  count.textContent=String(tracks.length).padStart(2,'0');
  document.querySelector('#catalog-count').textContent=visible.length;
}
renderTracks();
fetch('/api/tracks').then(response=>response.ok?response.json():[]).then(saved=>{
  if(!Array.isArray(saved))return;
  tracks.unshift(...saved.map(track=>({...track,cover:'NEW',coverClass:'uploaded'})));
  renderTracks(currentFilter());
}).catch(()=>{});
if(location.protocol!=='file:'){
  const refreshVisitorCount=()=>fetch('/api/visit',{cache:'no-store'}).then(response=>response.json()).then(data=>{document.querySelector('#visitor-count').textContent=Number(data.visitors||0).toLocaleString();}).catch(()=>{});
  const refreshOnlineCount=()=>fetch('/api/presence',{cache:'no-store'}).then(response=>response.json()).then(data=>{document.querySelector('#online-count').textContent=Number(data.online||0).toLocaleString();}).catch(()=>{});
  refreshVisitorCount().then(refreshOnlineCount);setInterval(()=>{refreshVisitorCount();refreshOnlineCount();},15000);
  let siteVersion=null;
  const checkForSiteUpdate=()=>fetch('/api/version',{cache:'no-store'}).then(response=>response.json()).then(data=>{if(siteVersion===null)siteVersion=data.version;else if(data.version!==siteVersion)location.reload();}).catch(()=>{});
  checkForSiteUpdate();setInterval(checkForSiteUpdate,5000);
}
document.querySelector('#genre-filter').addEventListener('change',()=>renderTracks());
document.querySelectorAll('.category-link').forEach(button=>button.addEventListener('click',()=>{selectedCollection=button.dataset.collection;selectedFolderId=null;renderTracks();}));
folderBrowser.addEventListener('click',async event=>{const share=event.target.closest('[data-folder-share]');if(share){const folderName=share.dataset.folderName||'เพลง Set',shareUrl=new URL(`/api/folders/${encodeURIComponent(share.dataset.folderShare)}/download`,location.href).href;try{if(navigator.share)await navigator.share({title:`เพลง Set ${folderName} — LAOS REMIX`,text:`ดาวน์โหลดเพลง Set ${folderName} สำหรับสมาชิกกลุ่ม LAOS REMIX`,url:shareUrl});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareUrl);window.alert('คัดลอกลิงก์ดาวน์โหลดเพลง Set แล้ว');}else window.prompt('คัดลอกลิงก์ดาวน์โหลดเพลง Set นี้',shareUrl);}catch(error){if(error.name!=='AbortError')window.prompt('คัดลอกลิงก์ดาวน์โหลดเพลง Set นี้',shareUrl);}return;}const archive=event.target.closest('[data-folder-download]');if(archive){setTimeout(()=>fetch('/api/tracks').then(response=>response.json()).then(saved=>{const latest=new Map(saved.map(item=>[item.id,Number(item.downloads)||0]));tracks.forEach(track=>{if(track.id&&latest.has(track.id))track.downloads=latest.get(track.id);});renderTracks();}).catch(()=>{}),900);return;}const card=event.target.closest('[data-folder-id]');if(card){selectedFolderId=card.dataset.folderId;renderTracks();return;}if(event.target.closest('[data-folder-back]')){selectedFolderId=null;renderTracks();}});
document.querySelector('#sort-order').addEventListener('change',()=>renderTracks());
document.querySelector('#highlights-toggle').addEventListener('change',()=>renderTracks());
document.querySelector('#show-favorites').addEventListener('click',event=>{favoritesOnly=!favoritesOnly;event.currentTarget.classList.toggle('active',favoritesOnly);renderTracks();});
document.querySelector('#toggle-filters').addEventListener('click',event=>{filtersOpen=!filtersOpen;document.querySelector('.catalog-filters').hidden=!filtersOpen;event.currentTarget.classList.toggle('active',!filtersOpen);});
function formatClock(seconds){return Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'0:00';}
function updateWaveform(trackIndex,progress){const waveform=document.querySelector(`[data-waveform="${trackIndex}"]`);if(!waveform)return;const percent=Math.max(0,Math.min(1,progress));waveform.style.setProperty('--progress',`${percent*100}%`);waveform.classList.add('playing');const played=Math.floor(percent*waveform.children.length);Array.from(waveform.children).forEach((bar,index)=>bar.classList.toggle('played',index<played));}
function nextTrackIndex(){
  if(shuffleEnabled&&tracks.length>1){let next=currentTrackIndex;while(next===currentTrackIndex)next=Math.floor(Math.random()*tracks.length);return next;}
  return currentTrackIndex+1;
}
function setCurrent(index,autoplay=true){
  if(!tracks.length)return;
  currentTrackIndex=(index+tracks.length)%tracks.length;const track=tracks[currentTrackIndex];
  document.querySelector('#np-title').textContent=track.title;document.querySelector('#np-artist').textContent=track.artist;document.querySelector('#np-cover').textContent=track.cover||'LR';
  document.querySelector('#np-like').classList.toggle('favorited',favorites.has(track.id||String(currentTrackIndex)));
  if(activeAudio){activeAudio.pause();activeAudio=null;}
  if(track.fileUrl){const playingIndex=currentTrackIndex,audio=activeAudio=new Audio(track.fileUrl);audio.volume=playerVolume;audio.addEventListener('timeupdate',()=>{if(activeAudio!==audio)return;document.querySelector('#np-current').textContent=formatClock(audio.currentTime);document.querySelector('#np-seek').value=audio.duration?audio.currentTime/audio.duration*100:0;if(audio.duration)updateWaveform(playingIndex,audio.currentTime/audio.duration);});audio.addEventListener('loadedmetadata',()=>{if(activeAudio!==audio)return;document.querySelector('#np-duration').textContent=formatClock(audio.duration);document.querySelector('#np-seek').value=audio.duration?audio.currentTime/audio.duration*100:0;updateWaveform(playingIndex,audio.duration?audio.currentTime/audio.duration:0);});audio.addEventListener('ended',()=>{if(activeAudio===audio)setCurrent(nextTrackIndex());});if(autoplay)audio.play();}
  else {document.querySelector('#np-current').textContent='0:00';document.querySelector('#np-duration').textContent=track.duration||'0:00';document.querySelector('#np-seek').value=0;}
  document.querySelector('#np-play').textContent=track.fileUrl&&autoplay?'Ⅱ':'▶';renderTracks();
}
list.addEventListener('click',async event=>{
  const shareButton=event.target.closest('[data-share]');if(shareButton){const index=Number(shareButton.dataset.share),track=tracks[index],shareUrl=new URL(`/api/tracks/${encodeURIComponent(track.id)}/download`,location.href).href;try{if(navigator.share)await navigator.share({title:track.title,text:`ดาวน์โหลดเพลง ${track.title} สำหรับสมาชิกกลุ่ม LAOS REMIX`,url:shareUrl});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareUrl);window.alert('คัดลอกลิงก์ดาวน์โหลดเพลงแล้ว');}else window.prompt('คัดลอกลิงก์ดาวน์โหลดเพลงนี้',shareUrl);}catch(error){if(error.name!=='AbortError')window.prompt('คัดลอกลิงก์ดาวน์โหลดเพลงนี้',shareUrl);}return;}
  const downloadLink=event.target.closest('[data-download]');if(downloadLink){setTimeout(()=>fetch('/api/tracks').then(response=>response.json()).then(saved=>{const latest=new Map(saved.map(item=>[item.id,Number(item.downloads)||0]));tracks.forEach(track=>{if(track.id&&latest.has(track.id))track.downloads=latest.get(track.id);});renderTracks();}).catch(()=>{}),800);return;}
  const favoriteButton=event.target.closest('[data-favorite]');if(favoriteButton){const index=Number(favoriteButton.dataset.favorite),track=tracks[index],key=track.id||String(index);favorites.has(key)?favorites.delete(key):favorites.add(key);localStorage.setItem('laos-remix-favorites',JSON.stringify([...favorites]));renderTracks();return;}
  const moveButton=event.target.closest('[data-move]');if(moveButton){const index=Number(moveButton.dataset.move),track=tracks[index],collection=track.collection==='credit'?'remix':'credit',destination=collection==='credit'?'ซาวด์เครดิต':'รีมิกซ์';try{const response=await fetch(`/api/tracks/${encodeURIComponent(track.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({collection})});const result=await response.json();if(!response.ok)throw new Error(result.error||'ย้ายเพลงไม่สำเร็จ');tracks[index].collection=result.track.collection;renderTracks();window.alert(`ย้ายเพลง “${track.title}” ไป${destination}แล้ว`);}catch(error){window.alert(error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');}return;}
  const editButton=event.target.closest('[data-edit]');if(editButton){const index=Number(editButton.dataset.edit),track=tracks[index],title=window.prompt('แก้ไขชื่อเพลง',track.title);if(title===null)return;const newTitle=title.trim();if(!newTitle){window.alert('กรุณากรอกชื่อเพลง');return;}try{const response=await fetch(`/api/tracks/${encodeURIComponent(track.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:newTitle})});const result=await response.json();if(!response.ok)throw new Error(result.error||'แก้ไขชื่อเพลงไม่สำเร็จ');tracks[index].title=result.track.title;if(currentTrackIndex===index)document.querySelector('#np-title').textContent=result.track.title;renderTracks();}catch(error){window.alert(error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');}return;}
  const deleteButton=event.target.closest('[data-delete]');if(deleteButton){const index=Number(deleteButton.dataset.delete),track=tracks[index];if(!window.confirm(`ลบเพลง “${track.title}” และไฟล์เสียงออกจากเว็บใช่ไหม? การลบนี้ย้อนกลับไม่ได้`))return;try{const response=await fetch(`/api/tracks/${encodeURIComponent(track.id)}`,{method:'DELETE'});const result=await response.json();if(!response.ok)throw new Error(result.error||'ลบเพลงไม่สำเร็จ');favorites.delete(track.id);localStorage.setItem('laos-remix-favorites',JSON.stringify([...favorites]));if(currentTrackIndex===index){activeAudio?.pause();activeAudio=null;currentTrackIndex=-1;document.querySelector('#np-title').textContent='เลือกเพลงที่อยากฟัง';document.querySelector('#np-artist').textContent='LAOS REMIX';document.querySelector('#np-current').textContent='0:00';document.querySelector('#np-duration').textContent='0:00';document.querySelector('#np-seek').value=0;document.querySelector('#np-play').textContent='▶';}else if(currentTrackIndex>index)currentTrackIndex--;tracks.splice(index,1);renderTracks();}catch(error){window.alert(error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');}return;}
  const button=event.target.closest('[data-play]');if(!button)return;
  const index=Number(button.dataset.play),track=tracks[index];
  if(currentTrackIndex===index&&activeAudio){if(activeAudio.paused){activeAudio.play();document.querySelector('#np-play').textContent='Ⅱ';}else{activeAudio.pause();document.querySelector('#np-play').textContent='▶';}renderTracks();}
  else setCurrent(index,true);
});
document.querySelector('#np-play').addEventListener('click',()=>{if(currentTrackIndex<0){setCurrent(0,true);return;}const track=tracks[currentTrackIndex];if(!track.fileUrl)return;if(activeAudio?.paused){activeAudio.play();document.querySelector('#np-play').textContent='Ⅱ';}else if(activeAudio){activeAudio.pause();document.querySelector('#np-play').textContent='▶';}else setCurrent(currentTrackIndex,true);renderTracks();});
document.querySelector('#np-prev').addEventListener('click',()=>setCurrent(currentTrackIndex-1,true));
document.querySelector('#np-next').addEventListener('click',()=>setCurrent(nextTrackIndex(),true));
document.querySelector('#np-shuffle').addEventListener('click',event=>{shuffleEnabled=!shuffleEnabled;event.currentTarget.classList.toggle('active',shuffleEnabled);event.currentTarget.setAttribute('aria-pressed',String(shuffleEnabled));});
document.querySelector('#np-seek').addEventListener('input',event=>{if(activeAudio?.duration)activeAudio.currentTime=Number(event.target.value)/100*activeAudio.duration;});
function setPlayerVolume(value){playerVolume=Math.max(0,Math.min(1,Number(value)));document.querySelector('#np-volume').value=playerVolume;if(activeAudio)activeAudio.volume=playerVolume;localStorage.setItem('laos-remix-volume',String(playerVolume));}
document.querySelector('#np-volume').addEventListener('input',event=>setPlayerVolume(event.target.value));
document.querySelector('#np-volume-down').addEventListener('click',()=>setPlayerVolume(playerVolume-0.1));
document.querySelector('#np-volume-up').addEventListener('click',()=>setPlayerVolume(playerVolume+0.1));
document.querySelector('#np-volume-toggle').addEventListener('click',event=>{const open=document.querySelector('#np-volume-control').classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(open));});
document.addEventListener('click',event=>{if(!event.target.closest('#np-volume-control')){document.querySelector('#np-volume-control').classList.remove('open');document.querySelector('#np-volume-toggle').setAttribute('aria-expanded','false');}});
document.querySelector('#np-like').addEventListener('click',()=>{if(currentTrackIndex<0)return;const track=tracks[currentTrackIndex],key=track.id||String(currentTrackIndex);favorites.has(key)?favorites.delete(key):favorites.add(key);localStorage.setItem('laos-remix-favorites',JSON.stringify([...favorites]));document.querySelector('#np-like').classList.toggle('favorited',favorites.has(key));renderTracks();});
