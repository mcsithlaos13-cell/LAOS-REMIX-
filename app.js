const seedTracks = [
  {id:'sample-1',title:'ใจสั่งมา (LAO REMIX)',artist:'DJ Noy · Vientiane',genre:'remix',duration:'3:42',cover:'LR',coverClass:'c1',highlight:true},
  {id:'sample-2',title:'ຄິດຮອດເດ (คิดฮอดเด้) — Bass Remix',artist:'DJ Xai · Savannakhet',genre:'lao',duration:'4:18',cover:'ລາວ',coverClass:'c2'},
  {id:'sample-3',title:'สาวลาวเวียงจันทน์ (รถแห่ Remix)',artist:'DJ Bank · Laos',genre:'remix',duration:'3:56',cover:'BASS',coverClass:'c3',highlight:true},
  {id:'sample-4',title:'ບ່າວລາວສາວໄທ (Baow Lao)',artist:'Khamla · Luang Prabang',genre:'lao',duration:'4:05',cover:'ດົນຕີ',coverClass:'c4'}
];
const tracks = [...seedTracks];
let selectedFile = null;
let activeUrl = null;
let activeAudio = null;
let currentTrackIndex = -1;
let favorites = new Set(JSON.parse(localStorage.getItem('laos-remix-favorites') || '[]'));
let favoritesOnly = false;
let filtersOpen = true;
const list = document.querySelector('#track-list');
const count = document.querySelector('#song-count');
const formMessage = document.querySelector('#form-message');
const fileInput = document.querySelector('#audio-file');
const filePreview = document.querySelector('#file-preview');
const dropzone = document.querySelector('#dropzone');
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatDuration = seconds => { if (!Number.isFinite(seconds)) return '—:—'; const min=Math.floor(seconds/60), sec=Math.floor(seconds%60); return `${min}:${String(sec).padStart(2,'0')}`; };
const currentFilter=()=>document.querySelector('#genre-filter')?.value||'all';
function renderTracks(filter=currentFilter()) {
  const order=document.querySelector('#sort-order')?.value||'staff';
  let visible=tracks.map((track,index)=>({...track,index})).filter(track=>(filter==='all'||track.genre===filter)&&(!favoritesOnly||favorites.has(track.id||String(track.index)))&&(!document.querySelector('#highlights-toggle')?.checked||track.highlight||track.genre==='remix'));
  if(order==='title')visible.sort((a,b)=>a.title.localeCompare(b.title));
  if(order==='newest')visible.sort((a,b)=>b.index-a.index);
  list.innerHTML = visible.map((track,position)=>`<article class="track ${currentTrackIndex===track.index?'is-current':''}">
    <span class="track-number">${String(position+1).padStart(2,'0')}</span><span class="cover ${track.coverClass||'uploaded'}">${escapeHtml(track.cover||'LR')}</span>
    <button class="play-button" aria-label="เล่น ${escapeHtml(track.title)}" data-play="${track.index}">${currentTrackIndex===track.index&&activeAudio&&!activeAudio.paused?'Ⅱ':'▶'}</button>
    <span class="track-info"><strong>${escapeHtml(track.title)} ${track.highlight?'<em class="new-badge">NEW</em>':''}</strong><span>${escapeHtml(track.artist)}</span></span>
    <span class="tag">${track.genre==='lao'?'เพลงลาว':track.genre==='remix'?'รีมิกซ์':'เพลงใหม่'}</span><span class="track-duration">${escapeHtml(track.duration)}</span>
    <div class="waveform" aria-hidden="true">${Array.from({length:112},(_,i)=>`<i style="--wave:${18+((i*37+track.index*23+(i%7)*19)%76)}%;--delay:${(i%9)*.04}s"></i>`).join('')}</div>
    ${track.fileUrl?`<a class="download" href="${track.fileUrl}" download="${escapeHtml(track.fileName)}" aria-label="ดาวน์โหลดเพลง">⇩</a>`:'<a class="download" href="#upload" aria-label="ส่งเพลง">⇩</a>'}
    <button class="favorite-button ${favorites.has(track.id||String(track.index))?'favorited':''}" data-favorite="${track.index}" aria-label="เพิ่มเพลงโปรด">★</button><button class="more-button" data-more="${track.index}" aria-label="เพิ่มเติม">⋮</button>
  </article>`).join('');
  document.querySelector('#empty-state').hidden=visible.length>0;
  count.textContent=String(tracks.length).padStart(2,'0');
  document.querySelector('#catalog-count').textContent=visible.length;
}
renderTracks();
fetch('/api/tracks').then(response=>response.ok?response.json():[]).then(saved=>{
  if(!Array.isArray(saved))return;
  tracks.unshift(...saved.map(track=>({...track,cover:'NEW',coverClass:'uploaded'})));
  renderTracks(currentFilter());
}).catch(()=>{});
document.querySelector('#genre-filter').addEventListener('change',()=>renderTracks());
document.querySelector('#sort-order').addEventListener('change',()=>renderTracks());
document.querySelector('#highlights-toggle').addEventListener('change',()=>renderTracks());
document.querySelector('#show-favorites').addEventListener('click',event=>{favoritesOnly=!favoritesOnly;event.currentTarget.classList.toggle('active',favoritesOnly);renderTracks();});
document.querySelector('#toggle-filters').addEventListener('click',event=>{filtersOpen=!filtersOpen;document.querySelector('.catalog-filters').hidden=!filtersOpen;event.currentTarget.classList.toggle('active',!filtersOpen);});
function setFile(file){
  if(!file)return;
  if(!file.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)){formMessage.textContent='กรุณาเลือกไฟล์เสียง เช่น MP3 หรือ WAV';return;}
  if(file.size>50*1024*1024){formMessage.textContent='ไฟล์มีขนาดเกิน 50 MB';return;}
  selectedFile=file;formMessage.textContent='';
  filePreview.hidden=false;filePreview.textContent=`✓  ${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;
  document.querySelector('#track-title').value=document.querySelector('#track-title').value||file.name.replace(/\.[^.]+$/,'');
}
fileInput.addEventListener('change',()=>setFile(fileInput.files[0]));
['dragenter','dragover'].forEach(event=>dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.add('dragover');}));
['dragleave','drop'].forEach(event=>dropzone.addEventListener(event,e=>{e.preventDefault();dropzone.classList.remove('dragover');if(event==='drop')setFile(e.dataTransfer.files[0]);}));
document.querySelector('#upload-form').addEventListener('submit',async event=>{
  event.preventDefault();formMessage.textContent='';
  if(!selectedFile){formMessage.textContent='เลือกไฟล์เพลงก่อนอัปโหลดนะ';return;}
  const title=document.querySelector('#track-title').value.trim(),artist=document.querySelector('#artist').value.trim(),genre=document.querySelector('#genre').value;
  if(!title||!artist){formMessage.textContent='กรอกชื่อเพลงและศิลปินให้ครบ';return;}
  const submitButton=event.target.querySelector('.submit-button');submitButton.disabled=true;submitButton.textContent='กำลังอัปโหลด…';
  try{
    const body=new FormData();body.append('audio',selectedFile);body.append('title',title);body.append('artist',artist);body.append('genre',genre);
    const response=await fetch('/api/tracks',{method:'POST',body});const result=await response.json();
    if(!response.ok)throw new Error(result.error||'อัปโหลดไม่สำเร็จ');
    tracks.unshift({...result.track,cover:'NEW',coverClass:'uploaded'});
    renderTracks(currentFilter());
    formMessage.textContent='บันทึกเพลงและไฟล์เรียบร้อยแล้ว';event.target.reset();selectedFile=null;fileInput.value='';filePreview.hidden=true;filePreview.textContent='';
  }catch(error){formMessage.textContent=error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';}
  finally{submitButton.disabled=false;submitButton.innerHTML='อัปโหลดเพลง <span>↗</span>';}
});
function formatClock(seconds){return Number.isFinite(seconds)?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'0:00';}
function setCurrent(index,autoplay=true){
  if(!tracks.length)return;
  currentTrackIndex=(index+tracks.length)%tracks.length;const track=tracks[currentTrackIndex];
  document.querySelector('#np-title').textContent=track.title;document.querySelector('#np-artist').textContent=track.artist;document.querySelector('#np-cover').textContent=track.cover||'LR';
  document.querySelector('#np-like').classList.toggle('favorited',favorites.has(track.id||String(currentTrackIndex)));
  if(activeAudio){activeAudio.pause();activeAudio=null;}
  if(track.fileUrl){activeAudio=new Audio(track.fileUrl);activeAudio.volume=Number(document.querySelector('#np-volume').value);if(autoplay)activeAudio.play();activeAudio.addEventListener('timeupdate',()=>{document.querySelector('#np-current').textContent=formatClock(activeAudio.currentTime);document.querySelector('#np-seek').value=activeAudio.duration?activeAudio.currentTime/activeAudio.duration*100:0;});activeAudio.addEventListener('loadedmetadata',()=>document.querySelector('#np-duration').textContent=formatClock(activeAudio.duration));activeAudio.addEventListener('ended',()=>setCurrent(currentTrackIndex+1));}
  else {document.querySelector('#np-current').textContent='0:00';document.querySelector('#np-duration').textContent=track.duration||'0:00';document.querySelector('#np-seek').value=0;}
  document.querySelector('#np-play').textContent=track.fileUrl&&autoplay?'Ⅱ':'▶';renderTracks();
}
list.addEventListener('click',event=>{
  const favoriteButton=event.target.closest('[data-favorite]');if(favoriteButton){const index=Number(favoriteButton.dataset.favorite),track=tracks[index],key=track.id||String(index);favorites.has(key)?favorites.delete(key):favorites.add(key);localStorage.setItem('laos-remix-favorites',JSON.stringify([...favorites]));renderTracks();return;}
  const more=event.target.closest('[data-more]');if(more){const track=tracks[Number(more.dataset.more)];if(track.fileUrl){const link=document.createElement('a');link.href=track.fileUrl;link.download=track.fileName;link.click();}else document.querySelector('#upload').scrollIntoView({behavior:'smooth'});return;}
  const button=event.target.closest('[data-play]');if(!button)return;
  const index=Number(button.dataset.play),track=tracks[index];
  if(currentTrackIndex===index&&activeAudio){if(activeAudio.paused){activeAudio.play();document.querySelector('#np-play').textContent='Ⅱ';}else{activeAudio.pause();document.querySelector('#np-play').textContent='▶';}renderTracks();}
  else setCurrent(index,true);
});
document.querySelector('#np-play').addEventListener('click',()=>{if(currentTrackIndex<0){setCurrent(0,true);return;}const track=tracks[currentTrackIndex];if(!track.fileUrl)return;if(activeAudio?.paused){activeAudio.play();document.querySelector('#np-play').textContent='Ⅱ';}else if(activeAudio){activeAudio.pause();document.querySelector('#np-play').textContent='▶';}else setCurrent(currentTrackIndex,true);renderTracks();});
document.querySelector('#np-prev').addEventListener('click',()=>setCurrent(currentTrackIndex-1,true));
document.querySelector('#np-next').addEventListener('click',()=>setCurrent(currentTrackIndex+1,true));
document.querySelector('#np-seek').addEventListener('input',event=>{if(activeAudio?.duration)activeAudio.currentTime=Number(event.target.value)/100*activeAudio.duration;});
document.querySelector('#np-volume').addEventListener('input',event=>{if(activeAudio)activeAudio.volume=Number(event.target.value);});
document.querySelector('#np-like').addEventListener('click',()=>{if(currentTrackIndex<0)return;const track=tracks[currentTrackIndex],key=track.id||String(currentTrackIndex);favorites.has(key)?favorites.delete(key):favorites.add(key);localStorage.setItem('laos-remix-favorites',JSON.stringify([...favorites]));document.querySelector('#np-like').classList.toggle('favorited',favorites.has(key));renderTracks();});
