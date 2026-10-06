import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('./assets/app-item4-0625.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../studio-api/worker.js', import.meta.url), 'utf8');
function section(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const loader = section(app, '  async function loadItem4Workspace(', '  function item4UploadFileExtension');
function harness(api, extra = {}) {
  const context = vm.createContext({
    activeProductionRequest: { id: 'recA' }, item4WorkspaceRequestId: 'recA',
    item4WorkspaceRevision: 0, item4WorkspaceLoadSequence: 0,
    item4Workspace: { assets: [{ id: 'b', order: 1 }, { id: 'a', order: 2 }] },
    item4PendingRemoves: new Set(), item4ReorderBusy: false,
    mergeItem4WorkspaceStatus: x => x, api,
    renderItem4Workspace(status) { context.item4Workspace = status; },
    syncPrMediaKindUi() {}, syncItem4AiGenerationUi() {}, maybeGenerateItem4AiImages() {},
    ezIsOriginRecord: () => false, ezAutoPlanAfterUpload: false, ezStarting: false,
    renderItem4Variants() {}, console, ...extra,
  });
  vm.runInContext(loader, context);
  return context;
}
test('status refresh preserves manual membership and order while enriching existing previews', async () => {
  const c = harness(async () => ({ assets: [{ id: 'a', order: 1, preview_url: 'new' }, { id: 'deleted', order: 2 }, { id: 'b', order: 3 }] }));
  await c.loadItem4Workspace();
  assert.equal(JSON.stringify(c.item4Workspace.assets.map(x => x.id)), '["b","a"]');
  assert.equal(c.item4Workspace.assets[1].order, 2);
  assert.equal(c.item4Workspace.assets[1].preview_url, 'new');
});
test('a response started before deletion is discarded even after DELETE finishes', async () => {
  let resolve;
  const c = harness(() => new Promise(r => { resolve = r; }));
  const pending = c.loadItem4Workspace();
  c.item4WorkspaceRevision++;
  c.item4Workspace.assets = [];
  resolve({ assets: [{ id: 'a' }, { id: 'b' }] });
  await pending;
  assert.equal(c.item4Workspace.assets.length, 0);
});
test('response for previous Production request cannot replace current editor', async () => {
  let resolve;
  const c = harness(() => new Promise(r => { resolve = r; }));
  const pending = c.loadItem4Workspace();
  c.activeProductionRequest = { id: 'recB' };
  resolve({ assets: [{ id: 'wrong' }] });
  await pending;
  assert.equal(c.item4Workspace.assets[0].id, 'b');
});
test('explicit library Apply can change membership', async () => {
  const c = harness(async () => ({ assets: [{ id: 'chosen', order: 1 }] }));
  await c.loadItem4Workspace(c.activeProductionRequest, { allowAssetChanges: true });
  assert.equal(c.item4Workspace.assets[0].id, 'chosen');
});
test('late variant enrichment cannot restore an asset deleted after status arrived', async () => {
  let resolve;
  const c = harness(async url => url.endsWith('/variants') ? new Promise(r => { resolve = r; })
    : { assets: [{ id: 'a' }, { id: 'b' }], variant_status: 'Ready' });
  await c.loadItem4Workspace();
  await Promise.resolve();
  c.item4WorkspaceRevision++;
  c.item4Workspace.assets = [];
  resolve({ manifest: { stale: true } });
  await new Promise(r => setImmediate(r));
  assert.equal(c.item4Workspace.assets.length, 0);
});
test('library search retains unchecked attachments', async () => {
  const src = section(app, '  async function loadItem4LibraryStills(', '  async function openItem4LibraryPicker');
  const c = vm.createContext({ item4LibraryLoadSequence: 0, activeProductionRequest: {id:'recA'}, activeIdea:null,
    $:()=>null, item4AttachedLibraryItems:()=>[{id:'a'}], fetchLibraryBrowse:async()=>[{id:'a'}],
    mergeLibraryPickerItems:(_s,_m,rows)=>rows, item4LibrarySelected:new Set(), renderItem4LibraryPicker(){},
    libraryItemsForQuotedName:(items)=> ({ phrase: "", items }),
  });
  vm.runInContext(src,c); await c.loadItem4LibraryStills();
  assert.equal(c.item4LibrarySelected.size,0);
});
test('automatic match completing after manual stop never writes the manifest', async () => {
  const src = section(worker,'async function applyLibraryAssetsToProductionRequest(', 'async function evaluateAndMaybeAttachWaitingIdeaPhotos');
  let writes=0;
  const latest={fields:{Production_Notes:'ez-photo-wait=off'},assets:[]};
  const c=vm.createContext({item4AssetManifest:r=>r.assets, airtableFetch:async()=>latest,
    PRODUCTION_REQUEST_TABLE:'requests',firstLinkedRecordId:()=>null,f:(r,k)=>r.fields?.[k],
    productionPhotoWaitAutoOff:notes=>notes==='ez-photo-wait=off',item4UpdateRequestState:()=>{writes++;}});
  vm.runInContext(src,c);
  const result=await c.applyLibraryAssetsToProductionRequest({}, {id:'recA',assets:[{id:'removed'}]}, []);
  assert.equal(result.skipped,true);assert.equal(writes,0);assert.equal(result.assets.length,0);
});
