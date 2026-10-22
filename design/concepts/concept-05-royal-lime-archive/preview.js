(() => {
  const P=window.ArchivePrototype;
  P.preview={init(){
    const panel=document.querySelector('#tweaks-panel');
    panel.innerHTML=`<div class="tweaks-heading"><div><p class="eyebrow">原型审阅</p><h2 id="tweaks-title">调整预览</h2></div><button type="button" class="button button-secondary" data-tweaks-close>关闭</button></div>
      <p class="preview-note">以下设置用于查看界面状态，所有操作仅作用于本地示例。</p>
      <label>信息密度<select id="preview-density"><option value="compact">紧凑</option><option value="balanced" selected>均衡</option><option value="airy">留白</option></select></label>
      <label class="preview-check"><input type="checkbox" id="preview-motion" checked>启用界面动效</label>
      <label class="preview-check"><input type="checkbox" id="preview-map">模拟地图加载失败</label>
      <label class="preview-check"><input type="checkbox" id="preview-save">模拟保存失败</label>
      <label>EXIF 演示状态<select id="preview-exif"><option value="success">读取成功</option><option value="loading">读取中</option><option value="empty">无数据</option><option value="error">读取失败</option></select></label>
      <p class="preview-note">EXIF 使用演示数据，不会分析所选文件。关闭此面板后继续操作。</p>`;
    const trigger=document.querySelector('[data-tweaks-open]');
    trigger.addEventListener('click',()=>panel.showModal());
    panel.querySelector('[data-tweaks-close]').addEventListener('click',()=>panel.close());
    panel.addEventListener('close',()=>trigger.focus({preventScroll:true}));
    const bind=(id,key,checkbox=false)=>panel.querySelector(id).addEventListener('change',e=>{
      P.settings[key]=checkbox?e.target.checked:e.target.value;
      document.documentElement.dataset.density=P.settings.density;
      document.documentElement.dataset.motion=P.settings.motion?'on':'off';
      document.dispatchEvent(new CustomEvent('prototype-settings',{detail:{key,value:P.settings[key]}}));
    });
    bind('#preview-density','density');bind('#preview-motion','motion',true);bind('#preview-map','mapFailure',true);bind('#preview-save','saveFailure',true);bind('#preview-exif','exif');
  }};
})();
