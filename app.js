const seedTracks = [
  {title:'ใจสั่งมา (LAO REMIX)',artist:'DJ Noy · Vientiane',genre:'remix',duration:'3:42',cover:'LR',coverClass:'c1'},
  {title:'ຄິດຮອດເດ (คิดฮอดเด้) — Bass Remix',artist:'DJ Xai · Savannakhet',genre:'lao',duration:'4:18',cover:'ລາວ',coverClass:'c2'},
  {title:'สาวลาวเวียงจันทน์ (รถแห่ Remix)',artist:'DJ Bank · Laos',genre:'remix',duration:'3:56',cover:'BASS',coverClass:'c3'},
  {title:'ບ່າວລາວສາວໄທ (Baow Lao)',artist:'Khamla · Luang Prabang',genre:'lao',duration:'4:05',cover:'ດົນຕີ',coverClass:'c4'}
];
const tracks = [...seedTracks];
let selectedFile = null;
let activeUrl = null;
let activeAudio = null;
const list = document.querySelector('#track-list');
const count = document.querySelector('#song-count');
const formMessage = document.querySelector('#form-message');
const fileInput = document.querySelector('#audio-file');
const filePreview = document.querySelector('#file-preview');
const dropzone = document.querySelector('#dropzone');
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const formatDuration = seconds => { if (!Number.isFinite(seconds)) return '—:—'; const min=Math.floor(seconds/60), sec=Math.floor(seconds%60); return `${min}:${String(sec).padStart(2,'0')}`; };
function renderTracks(filter='all') {
  const visible = tracks.map((track,index)=>({...track,index})).filter(track=>filter==='all'||track.genre===filter);
  list.innerHTML = visible.map((track,position)=>`<article class="track">
    <span class="track-number">${String(position+1).padStart(2,'0')}</span><span class="cover ${track.coverClass||'uploaded'}">${escapeHtml(track.cover||'LR')}</span>
    <span class="track-info"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></span>
    <span class="tag">${track.genre==='lao'?'เพลงลาว':track.genre==='remix'?'รีมิกซ์':'เพลงใหม่'}</span>
    <span class="track-duration">${escapeHtml(track.duration)}</span>
    ${track.fileUrl?`<button class="play-button" aria-label="เล่น ${escapeHtml(track.title)}" data-play="${track.index}">▶</button>`:`<span class="play-button" aria-hidden="true">▶</span>`}
    ${track.fileUrl?`<a class="download" href="${track.fileUrl}" download="${escapeHtml(track.fileName)}">ดาวน์โหลด</a>`:'<a class="download" href="#upload">ส่งเพลง</a>'}
  </article>`).join('');
  document.querySelector('#empty-state').hidden=visible.length>0;
  count.textContent=String(tracks.length).padStart(2,'0');
}
renderTracks();
fetch('/api/tracks').then(response=>response.ok?response.json():[]).then(saved=>{
  if(!Array.isArray(saved))return;
  tracks.unshift(...saved.map(track=>({...track,cover:'NEW',coverClass:'uploaded'})));
  renderTracks(document.querySelector('.filter.active')?.dataset.filter||'all');
}).catch(()=>{});
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{document.querySelector('.filter.active')?.classList.remove('active');button.classList.add('active');renderTracks(button.dataset.filter);}));
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
    renderTracks(document.querySelector('.filter.active')?.dataset.filter||'all');
    formMessage.textContent='บันทึกเพลงและไฟล์เรียบร้อยแล้ว';event.target.reset();selectedFile=null;fileInput.value='';filePreview.hidden=true;filePreview.textContent='';
  }catch(error){formMessage.textContent=error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';}
  finally{submitButton.disabled=false;submitButton.innerHTML='อัปโหลดเพลง <span>↗</span>';}
});
list.addEventListener('click',event=>{
  const button=event.target.closest('[data-play]');if(!button)return;
  const track=tracks[Number(button.dataset.play)];if(!track?.fileUrl)return;
  if(activeAudio&&!activeAudio.paused&&activeAudio.src===track.fileUrl){activeAudio.pause();activeAudio=null;button.textContent='▶';button.classList.remove('playing');return;}
  if(activeAudio){activeAudio.pause();document.querySelectorAll('.play-button.playing').forEach(item=>{item.classList.remove('playing');item.textContent='▶';});}
  activeAudio=new Audio(track.fileUrl);activeAudio.play();button.textContent='Ⅱ';button.classList.add('playing');activeAudio.addEventListener('ended',()=>{button.textContent='▶';button.classList.remove('playing');activeAudio=null;},{once:true});
});
