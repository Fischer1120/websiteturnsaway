import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import { markdownToHtml } from '../../functions/_shared/markdown.ts';

let editorSequence = 0;

function safeAddress(value, { image = false } = {}) {
  const address = String(value || '').trim();
  if (!address || /[\u0000-\u0020\u007f\\]/.test(address)) return '';
  if (/^https?:\/\//i.test(address)) {
    try {
      const url = new URL(address);
      return url.hostname && !url.username && !url.password ? address : '';
    } catch {
      return '';
    }
  }
  if (address.startsWith('/') && !address.startsWith('//')) return address;
  if (!image && /^#[^#\s]+$/.test(address)) return address;
  return '';
}

function sourceProtection(markdown) {
  // Leave unfamiliar syntax in the original source, where it can be edited without a lossy conversion.
  const source = String(markdown || '').replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '').replace(/`[^`\n]*`/g, '');
  if (/^---\s*\n[\s\S]*?\n---(?:\n|$)/.test(source)) return '正文含有文档属性';
  const htmlSource = source.replace(/<br\s*\/?>/gi, '');
  if (/<\/?[a-z][^>]*>|<!--[\s\S]*?-->/i.test(htmlSource)) return '正文含有 HTML';
  if (/^\s*[-+*]\s+\[[ xX]\]\s/m.test(source)) return '正文含有任务列表';
  if (/\[\^[^\]]+\]|^\s*\*\[[^\]]+\]:/m.test(source)) return '正文含有脚注或缩写定义';
  if (/^\s*(?:\${2}|:{3,}|\{[%#])/m.test(source) || /\$[^$\n]+\$/.test(source)) return '正文含有公式或扩展语法';
  if (/^\s*:[ \t]+\S/m.test(source) || /\{[.#][^}\n]+\}/.test(source)) return '正文含有扩展排版语法';
  return '';
}

function cleanPastedHtml(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR', 'HR', 'STRONG', 'B', 'EM', 'I', 'S', 'DEL', 'STRIKE', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
  document.querySelectorAll('script, style, iframe, object, embed, template, noscript, svg, math, meta, link, base').forEach((node) => node.remove());
  for (const node of [...document.body.querySelectorAll('*')]) {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    const attributes = {};
    if (node.tagName === 'A') attributes.href = safeAddress(node.getAttribute('href'));
    if (node.tagName === 'IMG') {
      attributes.src = safeAddress(node.getAttribute('src'), { image: true });
      attributes.alt = node.getAttribute('alt') || '';
      attributes.title = node.getAttribute('title') || '';
      if (!attributes.src) {
        node.replaceWith(document.createTextNode(attributes.alt));
        continue;
      }
    }
    if (node.tagName === 'OL' && /^\d+$/.test(node.getAttribute('start') || '')) attributes.start = node.getAttribute('start');
    for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
    for (const [name, value] of Object.entries(attributes)) if (value) node.setAttribute(name, value);
  }
  return document.body.innerHTML;
}

const SafeImage = Image.extend({
  addAttributes() {
    const parent = this.parent?.() || {};
    return {
      ...parent,
      src: {
        ...parent.src,
        parseHTML: (element) => safeAddress(element.getAttribute('src'), { image: true }),
        renderHTML: (attributes) => ({ src: safeAddress(attributes.src, { image: true }) }),
      },
    };
  },
  renderMarkdown(node) {
    const label = String(node.attrs?.alt || '').replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
    const title = String(node.attrs?.title || '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ');
    const address = String(node.attrs?.src || '').replace(/[()<>"\s]/g, (character) => encodeURIComponent(character));
    return `![${label}](${address}${title ? ` "${title}"` : ''})`;
  },
});

const icons = {
  bold: '<path d="M6 4h6a4 4 0 0 1 0 8H6zm0 8h7a4 4 0 0 1 0 8H6z"/>',
  italic: '<path d="M10 4h9M5 20h9M15 4 9 20"/>',
  strike: '<path d="M17 6c-1-1.5-2.5-2-5-2-3 0-5 1.5-5 4 0 1.5 1 2.5 3 3M7 18c1 1.5 2.5 2 5 2 3 0 5-1.5 5-4 0-1.5-1-2.5-3-3M3 12h18"/>',
  bulletList: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
  orderedList: '<path d="M10 6h10M10 12h10M10 18h10M3 4h2v5M3 9h4M3 14c0-2 4-2 4 0 0 1-4 3-4 4h4"/>',
  blockquote: '<path d="M10 6H4v7h6V6Zm10 0h-6v7h6V6ZM10 13c0 4-2 5-4 5m14-5c0 4-2 5-4 5"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  codeBlock: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m7 9 3 3-3 3m6 0h4"/>',
  link: '<path d="m10 13 4-4M8 15l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 2 1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-6 5 7"/>',
  horizontalRule: '<path d="M4 12h16"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16M15 4v16"/>',
  undo: '<path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v4"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
};

function toolButton(action, label, { shortcut = '', text = '', active = true } = {}) {
  const icon = icons[action];
  return `<button class="writing-tool" type="button" data-writing-action="${action}" aria-label="${label}" title="${label}${shortcut ? `（${shortcut}）` : ''}"${active ? ' aria-pressed="false"' : ''}>${icon ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>` : text}</button>`;
}

function mount({ form, textarea, workspace }) {
  if (!(form instanceof HTMLFormElement) || !(textarea instanceof HTMLTextAreaElement) || !(workspace instanceof HTMLElement)) return null;
  const richHost = workspace.querySelector('[data-rich-editor]');
  const toolbar = workspace.querySelector('[data-writing-toolbar]');
  const sourceHost = workspace.querySelector('[data-source-editor]') || textarea.closest('label');
  const preview = workspace.querySelector('#article-preview');
  const footer = workspace.querySelector('[data-writing-footer]');
  if (!richHost || !toolbar || !sourceHost || !preview || !footer) return null;

  const id = `writing-${++editorSequence}`;
  const listeners = [];
  const originalReadOnly = textarea.readOnly;
  let editor;
  let destroyed = false;
  let busy = false;
  let composing = false;
  let writingSource = false;
  let hydrating = false;
  let sourceNeedsHydration = false;
  let richNeedsSync = false;
  let mode = 'source';
  let protectedReason = sourceProtection(textarea.value);
  let lastSelection = null;
  let lastSourceSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  let uploadOnSelection = false;
  let compositionTimer = 0;
  let previewTimer = 0;
  let initialFrame = 0;

  const listen = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };

  toolbar.classList.add('writing-toolbar');
  toolbar.innerHTML = `
    <div class="writing-toolbar-top">
      <strong class="writing-label">正文</strong>
      <div class="writing-modes" role="group" aria-label="正文显示方式">
        <button type="button" data-writing-mode="rich" aria-pressed="false" aria-controls="${id}-rich">编辑</button>
        <button type="button" data-writing-mode="source" aria-pressed="true" aria-controls="${id}-source">源码</button>
        <button type="button" data-writing-mode="preview" aria-pressed="false" aria-controls="article-preview">预览</button>
      </div>
      ${toolButton('focus', '专注写作', { shortcut: 'Ctrl/⌘ Shift F', active: true })}
    </div>
    <div class="writing-formatbar" role="toolbar" aria-label="正文排版">
      <select class="writing-block-select" aria-label="段落样式" data-writing-block>
        <option value="paragraph">正文</option>
        <option value="1">一级标题</option><option value="2">二级标题</option><option value="3">三级标题</option>
        <option value="4">四级标题</option><option value="5">五级标题</option><option value="6">六级标题</option>
      </select>
      <span class="writing-tool-divider" aria-hidden="true"></span>
      ${toolButton('bold', '加粗', { shortcut: 'Ctrl/⌘ B' })}${toolButton('italic', '斜体', { shortcut: 'Ctrl/⌘ I' })}${toolButton('strike', '删除线')}
      ${toolButton('code', '行内代码')}
      <span class="writing-tool-divider" aria-hidden="true"></span>
      ${toolButton('bulletList', '无序列表')}${toolButton('orderedList', '有序列表')}${toolButton('blockquote', '引用')}${toolButton('codeBlock', '代码块')}
      <span class="writing-tool-divider" aria-hidden="true"></span>
      ${toolButton('link', '插入或修改链接', { shortcut: 'Ctrl/⌘ K' })}${toolButton('image', '上传并插入图片', { active: false })}${toolButton('horizontalRule', '分割线', { active: false })}${toolButton('table', '插入表格', { active: false })}
      <span class="writing-tool-divider writing-history-divider" aria-hidden="true"></span>
      ${toolButton('undo', '撤销', { shortcut: 'Ctrl/⌘ Z', active: false })}${toolButton('redo', '重做', { shortcut: 'Ctrl/⌘ Shift Z', active: false })}
    </div>
    <div class="writing-table-tools" data-writing-table-tools hidden role="group" aria-label="表格操作">
      <span>表格</span><button type="button" data-writing-action="addRowAfter">下方加行</button><button type="button" data-writing-action="addColumnAfter">右侧加列</button><button type="button" data-writing-action="deleteRow">删除行</button><button type="button" data-writing-action="deleteColumn">删除列</button><button type="button" data-writing-action="deleteTable">删除表格</button>
    </div>`;
  footer.classList.add('writing-footer');
  footer.innerHTML = `<p class="writing-editor-status" data-writing-status role="status" aria-live="polite"></p><div class="writing-footer-meta"><span data-writing-count></span><span class="save-indicator">${form.dataset.unsaved === 'true' ? '未保存' : '已同步'}</span><button class="writing-focus-save" type="button" data-writing-save>保存文章</button></div>`;
  richHost.id = `${id}-rich`;
  textarea.id ||= `${id}-source`;
  toolbar.querySelector('[data-writing-mode="source"]').setAttribute('aria-controls', textarea.id);
  workspace.dataset.writingMode = 'source';
  const status = footer.querySelector('[data-writing-status]');
  const count = footer.querySelector('[data-writing-count]');
  const blockSelect = toolbar.querySelector('[data-writing-block]');
  const formatbar = toolbar.querySelector('.writing-formatbar');
  const tableTools = toolbar.querySelector('[data-writing-table-tools]');
  const saveButton = footer.querySelector('[data-writing-save]');
  const fileInput = form.querySelector('#article-asset-file');
  const uploadButton = form.querySelector('[data-action="upload-article-asset"]');

  const dialog = document.createElement('dialog');
  dialog.className = 'writing-link-dialog';
  dialog.setAttribute('aria-labelledby', `${id}-link-heading`);
  dialog.innerHTML = `<form method="dialog" class="writing-link-form">
    <h2 id="${id}-link-heading">编辑链接</h2>
    <label for="${id}-url">链接地址</label>
    <input id="${id}-url" name="address" type="text" inputmode="url" autocomplete="url" placeholder="https:// 或 /站内路径" required>
    <p class="writing-link-help">支持网页地址、站内路径和 #锚点。</p>
    <p class="writing-link-error" role="alert" hidden></p>
    <div class="writing-link-actions"><button type="button" data-link-remove>移除链接</button><button type="button" data-link-cancel>取消</button><button type="submit" class="writing-link-apply">应用链接</button></div>
  </form>`;
  document.body.append(dialog);
  const linkForm = dialog.querySelector('form');
  const urlInput = dialog.querySelector('input');
  const linkError = dialog.querySelector('.writing-link-error');

  function setStatus(message = '') {
    if (status.textContent !== message) status.textContent = message;
  }

  function updateCount() {
    const text = textarea.value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`#>*_~|\[\]{}]/g, '');
    const han = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)?.length || 0;
    const words = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
    const total = han + words;
    count.textContent = `${total.toLocaleString('zh-CN')} 字 · 约 ${Math.max(1, Math.ceil(han / 400 + words / 220))} 分钟`;
  }

  function rememberSelection() {
    if (mode === 'rich' && editor && !editor.isDestroyed) {
      const { from, to } = editor.state.selection;
      lastSelection = { from, to };
    } else if (mode === 'source') {
      lastSourceSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
    }
  }

  function chainAtSelection() {
    const chain = editor.chain().focus();
    if (lastSelection) {
      const end = editor.state.doc.content.size;
      chain.setTextSelection({ from: Math.min(lastSelection.from, end), to: Math.min(lastSelection.to, end) });
    }
    return chain;
  }

  function renderPreview() {
    clearTimeout(previewTimer);
    preview.innerHTML = markdownToHtml(textarea.value);
  }

  function syncRich() {
    if (!editor || destroyed || hydrating || protectedReason) return;
    if (composing || editor.view.composing) {
      richNeedsSync = true;
      return;
    }
    richNeedsSync = false;
    const markdown = editor.getMarkdown();
    if (markdown !== textarea.value) {
      writingSource = true;
      textarea.value = markdown;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      writingSource = false;
    }
    sourceNeedsHydration = false;
    updateCount();
    updateTools();
  }

  function hydrateRich() {
    if (!editor || destroyed || protectedReason) return;
    hydrating = true;
    try {
      editor.commands.setContent(textarea.value, { contentType: 'markdown', emitUpdate: false });
      sourceNeedsHydration = false;
      lastSelection = null;
    } finally {
      hydrating = false;
    }
  }

  function updateTools() {
    if (destroyed) return;
    const canEditRich = Boolean(editor) && mode === 'rich' && !busy && !protectedReason;
    blockSelect.disabled = !canEditRich;
    for (const button of toolbar.querySelectorAll('[data-writing-action]')) {
      const action = button.dataset.writingAction;
      if (action === 'focus') continue;
      button.disabled = action === 'image' ? busy || mode === 'preview' || !fileInput || !uploadButton : !canEditRich;
      if (button.hasAttribute('aria-pressed')) button.setAttribute('aria-pressed', Boolean(editor && editor.isActive(action)).toString());
    }
    if (canEditRich) {
      toolbar.querySelector('[data-writing-action="undo"]').disabled = !editor.can().undo();
      toolbar.querySelector('[data-writing-action="redo"]').disabled = !editor.can().redo();
      blockSelect.value = editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph';
    }
    tableTools.hidden = !(mode === 'rich' && editor?.isActive('table'));
    formatbar.setAttribute('aria-disabled', canEditRich ? 'false' : 'true');
    const richMode = toolbar.querySelector('[data-writing-mode="rich"]');
    richMode.disabled = !editor || Boolean(protectedReason);
    richMode.title = protectedReason ? `${protectedReason}，请使用源码编辑` : '直接编辑正文';
    saveButton.disabled = busy;
    const actualSave = form.querySelector('button[type="submit"]');
    if (actualSave && !busy) saveButton.textContent = actualSave.textContent;
  }

  function updateModeStatus() {
    if (!editor) setStatus('可视化编辑器未能加载，可继续使用源码编辑。');
    else if (protectedReason) setStatus(`${protectedReason}，请使用源码编辑以保留原有内容。`);
    else if (mode === 'source') setStatus('Markdown 源码');
    else if (mode === 'preview') setStatus('预览采用文章页面的排版');
    else setStatus('支持 Markdown 快捷语法 · Ctrl/⌘ K 插入链接');
  }

  function setMode(next, { focus = false } = {}) {
    if (destroyed || composing || editor?.view.composing) return;
    if (next === 'rich' && (!editor || protectedReason)) return;
    rememberSelection();
    if (mode === 'rich' && richNeedsSync) syncRich();
    if (next === 'rich' && sourceNeedsHydration) {
      try { hydrateRich(); } catch { failToSource(); return; }
    }
    mode = next;
    workspace.dataset.writingMode = mode;
    richHost.hidden = mode !== 'rich';
    sourceHost.hidden = mode !== 'source';
    preview.hidden = mode !== 'preview';
    for (const button of toolbar.querySelectorAll('[data-writing-mode]')) button.setAttribute('aria-pressed', String(button.dataset.writingMode === mode));
    if (mode === 'preview') renderPreview();
    updateModeStatus();
    updateTools();
    if (focus) {
      if (mode === 'rich') chainAtSelection().run();
      else if (mode === 'source') textarea.focus({ preventScroll: true });
      else { preview.tabIndex = -1; preview.focus({ preventScroll: true }); }
    }
  }

  function setFocused(focused) {
    workspace.classList.toggle('is-focused', focused);
    toolbar.querySelector('[data-writing-action="focus"]').setAttribute('aria-pressed', String(focused));
    toolbar.querySelector('[data-writing-action="focus"]').setAttribute('aria-label', focused ? '退出专注写作' : '专注写作');
    if (focused) document.body.classList.add('has-writing-focus');
    else if (!document.querySelector('.writing-workspace.is-focused')) document.body.classList.remove('has-writing-focus');
  }

  function failToSource() {
    if (editor && !editor.isDestroyed) editor.destroy();
    editor = null;
    richHost.innerHTML = '';
    sourceNeedsHydration = false;
    setMode('source');
  }

  function writeSourceToken(token) {
    const start = Math.min(lastSourceSelection.start, textarea.value.length);
    const end = Math.min(lastSourceSelection.end, textarea.value.length);
    textarea.setRangeText(token, start, end, 'end');
    lastSourceSelection = { start: textarea.selectionStart, end: textarea.selectionEnd };
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus({ preventScroll: true });
  }

  function closeLink() {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function openLink() {
    if (busy || mode === 'preview' || (mode === 'rich' && (!editor || protectedReason))) return;
    rememberSelection();
    urlInput.value = mode === 'rich' ? editor.getAttributes('link').href || '' : '';
    linkError.hidden = true;
    dialog.querySelector('[data-link-remove]').hidden = mode !== 'rich' || !editor.isActive('link');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    urlInput.focus();
    urlInput.select();
  }

  function runAction(action) {
    if (action === 'focus') { setFocused(!workspace.classList.contains('is-focused')); return; }
    if (busy) return;
    rememberSelection();
    if (action === 'image') {
      if (!fileInput || !uploadButton || mode === 'preview') return;
      uploadOnSelection = true;
      fileInput.click();
      return;
    }
    if (action === 'link') { openLink(); return; }
    if (mode !== 'rich' || !editor || protectedReason) return;
    if (action === 'undo' || action === 'redo') {
      if (action === 'undo') editor.commands.undo();
      else editor.commands.redo();
      editor.commands.focus();
      rememberSelection();
      updateTools();
      return;
    }
    const chain = chainAtSelection();
    const methods = { bold: 'toggleBold', italic: 'toggleItalic', strike: 'toggleStrike', code: 'toggleCode', bulletList: 'toggleBulletList', orderedList: 'toggleOrderedList', blockquote: 'toggleBlockquote', codeBlock: 'toggleCodeBlock', horizontalRule: 'setHorizontalRule', addRowAfter: 'addRowAfter', addColumnAfter: 'addColumnAfter', deleteRow: 'deleteRow', deleteColumn: 'deleteColumn', deleteTable: 'deleteTable' };
    if (action === 'table') chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    else if (methods[action]) chain[methods[action]]().run();
    rememberSelection();
    updateTools();
  }

  listen(toolbar, 'pointerdown', (event) => {
    const button = event.target.closest('button[data-writing-action]');
    if (!button) return;
    rememberSelection();
    if (event.pointerType !== 'touch') event.preventDefault();
  });
  listen(toolbar, 'click', (event) => {
    const modeButton = event.target.closest('button[data-writing-mode]');
    if (modeButton) { setMode(modeButton.dataset.writingMode, { focus: true }); return; }
    const actionButton = event.target.closest('[data-writing-action]');
    if (actionButton && !actionButton.disabled) runAction(actionButton.dataset.writingAction);
  });
  listen(blockSelect, 'pointerdown', rememberSelection);
  listen(blockSelect, 'change', () => {
    if (busy || mode !== 'rich' || !editor) return;
    const chain = chainAtSelection();
    if (blockSelect.value === 'paragraph') chain.setParagraph().run();
    else chain.setHeading({ level: Number(blockSelect.value) }).run();
    updateTools();
  });
  listen(fileInput, 'pointerdown', rememberSelection);
  listen(uploadButton, 'pointerdown', rememberSelection);
  listen(fileInput, 'change', () => {
    if (!uploadOnSelection) return;
    uploadOnSelection = false;
    if (fileInput.files?.length && !busy) uploadButton?.click();
  });
  listen(fileInput, 'cancel', () => { uploadOnSelection = false; });
  listen(textarea, 'select', () => { if (mode === 'source') rememberSelection(); });
  listen(textarea, 'keyup', () => { if (mode === 'source') rememberSelection(); });
  listen(textarea, 'click', () => { if (mode === 'source') rememberSelection(); });
  listen(textarea, 'input', () => {
    if (writingSource || destroyed) return;
    protectedReason = sourceProtection(textarea.value);
    sourceNeedsHydration = true;
    richNeedsSync = false;
    updateCount();
    if (mode === 'rich') {
      if (protectedReason) setMode('source');
      else if (!composing) { try { hydrateRich(); } catch { failToSource(); } }
    }
    if (mode === 'preview') {
      clearTimeout(previewTimer);
      previewTimer = window.setTimeout(renderPreview, 100);
    }
    updateModeStatus();
    updateTools();
  });
  listen(workspace, 'compositionstart', () => { composing = true; });
  listen(workspace, 'compositionend', () => {
    composing = false;
    clearTimeout(compositionTimer);
    compositionTimer = window.setTimeout(() => {
      if (destroyed) return;
      if (mode === 'rich' && richNeedsSync) syncRich();
      else if (mode === 'rich' && sourceNeedsHydration && !protectedReason) hydrateRich();
    }, 0);
  });
  listen(form, 'submit', () => { if (richNeedsSync && !composing) syncRich(); }, true);
  listen(form, 'invalid', () => { if (workspace.classList.contains('is-focused')) setFocused(false); }, true);
  listen(saveButton, 'click', () => {
    if (busy) return;
    const submitter = form.querySelector('button[type="submit"]');
    form.requestSubmit(submitter || undefined);
  });
  listen(document, 'keydown', (event) => {
    if (event.isComposing || composing || destroyed) return;
    const modalOpen = Boolean(document.querySelector('dialog[open]'));
    if (event.key === 'Escape' && !modalOpen && workspace.classList.contains('is-focused')) { setFocused(false); return; }
    if (event.key === 'Tab' && workspace.classList.contains('is-focused') && !modalOpen && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const controls = [...workspace.querySelectorAll('button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]')].filter((control) => {
        if (control.matches(':disabled, [aria-disabled="true"], input[type="hidden"]') || control.closest('[hidden], [inert]')) return false;
        if (control.hasAttribute('tabindex') && control.tabIndex < 0) return false;
        return control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden';
      });
      if (controls.length) {
        event.preventDefault();
        const index = controls.indexOf(document.activeElement);
        const next = index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        controls[next].focus({ preventScroll: false });
      }
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || !workspace.contains(document.activeElement)) return;
    if (event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setFocused(!workspace.classList.contains('is-focused')); }
    else if (event.shiftKey && event.key.toLowerCase() === 'm') { event.preventDefault(); setMode(mode === 'source' ? 'rich' : 'source', { focus: true }); }
    else if (event.key.toLowerCase() === 'k' && !event.shiftKey) { event.preventDefault(); openLink(); }
  });
  listen(richHost, 'click', (event) => { if (event.target.closest('a')) event.preventDefault(); });
  listen(preview, 'click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    event.preventDefault();
    const address = safeAddress(anchor.getAttribute('href'));
    if (address && !address.startsWith('#')) window.open(address, '_blank', 'noopener,noreferrer');
  });
  listen(linkForm, 'submit', (event) => {
    event.preventDefault();
    if (busy || destroyed) return;
    const address = safeAddress(urlInput.value);
    if (!address) {
      linkError.textContent = '请输入有效的 http(s) 地址、/站内路径或 #锚点。';
      linkError.hidden = false;
      urlInput.focus();
      return;
    }
    closeLink();
    if (mode === 'rich' && editor) {
      const existingLink = editor.isActive('link');
      if (lastSelection && lastSelection.from === lastSelection.to && !existingLink) {
        chainAtSelection().insertContent({ type: 'text', text: address, marks: [{ type: 'link', attrs: { href: address } }] }).run();
      } else chainAtSelection().extendMarkRange('link').setLink({ href: address }).run();
    }
    else if (mode === 'source') {
      const label = textarea.value.slice(lastSourceSelection.start, lastSourceSelection.end).replace(/[\\[\]]/g, '\\$&') || '链接文字';
      writeSourceToken(`[${label}](${address.replace(/\(/g, '%28').replace(/\)/g, '%29')})`);
    }
  });
  listen(dialog.querySelector('[data-link-cancel]'), 'click', closeLink);
  listen(dialog.querySelector('[data-link-remove]'), 'click', () => {
    if (busy || !editor) return;
    closeLink();
    chainAtSelection().extendMarkRange('link').unsetLink().run();
  });
  listen(dialog, 'close', () => {
    if (destroyed) return;
    if (mode === 'rich' && editor) chainAtSelection().run();
    else if (mode === 'source') textarea.focus({ preventScroll: true });
  });

  try {
    editor = new Editor({
      element: richHost,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          underline: false,
          trailingNode: false,
          link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: (url) => Boolean(safeAddress(url)), HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
        }),
        Markdown,
        SafeImage.configure({ allowBase64: false, HTMLAttributes: { loading: 'lazy' } }),
        TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
        Placeholder.configure({ placeholder: '从这里开始写。选中文字可排版，也可输入 Markdown 快捷语法。' }),
      ],
      content: protectedReason ? '' : textarea.value,
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'writing-document', role: 'textbox', 'aria-label': '文章正文', 'aria-multiline': 'true', spellcheck: 'true' },
        transformPastedHTML: cleanPastedHtml,
        handlePaste: () => busy,
        handleDrop: () => busy,
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged || hydrating || destroyed) return;
        richNeedsSync = true;
        syncRich();
      },
      onSelectionUpdate: () => { rememberSelection(); updateTools(); },
      onTransaction: () => { if (editor) updateTools(); },
    });
    workspace.dataset.writingReady = 'true';
    sourceNeedsHydration = Boolean(protectedReason);
    setMode(protectedReason ? 'source' : 'rich');
  } catch {
    failToSource();
  }
  updateCount();
  updateModeStatus();
  updateTools();
  initialFrame = requestAnimationFrame(() => { if (!destroyed) updateTools(); });

  return {
    destroy() {
      if (destroyed) return;
      if (richNeedsSync && !composing) syncRich();
      destroyed = true;
      clearTimeout(compositionTimer);
      clearTimeout(previewTimer);
      cancelAnimationFrame(initialFrame);
      for (const remove of listeners) remove();
      setFocused(false);
      if (dialog.open) closeLink();
      dialog.remove();
      if (editor && !editor.isDestroyed) editor.destroy();
      textarea.readOnly = originalReadOnly;
      sourceHost.hidden = false;
      richHost.hidden = true;
      preview.hidden = true;
      toolbar.replaceChildren();
      footer.replaceChildren();
      delete workspace.dataset.writingReady;
      delete workspace.dataset.writingMode;
    },
    setBusy(value) {
      busy = Boolean(value);
      textarea.readOnly = busy || originalReadOnly;
      workspace.setAttribute('aria-busy', String(busy));
      if (editor && !editor.isDestroyed) editor.setEditable(!busy, false);
      if (busy && dialog.open) closeLink();
      updateTools();
    },
    insertImage({ src, alt = '', title = '' }) {
      if (destroyed) return false;
      const address = safeAddress(src, { image: true });
      if (!address) { setStatus('图片地址无效，正文未改动。'); return false; }
      if (mode === 'rich' && editor && !protectedReason) {
        const result = chainAtSelection().setImage({ src: address, alt: String(alt), title: String(title) }).run();
        rememberSelection();
        return result;
      }
      const escapeLabel = (value) => String(value).replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
      const start = Math.min(lastSourceSelection.start, textarea.value.length);
      const end = Math.min(lastSourceSelection.end, textarea.value.length);
      const before = textarea.value.slice(0, start);
      const after = textarea.value.slice(end);
      const prefix = before && !before.endsWith('\n\n') ? before.endsWith('\n') ? '\n' : '\n\n' : '';
      const suffix = after && !after.startsWith('\n\n') ? after.startsWith('\n') ? '\n' : '\n\n' : '';
      const escapedTitle = String(title).replace(/[\\"]/g, '\\$&').replace(/[\r\n]/g, ' ');
      const token = `![${escapeLabel(alt)}](${address.replace(/\(/g, '%28').replace(/\)/g, '%29')}${escapedTitle ? ` "${escapedTitle}"` : ''})`;
      writeSourceToken(`${prefix}${token}${suffix}`);
      return true;
    },
    focus() {
      if (destroyed) return;
      if (mode === 'rich' && editor) chainAtSelection().run();
      else if (mode === 'source') textarea.focus({ preventScroll: true });
      else { preview.tabIndex = -1; preview.focus({ preventScroll: true }); }
    },
  };
}

window.WTAArticleEditor = { mount, renderMarkdown: markdownToHtml };
