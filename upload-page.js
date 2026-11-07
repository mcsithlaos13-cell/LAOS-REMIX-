let selectedFiles=[];
const form=document.querySelector('#upload-form');
const fileInput=document.querySelector('#audio-file');
const folderInput=document.querySelector('#folder-file');
const dropzone=document.querySelector('#dropzone');
const preview=document.querySelector('#file-preview');
const message=document.querySelector('#form-message');
const titleInput=document.querySelector('#track-title');
const collectionInput=document.querySelector('#collection');
const folderNameRow=document.querySelector('#folder-name-row');
const folderNameInput=document.querySelector('#folder-name');
const overlay=document.querySelector('#upload-overlay');
const statusIcon=document.querySelector('#upload-status-icon');
const statusTitle=document.querySelector('#upload-status-title');
const statusText=document.querySelector('#upload-status-text');
const progress=document.querySelector('#upload-status-progress');
const closeButton=document.querySelector('#upload-status-close');
const audioExtension=/\.(mp3|wav|m4a|ogg|opus|aac|flac)$/i;
let uploadSucceeded=false;
function classifyFile(file,collectionMode,genreMode){
  const label=(file.webkitRelativePath||file.name).toLowerCase();
  const collection=collectionMode==='auto'?( /เครดิต|credit|sound[\s_-]*credit/i.test(label)?'credit':'remix' ):collectionMode;
  const genre=genreMode==='auto'?( /ລາວ|ลาว|\blao(?:s)?\b/i.test(label)?'lao':'other' ):genreMode;
  return {collection,genre};
}

function chooseFiles(files){
  const all=[...files];if(!all.length)return;
  const chosen=all.filter(file=>audioExtension.test(file.name));
  if(!chosen.length){message.textContent='ไม่พบไฟล์เพลงที่รองรับในรายการที่เลือก';return;}
  const oversized=chosen.find(file=>file.size>50*1024*1024);
  if(oversized){message.textContent=`${oversized.name} มีขนาดเกิน 50 MB`;return;}
  selectedFiles=chosen;message.textContent=all.length>chosen.length?`ข้ามไฟล์ที่ไม่ใช่เพลง ${all.length-chosen.length} ไฟล์`:'';
  preview.hidden=false;
  const total=chosen.reduce((sum,file)=>sum+file.size,0);
  preview.textContent=`✓  เลือก ${chosen.length} เพลง · ${(total/1024/1024).toFixed(1)} MB รวม · แต่ละไฟล์จะเป็นรายการแยก`;
  titleInput.required=chosen.length===1;titleInput.disabled=chosen.length>1;
  titleInput.placeholder=chosen.length>1?'ใช้ชื่อไฟล์ของแต่ละเพลงเป็นหัวข้อ':'เช่น ใจสั่งมา (Remix)';
  if(chosen.length===1&&!titleInput.value)titleInput.value=chosen[0].name.replace(/\.[^.]+$/,'');
  if(chosen.length>1)titleInput.value='';
  updateFolderField();
}
function updateFolderField(){
  const useFolder=collectionInput.value==='folder';folderNameRow.hidden=!useFolder;
  if(useFolder&&!folderNameInput.value){const root=selectedFiles[0]?.webkitRelativePath?.split('/')[0];folderNameInput.value=root||(selectedFiles.length>1?'อัปโหลดหลายเพลง':titleInput.value.trim());}
}
fileInput.addEventListener('change',()=>chooseFiles(fileInput.files));
folderInput.addEventListener('change',()=>chooseFiles(folderInput.files));
document.querySelector('#folder-pick').addEventListener('click',()=>folderInput.click());
collectionInput.addEventListener('change',updateFolderField);
['dragenter','dragover'].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.add('dragover');}));
['dragleave','drop'].forEach(type=>dropzone.addEventListener(type,event=>{event.preventDefault();dropzone.classList.remove('dragover');if(type==='drop')chooseFiles(event.dataTransfer.files);}));
closeButton.addEventListener('click',()=>{if(uploadSucceeded){location.href='index.html#music';return;}overlay.hidden=true;document.body.classList.remove('uploading');});

form.addEventListener('submit',async event=>{
  event.preventDefault();message.textContent='';
  if(location.protocol==='file:'){message.textContent='กรุณาเปิดเว็บผ่าน http://localhost:3000 ก่อนอัปโหลด';return;}
  if(!selectedFiles.length){message.textContent='เลือกไฟล์เพลงหรือโฟลเดอร์ก่อนอัปโหลดนะ';return;}
  const title=titleInput.value.trim(),artist=document.querySelector('#artist').value.trim(),collectionMode=collectionInput.value,genreMode=document.querySelector('#genre').value;
  if((selectedFiles.length===1&&!title)||!artist){message.textContent=selectedFiles.length===1&&!title?'กรอกชื่อเพลงก่อนอัปโหลด':'กรอกชื่อศิลปินให้ครบ';return;}
  const submit=form.querySelector('.submit-button');submit.disabled=true;submit.textContent='กำลังอัปโหลด…';
  const folderRoots=[...new Set(selectedFiles.map(file=>file.webkitRelativePath?.split('/')[0]).filter(Boolean))];
  const customFolderName=collectionMode==='folder'?folderNameInput.value.trim():'';
  const folderName=customFolderName||folderRoots[0]||(selectedFiles.length>1?'อัปโหลดหลายเพลง':collectionMode==='folder'?title:'');
  const folderId=folderName?(crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`):'';
  let completed=0;uploadSucceeded=false;
  statusIcon.className='upload-status-icon is-loading';statusIcon.textContent='↥';statusTitle.textContent='กำลังอัปโหลดเพลง';statusText.textContent=`กำลังเตรียมอัปโหลด ${selectedFiles.length} เพลง กรุณารอสักครู่`;progress.hidden=false;closeButton.hidden=true;overlay.hidden=false;document.body.classList.add('uploading');
  try{
    for(let index=0;index<selectedFiles.length;index++){
      const file=selectedFiles[index],trackTitle=selectedFiles.length===1?title:file.name.replace(/\.[^.]+$/,'').slice(0,80);
      const {collection,genre}=classifyFile(file,collectionMode,genreMode),collectionLabel=collection==='credit'?'ซาวด์เครดิต':collection==='folder'?'เพลง Set':'รีมิกซ์',genreLabel=genre==='lao'?'เพลงลาว':'อื่น ๆ';
      statusText.textContent=`กำลังอัปโหลดเพลงที่ ${index+1} จาก ${selectedFiles.length}: ${trackTitle} · ${collectionLabel} · ${genreLabel}`;
      const body=new FormData();body.append('audio',file);body.append('title',trackTitle);body.append('artist',artist);body.append('collection',collection);body.append('genre',genre);if(folderId){body.append('folderId',folderId);body.append('folderName',folderName);}
      const response=await fetch('/api/tracks',{method:'POST',body});
      const responseText=await response.text();let result={};
      try{result=responseText?JSON.parse(responseText):{};}catch{throw new Error('เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ กรุณาลองใหม่');}
      if(!response.ok)throw new Error(result.error||`อัปโหลด ${trackTitle} ไม่สำเร็จ`);
      completed++;
    }
    message.textContent=`บันทึกเพลง ${completed} ไฟล์เรียบร้อยแล้ว`;
    uploadSucceeded=true;statusIcon.className='upload-status-icon is-success';statusIcon.textContent='✓';statusTitle.textContent='อัปโหลดสำเร็จแล้ว';statusText.textContent=`เพิ่มเพลง ${completed} เพลงลงใน LAOS REMIX เรียบร้อยแล้ว กำลังกลับหน้ารวมเพลง`;progress.hidden=true;closeButton.hidden=false;closeButton.textContent='กลับหน้าหลัก';setTimeout(()=>{location.href='index.html#music';},2500);
    form.reset();selectedFiles=[];fileInput.value='';folderInput.value='';titleInput.required=false;titleInput.disabled=false;titleInput.placeholder='เพลงเดี่ยว: พิมพ์ชื่อเพลง · หลายเพลง: ใช้ชื่อไฟล์';folderNameInput.value='';updateFolderField();preview.hidden=true;preview.textContent='';
  }catch(error){
    message.textContent=error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';statusIcon.className='upload-status-icon is-error';statusIcon.textContent='!';statusTitle.textContent=completed?`อัปโหลดได้ ${completed} เพลง`:'อัปโหลดไม่สำเร็จ';statusText.textContent=completed?`อัปโหลดได้ ${completed} เพลงแล้ว แต่ไฟล์ถัดไปไม่สำเร็จ: ${error.message}`:error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง';progress.hidden=true;closeButton.hidden=false;closeButton.textContent='ปิด';
  }finally{submit.disabled=false;submit.innerHTML='อัปโหลดเพลง <span>↗</span>';}
});

let currentVersion=null;
const refreshIfChanged=()=>fetch('/api/version',{cache:'no-store'}).then(response=>response.json()).then(data=>{if(currentVersion===null)currentVersion=data.version;else if(data.version!==currentVersion)location.reload();}).catch(()=>{});
refreshIfChanged();setInterval(refreshIfChanged,5000);
