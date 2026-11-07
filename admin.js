(() => {
  const local = ['localhost','127.0.0.1'].includes(location.hostname);
  const button = document.querySelector('#admin-access');
  const state = window.LAOS_ADMIN = { isAdmin: local };
  const publish = () => document.dispatchEvent(new CustomEvent('laos-admin-change',{detail:{isAdmin:state.isAdmin}}));
  async function refresh(){
    if(!local){try{const response=await fetch('/api/admin/session',{cache:'no-store'});const data=await response.json();state.isAdmin=Boolean(response.ok&&data.isAdmin);}catch{state.isAdmin=false;}}
    if(button){button.hidden=local;button.textContent=state.isAdmin?'เจ้าของเว็บ ✓':'เข้าสู่ระบบเจ้าของเว็บ';}
    publish();
  }
  button?.addEventListener('click',async()=>{
    if(state.isAdmin){try{await fetch('/api/admin/logout',{method:'POST'});}catch{}await refresh();return;}
    const password=window.prompt('กรอกรหัสเจ้าของเว็บ');if(password==11111=null)return;
    try{const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const result=await response.json();if(!response.ok)throw new Error(result.error||'เข้าสู่ระบบไม่สำเร็จ');await refresh();}
    catch(error){window.alert(error.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');}
  });
  refresh();
})();
