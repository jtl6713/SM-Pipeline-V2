// Presentation-only: replace opaque asset IDs in Production slide cards.
(() => {
  const list = document.getElementById('creativeSlidesList');
  if (!list) return;
  const guid = /^(?:[a-f0-9]{16,}|[a-f0-9]{8}-[a-f0-9-]{20,})$/i;
  let busy = false;
  function update() {
    if (busy) return;
    busy = true;
    try {
      for (const node of list.querySelectorAll('*')) {
        if (node.children.length || node.closest('button,select,textarea,input,[contenteditable="true"]')) continue;
        const value = (node.textContent || '').trim();
        if (!guid.test(value)) continue;
        const card = node.closest('.creative-slide-card, .creative-slide-item, [data-slide-id]') || node.parentElement?.parentElement;
        const title = card?.querySelector('strong,h4,h3,.creative-slide-title')?.textContent || card?.textContent?.slice(0,120) || '';
        const number = title.match(/(?:^|\s)(\d+)\s*$/);
        const isVideo = /\b(video|clip)\b/i.test(title);
        const label = (isVideo ? 'Video' : 'Photo') + (number ? ' · Asset #' + number[1] : ' · Media asset');
        node.textContent = label;
        node.title = 'Internal asset ID: ' + value;
      }
    } finally { busy = false; }
  }
  new MutationObserver(update).observe(list, {childList:true,subtree:true});
  update();
})();